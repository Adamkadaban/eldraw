import type { Point } from '$lib/types';

/**
 * Ramer-Douglas-Peucker simplification for point buffers.
 *
 * Runs at stroke-commit time to trim redundant samples the pointer pipeline
 * emitted (especially on slow/hovering pen moves) without visibly changing
 * the curve. Keeps endpoints; operates in 2D and preserves the original
 * Point metadata (pressure, t) for surviving samples.
 */
export function simplifyRdp(points: Point[], epsilon = 0.5): Point[] {
  if (points.length <= 2 || epsilon <= 0) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  rdp(points, 0, points.length - 1, epsilon * epsilon, keep);

  const out: Point[] = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
  return out;
}

function rdp(points: Point[], lo: number, hi: number, epsSq: number, keep: Uint8Array): void {
  if (hi - lo < 2) return;
  let maxSq = -1;
  let idx = -1;
  const a = points[lo];
  const b = points[hi];
  for (let i = lo + 1; i < hi; i++) {
    const d = perpSq(points[i], a, b);
    if (d > maxSq) {
      maxSq = d;
      idx = i;
    }
  }
  if (maxSq > epsSq && idx !== -1) {
    keep[idx] = 1;
    rdp(points, lo, idx, epsSq, keep);
    rdp(points, idx, hi, epsSq, keep);
  }
}

function perpSq(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) {
    const ex = p.x - a.x;
    const ey = p.y - a.y;
    return ex * ex + ey * ey;
  }
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  const tx = a.x + t * dx;
  const ty = a.y + t * dy;
  const ex = p.x - tx;
  const ey = p.y - ty;
  return ex * ex + ey * ey;
}
