import { describe, it, expect } from 'vitest';
import { hitTestStroke } from '$lib/tools/eraser';
import type { Point, StrokeObject } from '$lib/types';

function pt(x: number, y: number, pressure = 0.5): Point {
  return { x, y, pressure, t: 0 };
}

function mkStroke(points: Point[], width = 2): StrokeObject {
  return {
    id: 's',
    createdAt: 0,
    type: 'stroke',
    tool: 'pen',
    style: { color: '#000', width, dash: 'solid', opacity: 1 },
    points,
  };
}

describe('hitTestStroke', () => {
  it('hits a point inside a thin stroke', () => {
    const s = mkStroke([pt(0, 0), pt(100, 0)], 2);
    expect(hitTestStroke(s, { x: 50, y: 0 }, 1)).toBe(true);
  });

  it('misses a point far outside', () => {
    const s = mkStroke([pt(0, 0), pt(100, 0)], 2);
    expect(hitTestStroke(s, { x: 50, y: 100 }, 1)).toBe(false);
  });

  it('hits near the endpoint of a stroke', () => {
    const s = mkStroke([pt(0, 0), pt(100, 0)], 2);
    expect(hitTestStroke(s, { x: 100, y: 0.5 }, 0.5)).toBe(true);
  });

  it('hits inside a fat stroke even when segment center is far', () => {
    const s = mkStroke([pt(0, 0), pt(100, 0)], 20);
    expect(hitTestStroke(s, { x: 50, y: 9 }, 0)).toBe(true);
    expect(hitTestStroke(s, { x: 50, y: 20 }, 0)).toBe(false);
  });

  it('returns false for empty strokes', () => {
    const s = mkStroke([], 2);
    expect(hitTestStroke(s, { x: 0, y: 0 }, 5)).toBe(false);
  });

  it('single-point stroke behaves like a disc', () => {
    const s = mkStroke([pt(10, 10)], 4);
    expect(hitTestStroke(s, { x: 11, y: 10 }, 0)).toBe(true);
    expect(hitTestStroke(s, { x: 20, y: 10 }, 0)).toBe(false);
    expect(hitTestStroke(s, { x: 20, y: 10 }, 10)).toBe(true);
  });

  it('eraser radius grows the hit area', () => {
    const s = mkStroke([pt(0, 0), pt(100, 0)], 2);
    expect(hitTestStroke(s, { x: 50, y: 5 }, 0)).toBe(false);
    expect(hitTestStroke(s, { x: 50, y: 5 }, 5)).toBe(true);
  });
});
