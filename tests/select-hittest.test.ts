import { describe, it, expect } from 'vitest';
import { pickInLasso, pickInMarquee, pickTopAt } from '$lib/select/hitTest';
import type { AnyObject, LineObject, ShapeObject, StrokeObject, StrokeStyle } from '$lib/types';

const STYLE: StrokeStyle = { color: '#000', width: 2, dash: 'solid', opacity: 1 };

function stroke(id: string, pts: [number, number][]): StrokeObject {
  return {
    id,
    createdAt: 0,
    type: 'stroke',
    tool: 'pen',
    style: STYLE,
    points: pts.map(([x, y]) => ({ x, y, pressure: 0.5, t: 0 })),
  };
}

function rect(id: string, x: number, y: number, w: number, h: number): ShapeObject {
  return {
    id,
    createdAt: 0,
    type: 'shape',
    kind: 'rect',
    style: STYLE,
    fill: null,
    bounds: { x, y, w, h },
  };
}

function line(id: string, a: [number, number], b: [number, number]): LineObject {
  return {
    id,
    createdAt: 0,
    type: 'line',
    style: STYLE,
    from: { x: a[0], y: a[1] },
    to: { x: b[0], y: b[1] },
    arrow: { start: false, end: false },
  };
}

describe('pickTopAt', () => {
  it('returns topmost (later in array) when multiple hit', () => {
    const a = stroke('a', [
      [0, 0],
      [100, 0],
    ]);
    const b = stroke('b', [
      [0, 0],
      [100, 0],
    ]);
    const hit = pickTopAt([a, b] as AnyObject[], null, { x: 50, y: 0 }, 2);
    expect(hit?.id).toBe('b');
  });
  it('returns null when nothing hit', () => {
    const a = rect('a', 0, 0, 10, 10);
    expect(pickTopAt([a] as AnyObject[], null, { x: 200, y: 200 }, 2)).toBeNull();
  });
});

describe('pickInMarquee', () => {
  it('picks overlapping objects', () => {
    const a = rect('a', 0, 0, 10, 10);
    const b = rect('b', 100, 100, 10, 10);
    const got = pickInMarquee([a, b] as AnyObject[], null, { x: 0, y: 0, w: 50, h: 50 });
    expect(got.map((o) => o.id)).toEqual(['a']);
  });
});

describe('pickInLasso', () => {
  it('picks strokes crossing the polygon', () => {
    const s = stroke('s', [
      [0, 0],
      [100, 0],
    ]);
    const polygon = [
      { x: 40, y: -10 },
      { x: 60, y: -10 },
      { x: 60, y: 10 },
      { x: 40, y: 10 },
    ];
    const got = pickInLasso([s] as AnyObject[], null, polygon);
    expect(got.map((o) => o.id)).toEqual(['s']);
  });
  it('rejects objects whose AABB is outside', () => {
    const l = line('l', [0, 0], [10, 10]);
    const polygon = [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
      { x: 200, y: 200 },
    ];
    const got = pickInLasso([l] as AnyObject[], null, polygon);
    expect(got).toEqual([]);
  });
  it('returns empty for degenerate polygons', () => {
    const l = line('l', [0, 0], [10, 10]);
    expect(pickInLasso([l] as AnyObject[], null, [{ x: 0, y: 0 }])).toEqual([]);
  });
});
