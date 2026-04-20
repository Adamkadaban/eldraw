import { describe, it, expect } from 'vitest';
import {
  appendPoint,
  clampTrailMs,
  DEFAULT_LASER_TRAIL_MS,
  MAX_LASER_TRAIL_MS,
  MIN_LASER_TRAIL_MS,
  pruneTrail,
  trailAlpha,
  type LaserPoint,
} from '$lib/tools/laser';

describe('laser trail buffer', () => {
  it('clampTrailMs respects bounds and falls back on NaN', () => {
    expect(clampTrailMs(0)).toBe(MIN_LASER_TRAIL_MS);
    expect(clampTrailMs(99_999)).toBe(MAX_LASER_TRAIL_MS);
    expect(clampTrailMs(NaN)).toBe(DEFAULT_LASER_TRAIL_MS);
    expect(clampTrailMs(250)).toBe(250);
  });

  it('prunes points older than trailMs and keeps fresh ones', () => {
    const now = 1000;
    const trailMs = 300;
    const points: LaserPoint[] = [
      { x: 0, y: 0, t: 500 },
      { x: 1, y: 1, t: 750 },
      { x: 2, y: 2, t: 950 },
    ];
    const kept = pruneTrail(points, now, trailMs);
    expect(kept).toHaveLength(2);
    expect(kept[0].t).toBe(750);
    expect(kept[1].t).toBe(950);
  });

  it('appendPoint prunes then appends', () => {
    const trailMs = 300;
    let trail: LaserPoint[] = [{ x: 0, y: 0, t: 100 }];
    trail = appendPoint(trail, { x: 1, y: 1, t: 500 }, trailMs);
    expect(trail).toHaveLength(1);
    expect(trail[0].t).toBe(500);
  });

  it('trailAlpha is 1 at the head and 0 past the window', () => {
    const p: LaserPoint = { x: 0, y: 0, t: 1000 };
    expect(trailAlpha(p, 1000, 300)).toBe(1);
    expect(trailAlpha(p, 1300, 300)).toBe(0);
    expect(trailAlpha(p, 1500, 300)).toBe(0);
    const mid = trailAlpha(p, 1150, 300);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(mid).toBeCloseTo(0.5, 5);
  });

  it('returns 0 when trailMs is non-positive', () => {
    const p: LaserPoint = { x: 0, y: 0, t: 1000 };
    expect(trailAlpha(p, 1000, 0)).toBe(0);
  });
});
