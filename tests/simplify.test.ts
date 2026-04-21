import { describe, it, expect } from 'vitest';
import { simplifyRdp } from '$lib/canvas/simplify';
import type { Point } from '$lib/types';

function p(x: number, y: number, pressure = 0.5, t = 0): Point {
  return { x, y, pressure, t };
}

describe('simplifyRdp', () => {
  it('returns input unchanged when length <= 2', () => {
    expect(simplifyRdp([])).toEqual([]);
    const one = [p(1, 2)];
    expect(simplifyRdp(one)).toEqual(one);
    const two = [p(0, 0), p(5, 5)];
    expect(simplifyRdp(two)).toEqual(two);
  });

  it('collapses a dense straight line to just the endpoints', () => {
    const line: Point[] = [];
    for (let i = 0; i <= 100; i++) line.push(p(i, 0));
    const out = simplifyRdp(line, 0.5);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(line[0]);
    expect(out[1]).toEqual(line[line.length - 1]);
  });

  it('preserves endpoints for a curve', () => {
    const pts: Point[] = [];
    for (let i = 0; i <= 50; i++) pts.push(p(i, Math.sin(i / 5) * 20));
    const out = simplifyRdp(pts, 0.5);
    expect(out[0]).toEqual(pts[0]);
    expect(out[out.length - 1]).toEqual(pts[pts.length - 1]);
  });

  it('stays within epsilon of the original curve', () => {
    const pts: Point[] = [];
    for (let i = 0; i <= 200; i++) pts.push(p(i, Math.sin(i / 10) * 30));
    const eps = 0.5;
    const out = simplifyRdp(pts, eps);

    for (const orig of pts) {
      let best = Infinity;
      for (let j = 0; j < out.length - 1; j++) {
        const d = distToSegment(orig, out[j], out[j + 1]);
        if (d < best) best = d;
      }
      expect(best).toBeLessThanOrEqual(eps + 1e-6);
    }
  });

  it('drops strictly colinear interior points', () => {
    const pts = [p(0, 0), p(1, 0), p(2, 0), p(3, 0), p(4, 1)];
    const out = simplifyRdp(pts, 0.1);
    expect(out.some((q) => q.x === 0 && q.y === 0)).toBe(true);
    expect(out.some((q) => q.x === 3 && q.y === 0)).toBe(true);
    expect(out.some((q) => q.x === 4 && q.y === 1)).toBe(true);
    expect(out.length).toBeLessThan(pts.length);
  });

  it('preserves surviving sample metadata (pressure, t)', () => {
    const pts = [p(0, 0, 0.1, 0), p(100, 0, 0.9, 100), p(200, 100, 0.5, 200)];
    const out = simplifyRdp(pts, 0.5);
    expect(out[0]).toEqual(pts[0]);
    expect(out[out.length - 1]).toEqual(pts[pts.length - 1]);
  });

  it('epsilon <= 0 is a no-op', () => {
    const pts = [p(0, 0), p(1, 0.001), p(2, 0), p(3, 0)];
    expect(simplifyRdp(pts, 0)).toEqual(pts);
    expect(simplifyRdp(pts, -1)).toEqual(pts);
  });
});

function distToSegment(p0: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p0.x - a.x, p0.y - a.y);
  let t = ((p0.x - a.x) * dx + (p0.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p0.x - (a.x + t * dx), p0.y - (a.y + t * dy));
}
