import { describe, it, expect } from 'vitest';
import { strokeFromInput } from '$lib/tools/pen';
import type { Point, StrokeStyle } from '$lib/types';

const style: StrokeStyle = {
  color: '#112233',
  width: 3,
  dash: 'solid',
  opacity: 1,
};

describe('strokeFromInput', () => {
  it('produces a stroke with id, timestamp, type, tool, and style copy', () => {
    const points: Point[] = [
      { x: 0, y: 0, pressure: 0.4, t: 0 },
      { x: 10, y: 5, pressure: 0.7, t: 16 },
    ];
    const before = Date.now();
    const stroke = strokeFromInput(points, style, 'pen');
    const after = Date.now();

    expect(stroke.type).toBe('stroke');
    expect(stroke.tool).toBe('pen');
    expect(typeof stroke.id).toBe('string');
    expect(stroke.id.length).toBeGreaterThan(0);
    expect(stroke.createdAt).toBeGreaterThanOrEqual(before);
    expect(stroke.createdAt).toBeLessThanOrEqual(after);
    expect(stroke.style).toEqual(style);
    expect(stroke.style).not.toBe(style);
    expect(stroke.points).toHaveLength(2);
    expect(stroke.points[0]).toEqual(points[0]);
    expect(stroke.points[0]).not.toBe(points[0]);
  });

  it('preserves explicit pressure values', () => {
    const points: Point[] = [
      { x: 0, y: 0, pressure: 0.25, t: 0 },
      { x: 1, y: 1, pressure: 0.9, t: 8 },
    ];
    const s = strokeFromInput(points, style, 'pen');
    expect(s.points.map((p) => p.pressure)).toEqual([0.25, 0.9]);
  });

  it('produces unique ids across calls', () => {
    const p: Point[] = [{ x: 0, y: 0, pressure: 0.5, t: 0 }];
    const a = strokeFromInput(p, style, 'pen');
    const b = strokeFromInput(p, style, 'pen');
    expect(a.id).not.toBe(b.id);
  });

  it('accepts highlighter tool', () => {
    const p: Point[] = [{ x: 0, y: 0, pressure: 0.5, t: 0 }];
    const s = strokeFromInput(p, style, 'highlighter');
    expect(s.tool).toBe('highlighter');
  });

  it('keeps 0.5 pressure default when caller set it that way', () => {
    const p: Point[] = [{ x: 0, y: 0, pressure: 0.5, t: 0 }];
    const s = strokeFromInput(p, style, 'pen');
    expect(s.points[0].pressure).toBe(0.5);
    expect(s.points[0].t).toBe(0);
  });

  it('does not bake a streamline on new strokes (input is pre-stabilized)', () => {
    const p: Point[] = [{ x: 0, y: 0, pressure: 0.5, t: 0 }];
    const s = strokeFromInput(p, style, 'pen');
    expect(s.streamline).toBeUndefined();
  });
});
