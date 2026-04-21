import { describe, it, expect } from 'vitest';
import { createSpatialIndex, objectAabb, queryPoint, queryRect } from '$lib/tools/spatialIndex';
import type { AnyObject, Point, ShapeObject, StrokeObject, StrokeStyle } from '$lib/types';

const STYLE: StrokeStyle = { color: '#000', width: 2, dash: 'solid', opacity: 1 };

function pt(x: number, y: number): Point {
  return { x, y, pressure: 0.5, t: 0 };
}

function mkStroke(id: string, points: Point[], width = 2): StrokeObject {
  return {
    id,
    createdAt: 0,
    type: 'stroke',
    tool: 'pen',
    style: { ...STYLE, width },
    points,
  };
}

function mkRect(id: string, x: number, y: number, w: number, h: number): ShapeObject {
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

describe('spatialIndex', () => {
  it('point query returns objects whose bbox contains the point', () => {
    const a = mkStroke('a', [pt(0, 0), pt(100, 0)]);
    const b = mkStroke('b', [pt(200, 200), pt(300, 200)]);
    const idx = createSpatialIndex([a, b]);
    const hits = queryPoint(idx, 50, 0, 0);
    expect(hits.map((o) => o.id)).toEqual(['a']);
  });

  it('point query outside every bbox returns empty', () => {
    const a = mkStroke('a', [pt(0, 0), pt(10, 0)]);
    const idx = createSpatialIndex([a]);
    expect(queryPoint(idx, 1000, 1000, 0)).toEqual([]);
  });

  it('radius query picks up an object just outside the center but within radius', () => {
    const r = mkRect('r', 100, 100, 10, 10);
    const idx = createSpatialIndex([r]);
    expect(queryPoint(idx, 90, 105, 0)).toEqual([]);
    expect(queryPoint(idx, 90, 105, 15).map((o) => o.id)).toEqual(['r']);
  });

  it('a single object that spans multiple cells is reported once', () => {
    const wide = mkStroke('w', [pt(0, 0), pt(500, 0)]);
    const idx = createSpatialIndex([wide], 64);
    const hits = queryRect(idx, -10, -10, 600, 10);
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe('w');
  });

  it('empty index yields empty query results', () => {
    const idx = createSpatialIndex([]);
    expect(queryPoint(idx, 0, 0, 100)).toEqual([]);
    expect(queryRect(idx, -1, -1, 1, 1)).toEqual([]);
  });

  it('object sitting exactly on a cell boundary is found from either side', () => {
    const s = mkRect('on-edge', 64, 64, 10, 10);
    const idx = createSpatialIndex([s], 64);
    expect(queryPoint(idx, 64, 64, 0).map((o) => o.id)).toEqual(['on-edge']);
    expect(queryPoint(idx, 70, 70, 0).map((o) => o.id)).toEqual(['on-edge']);
    // AABB is inflated by half the stroke width; (60,60) is beyond it.
    expect(queryPoint(idx, 60, 60, 0).map((o) => o.id)).toEqual([]);
  });

  it('rect query deduplicates objects that span many cells', () => {
    const objs: AnyObject[] = [];
    for (let i = 0; i < 5; i += 1) {
      objs.push(mkStroke(`s${i}`, [pt(i * 400, 0), pt(i * 400 + 300, 0)]));
    }
    const idx = createSpatialIndex(objs, 32);
    const all = queryRect(idx, -100, -100, 10_000, 100);
    const ids = all.map((o) => o.id).sort();
    expect(ids).toEqual(['s0', 's1', 's2', 's3', 's4']);
  });

  it('objectAabb inflates stroke by pressure-scaled half-width', () => {
    const fat = mkStroke('fat', [{ x: 50, y: 50, pressure: 1, t: 0 }], 10);
    const b = objectAabb(fat);
    expect(b.maxX - b.minX).toBeGreaterThanOrEqual(20);
  });

  it('throws if cellSize is non-positive', () => {
    expect(() => createSpatialIndex([], 0)).toThrow();
    expect(() => createSpatialIndex([], -5)).toThrow();
  });
});
