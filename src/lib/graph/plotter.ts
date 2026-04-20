import type { CompiledFn } from './parser';

export interface PlotSample {
  x: number;
  y: number;
}

export interface PlotOptions {
  xRange: [number, number];
  yRange: [number, number];
  /**
   * Upper bound on total sample count (seed + adaptive midpoints). Acts as a
   * budget: curvy regions use more of it, flat regions use less.
   */
  samples: number;
  /**
   * Multiplier on the y-range used to clip values. Points whose |y| exceeds
   * this multiple of the visible range are treated as off-screen and break
   * the polyline. Defaults to 2.
   */
  clipMultiplier?: number;
  /**
   * Minimum absolute jump (in y-units) that, combined with a sign change,
   * signals an asymptote between two samples. Defaults to 4× the y-range.
   */
  jumpMultiplier?: number;
  /**
   * Midpoint-deviation threshold expressed as a fraction of the visible
   * y-range. Adjacent pairs whose true midpoint drifts more than
   * `curvatureTol * yHeight` from the linearly interpolated midpoint are
   * subdivided further. Defaults to 0.0005 (~0.05% of the view).
   */
  curvatureTol?: number;
  /**
   * Slope-change threshold used to catch sharp corners where the midpoint
   * deviation is small but adjacent chord slopes differ sharply. Expressed
   * as a fraction of the view's aspect (yHeight/xWidth). Defaults to 0.05.
   */
  slopeChangeTol?: number;
}

interface Budget {
  count: number;
  readonly max: number;
}

const MAX_SUBDIVIDE_DEPTH = 20;

/**
 * Recursive midpoint subdivision. Inserts a sample at the midpoint of
 * `[xa, xb]` when the function there deviates significantly from the chord
 * `(xa, ya)-(xb, yb)`, then recurses on each half. Non-finite endpoints also
 * trigger subdivision so discontinuities get localized before the assembly
 * pass chops the polyline.
 */
function subdivide(
  fn: CompiledFn,
  xa: number,
  ya: number,
  xb: number,
  yb: number,
  tol: number,
  slopeTol: number,
  minDx: number,
  depth: number,
  budget: Budget,
  out: PlotSample[],
): void {
  if (budget.count >= budget.max || depth <= 0) return;
  const dx = xb - xa;
  if (Math.abs(dx) < minDx) return;

  const xm = (xa + xb) / 2;
  // Float rounding can collapse the midpoint onto an endpoint for tiny
  // intervals; further subdivision would divide by zero.
  if (xm === xa || xm === xb) return;
  const ym = fn(xm);

  const finiteA = Number.isFinite(ya);
  const finiteB = Number.isFinite(yb);
  const finiteM = Number.isFinite(ym);

  let shouldSplit: boolean;
  if (!finiteA || !finiteB || !finiteM) {
    shouldSplit = true;
  } else {
    const linearMid = (ya + yb) / 2;
    const dev = Math.abs(ym - linearMid);
    const halfDx = xm - xa;
    if (halfDx === 0) return;
    const slopeChange = Math.abs((yb - ym) / halfDx - (ym - ya) / halfDx);
    shouldSplit = dev > tol || slopeChange > slopeTol;
  }

  if (!shouldSplit) return;

  subdivide(fn, xa, ya, xm, ym, tol, slopeTol, minDx, depth - 1, budget, out);
  if (budget.count >= budget.max) return;
  out.push({ x: xm, y: ym });
  budget.count += 1;
  subdivide(fn, xm, ym, xb, yb, tol, slopeTol, minDx, depth - 1, budget, out);
}

/**
 * Adaptively sample `fn` across `xRange` and return continuous polyline
 * segments. A coarse uniform seed is refined by recursive midpoint
 * subdivision so curvature-dense regions get more samples and flat regions
 * stay sparse. The total sample count never exceeds `samples`.
 *
 * The polyline breaks at:
 *   - non-finite values (NaN, ±Infinity)
 *   - values beyond the visible y-range scaled by `clipMultiplier`
 *   - large magnitude jumps across a sign change (asymptotes like tan(x))
 */
export function plotFunction(fn: CompiledFn, opts: PlotOptions): PlotSample[][] {
  const { xRange, yRange, samples } = opts;
  const clipMul = opts.clipMultiplier ?? 2;
  const jumpMul = opts.jumpMultiplier ?? 4;
  const curvatureTol = opts.curvatureTol ?? 0.0005;
  const slopeChangeTol = opts.slopeChangeTol ?? 0.05;

  if (samples < 2) return [];

  const [x0, x1] = xRange;
  const [y0, y1] = yRange;
  const xWidth = x1 - x0;
  const yHeight = y1 - y0;
  const yCenter = (y0 + y1) / 2;
  const yClip = (yHeight / 2) * clipMul;
  const jumpThreshold = yHeight * jumpMul;
  const tol = Math.abs(yHeight) * curvatureTol;
  const slopeTol =
    xWidth === 0 ? Infinity : (Math.abs(yHeight) / Math.abs(xWidth)) * slopeChangeTol;
  const minDx = Math.abs(xWidth) * 1e-9;

  const seedCount = Math.min(samples, Math.max(8, Math.ceil(samples / 8) + 1));
  const budget: Budget = { count: seedCount, max: samples };

  const seedXs: number[] = [];
  const seedYs: number[] = [];
  for (let i = 0; i < seedCount; i += 1) {
    const t = i / (seedCount - 1);
    const x = x0 + t * (x1 - x0);
    seedXs.push(x);
    seedYs.push(fn(x));
  }

  const all: PlotSample[] = [];
  all.push({ x: seedXs[0], y: seedYs[0] });
  for (let i = 1; i < seedCount; i += 1) {
    subdivide(
      fn,
      seedXs[i - 1],
      seedYs[i - 1],
      seedXs[i],
      seedYs[i],
      tol,
      slopeTol,
      minDx,
      MAX_SUBDIVIDE_DEPTH,
      budget,
      all,
    );
    all.push({ x: seedXs[i], y: seedYs[i] });
  }

  const segments: PlotSample[][] = [];
  let current: PlotSample[] = [];
  let prevY: number | null = null;

  const pushBreak = () => {
    if (current.length > 0) segments.push(current);
    current = [];
    prevY = null;
  };

  for (const sample of all) {
    const { y } = sample;
    if (!Number.isFinite(y)) {
      pushBreak();
      continue;
    }
    if (Math.abs(y - yCenter) > yClip) {
      pushBreak();
      continue;
    }
    if (prevY !== null) {
      const jump = Math.abs(y - prevY);
      if (jump > jumpThreshold && Math.sign(y) !== Math.sign(prevY)) {
        pushBreak();
      }
    }
    current.push(sample);
    prevY = y;
  }
  if (current.length > 0) segments.push(current);
  return segments;
}
