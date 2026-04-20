import { describe, it, expect } from 'vitest';
import { plotFunction } from '$lib/graph/plotter';

describe('plotFunction', () => {
  it('produces a single continuous segment for a smooth function', () => {
    const segs = plotFunction((x) => x, {
      xRange: [-1, 1],
      yRange: [-2, 2],
      samples: 11,
    });
    expect(segs.length).toBe(1);
    expect(segs[0].length).toBe(11);
    expect(segs[0][0]).toEqual({ x: -1, y: -1 });
    expect(segs[0][10]).toEqual({ x: 1, y: 1 });
  });

  it('breaks the polyline at NaN values', () => {
    const segs = plotFunction((x) => (x < 0 ? x : Number.NaN), {
      xRange: [-1, 1],
      yRange: [-2, 2],
      samples: 11,
    });
    expect(segs.length).toBe(1);
    expect(segs[0].every((p) => Number.isFinite(p.y))).toBe(true);
    expect(segs[0].every((p) => p.x < 0)).toBe(true);
  });

  it('breaks the polyline at Infinity values', () => {
    const segs = plotFunction((x) => (x === 0 ? Number.POSITIVE_INFINITY : x), {
      xRange: [-1, 1],
      yRange: [-2, 2],
      samples: 5,
    });
    expect(segs.length).toBe(2);
  });

  it('clips values that exceed the visible y-range multiplier', () => {
    const segs = plotFunction((x) => (x === 0 ? 1000 : 0), {
      xRange: [-1, 1],
      yRange: [-1, 1],
      samples: 5,
      clipMultiplier: 2,
    });
    const allInside = segs.flat().every((p) => Math.abs(p.y) <= 1);
    expect(allInside).toBe(true);
    expect(segs.flat().length).toBeLessThan(5);
  });

  it('breaks across asymptotes with sign change', () => {
    const segs = plotFunction((x) => 1 / x, {
      xRange: [-1, 1],
      yRange: [-5, 5],
      samples: 21,
      clipMultiplier: 100,
      jumpMultiplier: 0.5,
    });
    expect(segs.length).toBeGreaterThanOrEqual(2);
  });

  it('returns no segments for samples < 2', () => {
    const segs = plotFunction((x) => x, {
      xRange: [0, 1],
      yRange: [-1, 1],
      samples: 1,
    });
    expect(segs).toEqual([]);
  });

  it('samples include the exact endpoints', () => {
    const segs = plotFunction((x) => x * 2, {
      xRange: [0, 4],
      yRange: [-10, 10],
      samples: 5,
    });
    expect(segs[0][0].x).toBe(0);
    expect(segs[0][segs[0].length - 1].x).toBe(4);
    expect(segs[0][segs[0].length - 1].y).toBe(8);
  });
});
