import type { CompiledFnXY } from './parser';

export interface ImplicitSegment {
  a: { x: number; y: number };
  b: { x: number; y: number };
}

export interface ImplicitOptions {
  xRange: [number, number];
  yRange: [number, number];
  /** Cells along the x-axis. Cells along y scale to preserve aspect. */
  resolution: number;
}

/**
 * Trace `fn(x, y) = 0` with marching squares. Returns short line segments
 * in graph-space; callers stitch them into polylines if desired.
 *
 * Cell corners are labelled:
 *   3---2
 *   |   |
 *   0---1
 * and a 4-bit mask (LSB = corner 0) selects the segment topology. The two
 * ambiguous cases (5 and 10) are disambiguated by the sign of the cell
 * centre to avoid the classic "saddle crossover" artifact.
 */
export const MAX_IMPLICIT_CELLS = 400_000;

export function marchingSquares(fn: CompiledFnXY, opts: ImplicitOptions): ImplicitSegment[] {
  const { xRange, yRange, resolution } = opts;
  const [x0, x1] = xRange;
  const [y0, y1] = yRange;
  const xSpan = x1 - x0;
  const ySpan = y1 - y0;
  if (xSpan <= 0 || ySpan <= 0) return [];
  let nx = Math.max(2, Math.floor(resolution));
  let ny = Math.max(2, Math.floor((resolution * ySpan) / xSpan));
  if (nx * ny > MAX_IMPLICIT_CELLS) {
    const scale = Math.sqrt(MAX_IMPLICIT_CELLS / (nx * ny));
    nx = Math.max(2, Math.floor(nx * scale));
    ny = Math.max(2, Math.floor(ny * scale));
    if (nx * ny > MAX_IMPLICIT_CELLS) {
      if (nx >= ny) nx = Math.max(2, Math.floor(MAX_IMPLICIT_CELLS / ny));
      else ny = Math.max(2, Math.floor(MAX_IMPLICIT_CELLS / nx));
    }
  }
  const dx = xSpan / nx;
  const dy = ySpan / ny;

  const rows = ny + 1;
  const cols = nx + 1;
  const values = new Float64Array(rows * cols);
  for (let j = 0; j <= ny; j += 1) {
    const y = y0 + j * dy;
    for (let i = 0; i <= nx; i += 1) {
      const x = x0 + i * dx;
      values[j * cols + i] = fn(x, y);
    }
  }

  const segments: ImplicitSegment[] = [];
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const v0 = values[j * cols + i];
      const v1 = values[j * cols + (i + 1)];
      const v2 = values[(j + 1) * cols + (i + 1)];
      const v3 = values[(j + 1) * cols + i];
      if (
        !Number.isFinite(v0) ||
        !Number.isFinite(v1) ||
        !Number.isFinite(v2) ||
        !Number.isFinite(v3)
      ) {
        continue;
      }

      let mask = 0;
      if (v0 > 0) mask |= 1;
      if (v1 > 0) mask |= 2;
      if (v2 > 0) mask |= 4;
      if (v3 > 0) mask |= 8;
      if (mask === 0 || mask === 15) continue;

      const cx = x0 + (i + 0.5) * dx;
      const cy = y0 + (j + 0.5) * dy;
      const xl = x0 + i * dx;
      const xr = xl + dx;
      const yb = y0 + j * dy;
      const yt = yb + dy;

      const eBottom = () => ({ x: lerpZero(xl, xr, v0, v1), y: yb });
      const eRight = () => ({ x: xr, y: lerpZero(yb, yt, v1, v2) });
      const eTop = () => ({ x: lerpZero(xl, xr, v3, v2), y: yt });
      const eLeft = () => ({ x: xl, y: lerpZero(yb, yt, v0, v3) });

      const push = (a: { x: number; y: number }, b: { x: number; y: number }) => {
        segments.push({ a, b });
      };

      switch (mask) {
        case 1:
        case 14:
          push(eBottom(), eLeft());
          break;
        case 2:
        case 13:
          push(eBottom(), eRight());
          break;
        case 3:
        case 12:
          push(eLeft(), eRight());
          break;
        case 4:
        case 11:
          push(eRight(), eTop());
          break;
        case 6:
        case 9:
          push(eBottom(), eTop());
          break;
        case 7:
        case 8:
          push(eLeft(), eTop());
          break;
        case 5: {
          const cVal = fn(cx, cy);
          if (!Number.isFinite(cVal)) break;
          if (cVal > 0) {
            push(eBottom(), eRight());
            push(eLeft(), eTop());
          } else {
            push(eBottom(), eLeft());
            push(eRight(), eTop());
          }
          break;
        }
        case 10: {
          const cVal = fn(cx, cy);
          if (!Number.isFinite(cVal)) break;
          if (cVal > 0) {
            push(eBottom(), eLeft());
            push(eRight(), eTop());
          } else {
            push(eBottom(), eRight());
            push(eLeft(), eTop());
          }
          break;
        }
        default:
          break;
      }
    }
  }
  return segments;
}

function lerpZero(a: number, b: number, fa: number, fb: number): number {
  const denom = fa - fb;
  if (Math.abs(denom) < 1e-12) return (a + b) / 2;
  return a + ((b - a) * fa) / denom;
}

/**
 * Stitch independent segments into polylines by joining endpoints that share
 * (within an epsilon) a grid vertex. This is a simple greedy joiner and does
 * not guarantee minimal polyline count, but makes rendering far cheaper.
 */
export function stitchSegments(
  segments: ImplicitSegment[],
  eps: number = 1e-9,
): { x: number; y: number }[][] {
  const key = (p: { x: number; y: number }) => `${Math.round(p.x / eps)}:${Math.round(p.y / eps)}`;

  const buckets = new Map<string, number[]>();
  const used = new Uint8Array(segments.length);
  for (let i = 0; i < segments.length; i += 1) {
    for (const p of [segments[i].a, segments[i].b]) {
      const k = key(p);
      const list = buckets.get(k);
      if (list) list.push(i);
      else buckets.set(k, [i]);
    }
  }

  const findMate = (point: { x: number; y: number }, skip: number): number | undefined => {
    const list = buckets.get(key(point));
    if (!list) return undefined;
    for (const idx of list) {
      if (idx !== skip && !used[idx]) return idx;
    }
    return undefined;
  };

  const polylines: { x: number; y: number }[][] = [];
  for (let i = 0; i < segments.length; i += 1) {
    if (used[i]) continue;
    used[i] = 1;
    const line = [segments[i].a, segments[i].b];
    let mate = findMate(line[line.length - 1], i);
    while (mate !== undefined) {
      used[mate] = 1;
      const { a, b } = segments[mate];
      const tail = line[line.length - 1];
      line.push(key(a) === key(tail) ? b : a);
      mate = findMate(line[line.length - 1], mate);
    }
    mate = findMate(line[0], i);
    while (mate !== undefined) {
      used[mate] = 1;
      const { a, b } = segments[mate];
      const head = line[0];
      line.unshift(key(a) === key(head) ? b : a);
      mate = findMate(line[0], mate);
    }
    polylines.push(line);
  }
  return polylines;
}
