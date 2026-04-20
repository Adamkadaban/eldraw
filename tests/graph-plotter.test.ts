import { describe, it, expect } from 'vitest';
import { plotFunction } from '$lib/graph/plotter';

describe('plotFunction', () => {
  it('keeps a smooth linear function sparse', () => {
    const segs = plotFunction((x) => x, {
      xRange: [-1, 1],
      yRange: [-2, 2],
      samples: 200,
    });
    expect(segs.length).toBe(1);
    expect(segs[0].length).toBeLessThanOrEqual(32);
    expect(segs[0][0]).toEqual({ x: -1, y: -1 });
    expect(segs[0][segs[0].length - 1]).toEqual({ x: 1, y: 1 });
  });

  it('densifies sampling near a sharp corner', () => {
    const corner = 0.371;
    const segs = plotFunction((x) => Math.abs(x - corner), {
      xRange: [-1, 1],
      yRange: [-0.5, 1.5],
      samples: 300,
    });
    expect(segs.length).toBe(1);
    const near = segs[0].filter((p) => Math.abs(p.x - corner) < 0.05).length;
    const far = segs[0].filter((p) => p.x < -0.5).length;
    expect(near).toBeGreaterThan(far);
    expect(near).toBeGreaterThan(10);
  });

  it('respects the samples budget as an upper bound', () => {
    const segs = plotFunction((x) => Math.sin(20 * x), {
      xRange: [-5, 5],
      yRange: [-1.5, 1.5],
      samples: 64,
    });
    const total = segs.reduce((n, s) => n + s.length, 0);
    expect(total).toBeLessThanOrEqual(64);
  });

  it('breaks the polyline at NaN values', () => {
    const segs = plotFunction((x) => (x < 0 ? x : Number.NaN), {
      xRange: [-1, 1],
      yRange: [-2, 2],
      samples: 32,
    });
    expect(segs.length).toBe(1);
    expect(segs[0].every((p) => Number.isFinite(p.y))).toBe(true);
    expect(segs[0].every((p) => p.x < 0)).toBe(true);
  });

  it('breaks the polyline at Infinity values', () => {
    const segs = plotFunction((x) => (x === 0 ? Number.POSITIVE_INFINITY : x), {
      xRange: [-1, 1],
      yRange: [-2, 2],
      samples: 64,
    });
    expect(segs.length).toBe(2);
  });

  it('clips values that exceed the visible y-range multiplier', () => {
    const segs = plotFunction((x) => (x === 0 ? 1000 : 0), {
      xRange: [-1, 1],
      yRange: [-1, 1],
      samples: 9,
      clipMultiplier: 2,
    });
    const allInside = segs.flat().every((p) => Math.abs(p.y) <= 1);
    expect(allInside).toBe(true);
  });

  it('splits 1/x into at least two segments across the asymptote', () => {
    const segs = plotFunction((x) => 1 / x, {
      xRange: [-1, 1],
      yRange: [-5, 5],
      samples: 200,
      clipMultiplier: 100,
      jumpMultiplier: 0.5,
    });
    expect(segs.length).toBeGreaterThanOrEqual(2);
    const leftSeg = segs.find((s) => s.every((p) => p.x < 0));
    const rightSeg = segs.find((s) => s.every((p) => p.x > 0));
    expect(leftSeg).toBeDefined();
    expect(rightSeg).toBeDefined();
  });

  it('returns no segments for samples < 2', () => {
    const segs = plotFunction((x) => x, {
      xRange: [0, 1],
      yRange: [-1, 1],
      samples: 1,
    });
    expect(segs).toEqual([]);
  });

  it('handles a degenerate tiny xRange without NaN/Infinity', () => {
    const segs = plotFunction((x) => x, {
      xRange: [1, 1.0000000001],
      yRange: [-1, 1],
      samples: 50,
    });
    const points = segs.flat();
    expect(points.length).toBeGreaterThan(0);
    expect(points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });

  it('preserves the exact xRange endpoints', () => {
    const segs = plotFunction((x) => x * 2, {
      xRange: [0, 4],
      yRange: [-10, 10],
      samples: 64,
    });
    expect(segs[0][0].x).toBe(0);
    expect(segs[0][0].y).toBe(0);
    const last = segs[0][segs[0].length - 1];
    expect(last.x).toBe(4);
    expect(last.y).toBe(8);
  });
});
