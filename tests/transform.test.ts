import { describe, expect, it } from 'vitest';
import { angleDeg, distance, normalizeDeg, rotate, translate } from '$lib/geometry/transform';

describe('transform', () => {
  it('rotates a point 90° CCW around origin', () => {
    const p = rotate({ x: 1, y: 0 }, 90);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(1);
  });

  it('rotates around non-origin center', () => {
    const p = rotate({ x: 2, y: 1 }, 180, { x: 1, y: 1 });
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(1);
  });

  it('translate shifts coordinates', () => {
    const p = translate({ x: 1, y: 2 }, 3, -4);
    expect(p).toEqual({ x: 4, y: -2 });
  });

  it('distance is Euclidean', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('angleDeg returns 0 for +x, 90 for +y', () => {
    expect(angleDeg({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(0);
    expect(angleDeg({ x: 0, y: 0 }, { x: 0, y: 1 })).toBe(90);
    expect(angleDeg({ x: 0, y: 0 }, { x: -1, y: 0 })).toBe(180);
  });

  it('normalizeDeg wraps into [0, 360)', () => {
    expect(normalizeDeg(0)).toBe(0);
    expect(normalizeDeg(360)).toBe(0);
    expect(normalizeDeg(-10)).toBe(350);
    expect(normalizeDeg(725)).toBe(5);
  });
});
