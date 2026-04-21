import { describe, it, expect } from 'vitest';
import { catmullRomSmooth } from '$lib/canvas/catmullRom';
import type { Point } from '$lib/types';

function p(x: number, y: number, pressure = 0.5, t = 0): Point {
  return { x, y, pressure, t };
}

describe('catmullRomSmooth', () => {
  it('returns the input unchanged for 0 or 1 points', () => {
    expect(catmullRomSmooth([])).toEqual([]);
    const one = [p(1, 2)];
    expect(catmullRomSmooth(one)).toEqual(one);
  });

  it('preserves endpoints exactly', () => {
    const input = [p(0, 0), p(100, 0), p(200, 0)];
    const out = catmullRomSmooth(input, 10);
    expect(out[0]).toEqual(input[0]);
    expect(out[out.length - 1]).toEqual(input[input.length - 1]);
  });

  it('keeps every original sample in order', () => {
    const input = [p(0, 0, 0.1, 0), p(50, 10, 0.5, 10), p(100, 0, 0.9, 20)];
    const out = catmullRomSmooth(input, 5);
    const keepIdx = input.map((orig) => out.findIndex((q) => q.x === orig.x && q.y === orig.y));
    expect(keepIdx.every((i) => i >= 0)).toBe(true);
    for (let i = 1; i < keepIdx.length; i++) expect(keepIdx[i]).toBeGreaterThan(keepIdx[i - 1]);
  });

  it('no-op when every chord is within maxChordPt', () => {
    const input = [p(0, 0), p(1, 0), p(2, 0), p(3, 0)];
    const out = catmullRomSmooth(input, 10);
    expect(out).toHaveLength(input.length);
  });

  it('inserts samples when chord exceeds maxChordPt', () => {
    const input = [p(0, 0), p(100, 0), p(200, 0)];
    const out = catmullRomSmooth(input, 10);
    expect(out.length).toBeGreaterThan(input.length);
  });

  it('interpolated samples lie near the input polyline for a straight line', () => {
    const input = [p(0, 0), p(100, 0), p(200, 0), p(300, 0)];
    const out = catmullRomSmooth(input, 5);
    for (const q of out) expect(Math.abs(q.y)).toBeLessThan(1e-6);
  });

  it('parameterization is monotonic in time across each segment', () => {
    const input = [p(0, 0, 0.5, 0), p(100, 0, 0.5, 100), p(200, 0, 0.5, 200)];
    const out = catmullRomSmooth(input, 10);
    for (let i = 1; i < out.length; i++) expect(out[i].t).toBeGreaterThanOrEqual(out[i - 1].t);
  });

  it('interpolates pressure linearly between anchors', () => {
    const input = [p(0, 0, 0, 0), p(100, 0, 1, 100)];
    const out = catmullRomSmooth(input, 10);
    for (const q of out) {
      expect(q.pressure).toBeGreaterThanOrEqual(0);
      expect(q.pressure).toBeLessThanOrEqual(1);
    }
    expect(out[0].pressure).toBe(0);
    expect(out[out.length - 1].pressure).toBe(1);
  });

  it('handles duplicate input samples without NaN', () => {
    const input = [p(0, 0), p(50, 0), p(50, 0), p(100, 0)];
    const out = catmullRomSmooth(input, 20);
    for (const q of out) {
      expect(Number.isFinite(q.x)).toBe(true);
      expect(Number.isFinite(q.y)).toBe(true);
    }
  });
});
