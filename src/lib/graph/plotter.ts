import type { CompiledFn } from './parser';

export interface PlotSample {
  x: number;
  y: number;
}

export interface PlotOptions {
  xRange: [number, number];
  yRange: [number, number];
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
}

/**
 * Sample `fn` across `xRange` and return continuous polyline segments. The
 * polyline breaks at:
 *   - non-finite values (NaN, ±Infinity)
 *   - values beyond the visible y-range scaled by `clipMultiplier`
 *   - large magnitude jumps across a sign change (asymptotes like tan(x))
 */
export function plotFunction(fn: CompiledFn, opts: PlotOptions): PlotSample[][] {
  const { xRange, yRange, samples } = opts;
  const clipMul = opts.clipMultiplier ?? 2;
  const jumpMul = opts.jumpMultiplier ?? 4;

  if (samples < 2) return [];

  const [x0, x1] = xRange;
  const [y0, y1] = yRange;
  const yHeight = y1 - y0;
  const yCenter = (y0 + y1) / 2;
  const yClip = (yHeight / 2) * clipMul;
  const jumpThreshold = yHeight * jumpMul;

  const segments: PlotSample[][] = [];
  let current: PlotSample[] = [];
  let prevY: number | null = null;

  const pushBreak = () => {
    if (current.length > 0) segments.push(current);
    current = [];
    prevY = null;
  };

  for (let i = 0; i < samples; i += 1) {
    const t = i / (samples - 1);
    const x = x0 + t * (x1 - x0);
    const y = fn(x);

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
    current.push({ x, y });
    prevY = y;
  }
  if (current.length > 0) segments.push(current);
  return segments;
}
