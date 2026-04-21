import { describe, it, expect } from 'vitest';
import { hitTestObject, hitTestObjects } from '$lib/tools/eraser';
import type {
  AngleMarkObject,
  AnyObject,
  GraphObject,
  LineObject,
  NumberLineObject,
  Point,
  ShapeObject,
  StrokeObject,
  StrokeStyle,
  TextObject,
} from '$lib/types';

const STYLE: StrokeStyle = { color: '#000', width: 2, dash: 'solid', opacity: 1 };

function pt(x: number, y: number): Point {
  return { x, y, pressure: 0.5, t: 0 };
}

function mkStroke(): StrokeObject {
  return {
    id: 'stroke-1',
    createdAt: 0,
    type: 'stroke',
    tool: 'pen',
    style: STYLE,
    points: [pt(0, 0), pt(100, 0)],
  };
}

function mkLine(): LineObject {
  return {
    id: 'line-1',
    createdAt: 0,
    type: 'line',
    style: STYLE,
    from: { x: 200, y: 0 },
    to: { x: 300, y: 0 },
    arrow: { start: false, end: false },
  };
}

function mkShape(fill: string | null): ShapeObject {
  return {
    id: `shape-${fill ?? 'none'}`,
    createdAt: 0,
    type: 'shape',
    kind: 'rect',
    style: STYLE,
    fill,
    bounds: { x: 400, y: 0, w: 100, h: 50 },
  };
}

function mkNumberLine(): NumberLineObject {
  return {
    id: 'nl-1',
    createdAt: 0,
    type: 'numberline',
    style: STYLE,
    from: { x: 0, y: 200 },
    length: 200,
    min: 0,
    max: 10,
    tickStep: 1,
    labelStep: 1,
    marks: [],
  };
}

function mkGraph(): GraphObject {
  return {
    id: 'graph-1',
    createdAt: 0,
    type: 'graph',
    bounds: { x: 600, y: 300, w: 200, h: 200 },
    xRange: [-10, 10],
    yRange: [-10, 10],
    gridStep: 0,
    showAxes: true,
    showGrid: true,
    functions: [],
  };
}

function mkText(): TextObject {
  return {
    id: 'text-1',
    createdAt: 0,
    type: 'text',
    at: { x: 900, y: 100 },
    content: 'hello',
    latex: false,
    fontSize: 16,
    color: '#000',
  };
}

function mkAngleMark(): AngleMarkObject {
  return {
    id: 'am-1',
    createdAt: 0,
    type: 'angleMark',
    vertex: { x: 1200, y: 100 },
    rayA: { x: 1300, y: 100 },
    rayB: { x: 1200, y: 200 },
    degrees: 90,
    color: '#000',
    width: 2,
    showLabel: false,
  };
}

describe('hitTestObject per type', () => {
  it('stroke: hit inside and miss outside', () => {
    const s = mkStroke();
    expect(hitTestObject(s, { x: 50, y: 0 }, 4)).toBe(true);
    expect(hitTestObject(s, { x: 50, y: 100 }, 4)).toBe(false);
  });

  it('line: hit inside and miss outside', () => {
    const l = mkLine();
    expect(hitTestObject(l, { x: 250, y: 0 }, 4)).toBe(true);
    expect(hitTestObject(l, { x: 250, y: 200 }, 4)).toBe(false);
  });

  it('shape (unfilled rect): hit on border, miss in interior', () => {
    const r = mkShape(null);
    expect(hitTestObject(r, { x: 400, y: 25 }, 4)).toBe(true);
    expect(hitTestObject(r, { x: 450, y: 25 }, 4)).toBe(false);
    expect(hitTestObject(r, { x: 450, y: 0 }, 4)).toBe(true);
  });

  it('shape (filled rect): hit anywhere inside bbox, miss outside', () => {
    const r = mkShape('#aaa');
    expect(hitTestObject(r, { x: 450, y: 25 }, 4)).toBe(true);
    expect(hitTestObject(r, { x: 1000, y: 1000 }, 4)).toBe(false);
  });

  it('numberline: hit near the axis, miss far below', () => {
    const nl = mkNumberLine();
    expect(hitTestObject(nl, { x: 100, y: 200 }, 4)).toBe(true);
    expect(hitTestObject(nl, { x: 100, y: 400 }, 4)).toBe(false);
  });

  it('graph: hit inside bbox, miss outside', () => {
    const g = mkGraph();
    expect(hitTestObject(g, { x: 700, y: 400 }, 4)).toBe(true);
    expect(hitTestObject(g, { x: 100, y: 100 }, 4)).toBe(false);
  });

  it('text: hit inside estimated bbox, miss outside', () => {
    const t = mkText();
    expect(hitTestObject(t, { x: 905, y: 105 }, 4)).toBe(true);
    expect(hitTestObject(t, { x: 10, y: 10 }, 4)).toBe(false);
  });

  it('angleMark: hit on a ray, miss far from both rays', () => {
    const a = mkAngleMark();
    expect(hitTestObject(a, { x: 1250, y: 100 }, 4)).toBe(true);
    expect(hitTestObject(a, { x: 1200, y: 150 }, 4)).toBe(true);
    expect(hitTestObject(a, { x: 1400, y: 400 }, 4)).toBe(false);
  });
});

describe('hitTestObjects on a mixed page', () => {
  const objects: AnyObject[] = [
    mkStroke(),
    mkLine(),
    mkShape(null),
    mkNumberLine(),
    mkGraph(),
    mkText(),
    mkAngleMark(),
  ];

  it('erases each object type when the pointer covers it', () => {
    const hitPoints: Record<string, { x: number; y: number }> = {
      'stroke-1': { x: 50, y: 0 },
      'line-1': { x: 250, y: 0 },
      'shape-none': { x: 400, y: 25 },
      'nl-1': { x: 100, y: 200 },
      'graph-1': { x: 700, y: 400 },
      'text-1': { x: 905, y: 105 },
      'am-1': { x: 1250, y: 100 },
    };
    for (const obj of objects) {
      const hits = hitTestObjects(objects, hitPoints[obj.id], 4);
      expect(hits.map((h) => h.id)).toContain(obj.id);
    }
  });

  it('a point far from every object hits nothing', () => {
    const hits = hitTestObjects(objects, { x: -500, y: -500 }, 4);
    expect(hits).toEqual([]);
  });

  it('unknown object type returns false', () => {
    const unknown = {
      id: 'unknown-1',
      createdAt: 0,
      type: 'bogus',
    } as unknown as AnyObject;
    expect(hitTestObject(unknown, { x: 0, y: 0 }, 4)).toBe(false);
  });
});
