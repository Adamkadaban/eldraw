import { describe, it, expect } from 'vitest';
import {
  clampFadeMs,
  createTempStroke,
  DEFAULT_TEMP_INK_FADE_MS,
  fadeOpacity,
  MAX_TEMP_INK_FADE_MS,
  MIN_TEMP_INK_FADE_MS,
  pruneStrokes,
} from '$lib/tools/tempInk';
import type { Point, StrokeStyle } from '$lib/types';

const STYLE: StrokeStyle = { color: '#000', width: 2, dash: 'solid', opacity: 1 };

function pt(x: number, y: number, t: number): Point {
  return { x, y, pressure: 0.5, t };
}

describe('temp-ink fade', () => {
  it('clampFadeMs enforces [500, 30000] and falls back on NaN', () => {
    expect(clampFadeMs(0)).toBe(MIN_TEMP_INK_FADE_MS);
    expect(clampFadeMs(60_000)).toBe(MAX_TEMP_INK_FADE_MS);
    expect(clampFadeMs(NaN)).toBe(DEFAULT_TEMP_INK_FADE_MS);
    expect(clampFadeMs(2000)).toBe(2000);
  });

  it('createTempStroke clones points and clamps fadeMs', () => {
    const points = [pt(1, 2, 0), pt(3, 4, 10)];
    const stroke = createTempStroke(points, STYLE, 100, 1234);
    expect(stroke.points).toHaveLength(2);
    expect(stroke.points[0]).not.toBe(points[0]);
    expect(stroke.fadeMs).toBe(MIN_TEMP_INK_FADE_MS);
    expect(stroke.endedAt).toBe(1234);
    expect(stroke.style).toEqual(STYLE);
    expect(stroke.style).not.toBe(STYLE);
  });

  it('fadeOpacity follows a linear curve from 1 to 0', () => {
    const stroke = createTempStroke([pt(0, 0, 0)], STYLE, 1000, 0);
    expect(fadeOpacity(stroke, -50)).toBe(1);
    expect(fadeOpacity(stroke, 0)).toBe(1);
    expect(fadeOpacity(stroke, 250)).toBeCloseTo(0.75, 5);
    expect(fadeOpacity(stroke, 500)).toBeCloseTo(0.5, 5);
    expect(fadeOpacity(stroke, 750)).toBeCloseTo(0.25, 5);
    expect(fadeOpacity(stroke, 1000)).toBe(0);
    expect(fadeOpacity(stroke, 5000)).toBe(0);
  });

  it('pruneStrokes drops fully faded strokes from the front', () => {
    const a = createTempStroke([pt(0, 0, 0)], STYLE, 500, 0);
    const b = createTempStroke([pt(1, 1, 0)], STYLE, 500, 200);
    const c = createTempStroke([pt(2, 2, 0)], STYLE, 500, 400);
    const kept = pruneStrokes([a, b, c], 600);
    expect(kept).toHaveLength(2);
    expect(kept[0]).toBe(b);
    expect(kept[1]).toBe(c);
  });

  it('pruneStrokes returns the same array when nothing expired', () => {
    const a = createTempStroke([pt(0, 0, 0)], STYLE, 1000, 100);
    const arr = [a];
    expect(pruneStrokes(arr, 500)).toBe(arr);
  });
});
