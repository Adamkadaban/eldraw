import { describe, expect, it } from 'vitest';
import { MAX_IMPLICIT_CELLS, marchingSquares, stitchSegments } from '$lib/graph/implicit';

const circle = (r: number) => (x: number, y: number) => x * x + y * y - r * r;
const hyperbola = (x: number, y: number) => x * y - 1;

describe('marchingSquares', () => {
  it('traces a closed loop for x^2 + y^2 = 1', () => {
    const segs = marchingSquares(circle(1), {
      xRange: [-2, 2],
      yRange: [-2, 2],
      resolution: 64,
    });
    expect(segs.length).toBeGreaterThan(32);
    for (const s of segs) {
      const da = Math.hypot(s.a.x, s.a.y);
      const db = Math.hypot(s.b.x, s.b.y);
      expect(Math.abs(da - 1)).toBeLessThan(0.1);
      expect(Math.abs(db - 1)).toBeLessThan(0.1);
    }
  });

  it('returns no segments when the function has constant sign', () => {
    const segs = marchingSquares((x, y) => x * x + y * y + 1, {
      xRange: [-1, 1],
      yRange: [-1, 1],
      resolution: 16,
    });
    expect(segs.length).toBe(0);
  });

  it('traces two branches of a hyperbola', () => {
    const segs = marchingSquares(hyperbola, {
      xRange: [-3, 3],
      yRange: [-3, 3],
      resolution: 64,
    });
    const positive = segs.filter((s) => s.a.x > 0 && s.b.x > 0).length;
    const negative = segs.filter((s) => s.a.x < 0 && s.b.x < 0).length;
    expect(positive).toBeGreaterThan(4);
    expect(negative).toBeGreaterThan(4);
  });

  it('honours aspect ratio when y-range is taller than x-range', () => {
    const segs = marchingSquares(circle(1), {
      xRange: [-1, 1],
      yRange: [-2, 2],
      resolution: 32,
    });
    expect(segs.length).toBeGreaterThan(0);
  });

  it('skips cells that contain non-finite samples', () => {
    const segs = marchingSquares((x, y) => (x === 0 && y === 0 ? NaN : x * x + y * y - 1), {
      xRange: [-2, 2],
      yRange: [-2, 2],
      resolution: 16,
    });
    expect(segs.length).toBeGreaterThan(0);
  });

  it('caps total cells for extreme aspect ratios', () => {
    let calls = 0;
    const fn = (x: number, y: number) => {
      calls += 1;
      return x * x + y * y - 1;
    };
    marchingSquares(fn, {
      xRange: [-1, 1],
      yRange: [-1e6, 1e6],
      resolution: 2000,
    });
    expect(calls).toBeLessThan(MAX_IMPLICIT_CELLS * 2);
  });
});

describe('stitchSegments', () => {
  it('joins touching segments into a single polyline', () => {
    const segs = [
      { a: { x: 0, y: 0 }, b: { x: 1, y: 0 } },
      { a: { x: 1, y: 0 }, b: { x: 2, y: 0 } },
      { a: { x: 2, y: 0 }, b: { x: 3, y: 0 } },
    ];
    const polys = stitchSegments(segs);
    expect(polys.length).toBe(1);
    expect(polys[0].length).toBe(4);
  });

  it('keeps disconnected segments separate', () => {
    const segs = [
      { a: { x: 0, y: 0 }, b: { x: 1, y: 0 } },
      { a: { x: 10, y: 10 }, b: { x: 11, y: 10 } },
    ];
    const polys = stitchSegments(segs);
    expect(polys.length).toBe(2);
  });

  it('closes a square made of four edges', () => {
    const segs = [
      { a: { x: 0, y: 0 }, b: { x: 1, y: 0 } },
      { a: { x: 1, y: 0 }, b: { x: 1, y: 1 } },
      { a: { x: 1, y: 1 }, b: { x: 0, y: 1 } },
      { a: { x: 0, y: 1 }, b: { x: 0, y: 0 } },
    ];
    const polys = stitchSegments(segs);
    expect(polys.length).toBe(1);
    expect(polys[0].length).toBe(5);
    expect(polys[0][0]).toEqual(polys[0][polys[0].length - 1]);
  });
});
