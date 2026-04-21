import { beforeAll, describe, expect, it, vi } from 'vitest';
import { drawAnnotationOverlay, thumbnailPixelSize } from '$lib/pdf/thumbnailComposite';
import type {
  AnyObject,
  GraphObject,
  LineObject,
  ShapeObject,
  StrokeObject,
  TextObject,
} from '$lib/types';

beforeAll(() => {
  if (typeof globalThis.Path2D === 'undefined') {
    class Path2DStub {
      constructor(_d?: string) {
        void _d;
      }
    }
    Object.defineProperty(globalThis, 'Path2D', { value: Path2DStub });
  }
});

function mockCtx() {
  const calls: { name: string; args: unknown[] }[] = [];
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push({ name, args });
    };
  const ctx: Record<string, unknown> = {
    save: record('save'),
    restore: record('restore'),
    beginPath: record('beginPath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    stroke: record('stroke'),
    fill: record('fill'),
    fillRect: record('fillRect'),
    strokeRect: record('strokeRect'),
    rect: record('rect'),
    ellipse: record('ellipse'),
    arc: record('arc'),
    closePath: record('closePath'),
    clip: record('clip'),
    setLineDash: record('setLineDash'),
    fillText: record('fillText'),
    drawImage: record('drawImage'),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

function stroke(): StrokeObject {
  return {
    id: 's1',
    createdAt: 0,
    type: 'stroke',
    tool: 'pen',
    style: { color: '#000', width: 2, dash: 'solid', opacity: 1 },
    points: [
      { x: 10, y: 10, pressure: 0.5, t: 0 },
      { x: 50, y: 30, pressure: 0.5, t: 10 },
      { x: 100, y: 40, pressure: 0.5, t: 20 },
    ],
  };
}

function line(): LineObject {
  return {
    id: 'l1',
    createdAt: 0,
    type: 'line',
    style: { color: '#222', width: 1, dash: 'solid', opacity: 1 },
    from: { x: 0, y: 0 },
    to: { x: 100, y: 100 },
    arrow: { start: false, end: false },
  };
}

function shape(): ShapeObject {
  return {
    id: 'sh1',
    createdAt: 0,
    type: 'shape',
    kind: 'rect',
    style: { color: '#444', width: 1, dash: 'solid', opacity: 1 },
    fill: null,
    bounds: { x: 0, y: 0, w: 50, h: 30 },
  };
}

function graph(): GraphObject {
  return {
    id: 'g1',
    createdAt: 0,
    type: 'graph',
    bounds: { x: 10, y: 10, w: 40, h: 40 },
    xRange: [-10, 10],
    yRange: [-10, 10],
    gridStep: 0,
    showAxes: true,
    showGrid: true,
    functions: [],
  };
}

function text(): TextObject {
  return {
    id: 't1',
    createdAt: 0,
    type: 'text',
    at: { x: 20, y: 20 },
    content: 'hello',
    latex: false,
    fontSize: 12,
    color: '#000',
  };
}

describe('thumbnailPixelSize', () => {
  it('scales by the longest side to the requested maxDim', () => {
    expect(thumbnailPixelSize({ width: 612, height: 792 }, 200)).toEqual({
      width: 155,
      height: 200,
      pxPerPt: 200 / 792,
    });
  });

  it('handles degenerate zero-sized pages without NaN', () => {
    expect(thumbnailPixelSize({ width: 0, height: 0 }, 200)).toEqual({
      width: 0,
      height: 0,
      pxPerPt: 0,
    });
  });
});

describe('drawAnnotationOverlay', () => {
  it('issues canvas ops for each supported object type', () => {
    const { ctx, calls } = mockCtx();
    const objects: AnyObject[] = [stroke(), line(), shape(), graph(), text()];

    drawAnnotationOverlay(ctx, objects, 1);

    const names = new Set(calls.map((c) => c.name));
    expect(names.has('save')).toBe(true);
    expect(names.has('stroke')).toBe(true);
    expect(names.has('fillText')).toBe(true);
    expect(names.has('fillRect')).toBe(true);
    expect(names.has('strokeRect')).toBe(true);
  });

  it('is a no-op for an empty object list', () => {
    const { ctx, calls } = mockCtx();
    drawAnnotationOverlay(ctx, [], 0.25);
    expect(calls).toEqual([]);
  });

  it('skips invisible text when the scaled font is below the legibility floor', () => {
    const { ctx, calls } = mockCtx();
    const t = text();
    drawAnnotationOverlay(ctx, [{ ...t, fontSize: 4 }], 0.1);
    expect(calls.some((c) => c.name === 'fillText')).toBe(false);
  });

  it('renders an early-return-free graph placeholder when bounds are positive', () => {
    const { ctx, calls } = mockCtx();
    drawAnnotationOverlay(ctx, [graph()], 1);
    expect(calls.some((c) => c.name === 'fillRect')).toBe(true);
    expect(calls.some((c) => c.name === 'strokeRect')).toBe(true);
  });
});

describe('drawAnnotationOverlay unknown types', () => {
  it('does not throw on unknown discriminants', () => {
    const { ctx } = mockCtx();
    const bogus = { id: 'x', createdAt: 0, type: 'mystery' } as unknown as AnyObject;
    expect(() => drawAnnotationOverlay(ctx, [bogus], 1)).not.toThrow();
    vi.restoreAllMocks();
  });
});
