import { describe, it, expect } from 'vitest';
import { transformObject, translateObject, applyStyleToObject } from '$lib/select/transform';
import type {
  AngleMarkObject,
  GraphObject,
  LineObject,
  NumberLineObject,
  ShapeObject,
  StrokeObject,
  StrokeStyle,
  TextObject,
} from '$lib/types';

const STYLE: StrokeStyle = { color: '#000', width: 2, dash: 'solid', opacity: 1 };

function stroke(): StrokeObject {
  return {
    id: 's',
    createdAt: 0,
    type: 'stroke',
    tool: 'pen',
    style: STYLE,
    points: [
      { x: 0, y: 0, pressure: 0.5, t: 0 },
      { x: 10, y: 0, pressure: 0.5, t: 1 },
    ],
  };
}

function line(): LineObject {
  return {
    id: 'l',
    createdAt: 0,
    type: 'line',
    style: STYLE,
    from: { x: 0, y: 0 },
    to: { x: 10, y: 0 },
    arrow: { start: false, end: false },
  };
}

function shape(): ShapeObject {
  return {
    id: 'sh',
    createdAt: 0,
    type: 'shape',
    kind: 'rect',
    style: STYLE,
    fill: null,
    bounds: { x: 0, y: 0, w: 10, h: 10 },
  };
}

function numberline(): NumberLineObject {
  return {
    id: 'n',
    createdAt: 0,
    type: 'numberline',
    style: STYLE,
    from: { x: 0, y: 0 },
    length: 100,
    min: 0,
    max: 10,
    tickStep: 1,
    labelStep: 1,
    marks: [],
  };
}

function graph(): GraphObject {
  return {
    id: 'g',
    createdAt: 0,
    type: 'graph',
    bounds: { x: 0, y: 0, w: 100, h: 100 },
    xRange: [-10, 10],
    yRange: [-10, 10],
    gridStep: 1,
    showAxes: true,
    showGrid: true,
    functions: [
      {
        id: 'f1',
        expr: 'x',
        kind: 'explicit',
        color: '#000',
        width: 2,
        dash: 'solid',
        domain: null,
      },
    ],
  };
}

function text(): TextObject {
  return {
    id: 't',
    createdAt: 0,
    type: 'text',
    at: { x: 0, y: 0 },
    content: 'hi',
    latex: false,
    fontSize: 16,
    color: '#000',
  };
}

function angleMark(): AngleMarkObject {
  return {
    id: 'a',
    createdAt: 0,
    type: 'angleMark',
    vertex: { x: 0, y: 0 },
    rayA: { x: 10, y: 0 },
    rayB: { x: 0, y: 10 },
    degrees: 90,
    color: '#000',
    width: 2,
    showLabel: false,
  };
}

describe('translateObject', () => {
  it('moves stroke points', () => {
    const s = translateObject(stroke(), 5, 7) as StrokeObject;
    expect(s.points[0]).toMatchObject({ x: 5, y: 7 });
    expect(s.points[1]).toMatchObject({ x: 15, y: 7 });
  });
  it('moves line endpoints', () => {
    const l = translateObject(line(), 3, 4) as LineObject;
    expect(l.from).toEqual({ x: 3, y: 4 });
    expect(l.to).toEqual({ x: 13, y: 4 });
  });
  it('moves shape bounds', () => {
    const s = translateObject(shape(), 1, 2) as ShapeObject;
    expect(s.bounds).toEqual({ x: 1, y: 2, w: 10, h: 10 });
  });
  it('moves numberline', () => {
    const n = translateObject(numberline(), 5, 6) as NumberLineObject;
    expect(n.from).toEqual({ x: 5, y: 6 });
    expect(n.length).toBe(100);
  });
  it('moves graph bounds', () => {
    const g = translateObject(graph(), 10, 20) as GraphObject;
    expect(g.bounds).toEqual({ x: 10, y: 20, w: 100, h: 100 });
  });
  it('moves text anchor', () => {
    const t = translateObject(text(), 3, 3) as TextObject;
    expect(t.at).toEqual({ x: 3, y: 3 });
    expect(t.fontSize).toBe(16);
  });
  it('moves angle mark points', () => {
    const a = translateObject(angleMark(), 1, 2) as AngleMarkObject;
    expect(a.vertex).toEqual({ x: 1, y: 2 });
    expect(a.rayA).toEqual({ x: 11, y: 2 });
    expect(a.rayB).toEqual({ x: 1, y: 12 });
  });
});

describe('transformObject scale', () => {
  it('scales shape about origin', () => {
    const s = transformObject(shape(), {
      scale: { sx: 2, sy: 2, pivot: { x: 0, y: 0 } },
    }) as ShapeObject;
    expect(s.bounds).toEqual({ x: 0, y: 0, w: 20, h: 20 });
  });
  it('scales stroke points', () => {
    const s = transformObject(stroke(), {
      scale: { sx: 2, sy: 1, pivot: { x: 0, y: 0 } },
    }) as StrokeObject;
    expect(s.points[1].x).toBe(20);
  });
});

describe('transformObject rotate', () => {
  it('rotates stroke points by 90deg', () => {
    const s = transformObject(stroke(), {
      rotate: { angle: Math.PI / 2, pivot: { x: 0, y: 0 } },
    }) as StrokeObject;
    expect(Math.round(s.points[1].x)).toBe(0);
    expect(Math.round(s.points[1].y)).toBe(10);
  });
  it('keeps shape axis-aligned (rotates anchor only)', () => {
    const s = transformObject(shape(), {
      rotate: { angle: Math.PI / 2, pivot: { x: 0, y: 0 } },
    }) as ShapeObject;
    expect(s.bounds.w).toBe(10);
    expect(s.bounds.h).toBe(10);
  });
  it('rectangular shape rotation preserves w/h (does not swap)', () => {
    const rect: ShapeObject = { ...shape(), bounds: { x: 0, y: 0, w: 10, h: 20 } };
    const s = transformObject(rect, {
      rotate: { angle: Math.PI / 2, pivot: { x: 0, y: 0 } },
    }) as ShapeObject;
    expect(s.bounds.w).toBe(10);
    expect(s.bounds.h).toBe(20);
  });
  it('graph rotation preserves w/h (anchor moves only)', () => {
    const g = transformObject(graph(), {
      rotate: { angle: Math.PI / 2, pivot: { x: 0, y: 0 } },
    }) as GraphObject;
    expect(g.bounds.w).toBe(100);
    expect(g.bounds.h).toBe(100);
  });
  it('rectangular graph rotation preserves w/h', () => {
    const g: GraphObject = { ...graph(), bounds: { x: 0, y: 0, w: 80, h: 40 } };
    const r = transformObject(g, {
      rotate: { angle: Math.PI / 2, pivot: { x: 0, y: 0 } },
    }) as GraphObject;
    expect(r.bounds.w).toBe(80);
    expect(r.bounds.h).toBe(40);
  });
});

describe('transformObject scaleStrokeWidth', () => {
  it('scales stroke width when requested', () => {
    const s = transformObject(
      stroke(),
      { scale: { sx: 2, sy: 2, pivot: { x: 0, y: 0 } } },
      { scaleStrokeWidth: true },
    ) as StrokeObject;
    expect(s.style.width).toBe(4);
  });
  it('scales shape width when requested', () => {
    const s = transformObject(
      shape(),
      { scale: { sx: 3, sy: 3, pivot: { x: 0, y: 0 } } },
      { scaleStrokeWidth: true },
    ) as ShapeObject;
    expect(s.style.width).toBe(6);
  });
  it('does not scale width by default', () => {
    const s = transformObject(shape(), {
      scale: { sx: 2, sy: 2, pivot: { x: 0, y: 0 } },
    }) as ShapeObject;
    expect(s.style.width).toBe(2);
  });
});

describe('applyStyleToObject', () => {
  it('patches stroke color', () => {
    const s = applyStyleToObject(stroke(), { color: '#f00' }) as StrokeObject;
    expect(s.style.color).toBe('#f00');
  });
  it('patches all graph functions', () => {
    const g = applyStyleToObject(graph(), { color: '#f00', width: 4 }) as GraphObject;
    expect(g.functions[0].color).toBe('#f00');
    expect(g.functions[0].width).toBe(4);
  });
  it('patches text color only', () => {
    const t = applyStyleToObject(text(), { color: '#0f0' }) as TextObject;
    expect(t.color).toBe('#0f0');
  });
  it('ignores width on text', () => {
    const t = applyStyleToObject(text(), { width: 10 }) as TextObject;
    expect(t).toEqual(text());
  });
});
