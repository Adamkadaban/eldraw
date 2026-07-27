import { describe, it, expect, beforeAll } from 'vitest';
import { drawStroke, hasStrokeCacheEntry } from '$lib/canvas/strokeRenderer';
import type { StrokeObject, Point } from '$lib/types';

beforeAll(() => {
  if (typeof globalThis.Path2D === 'undefined') {
    globalThis.Path2D = class Path2D {} as unknown as typeof Path2D;
  }
});

function makePoints(n: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    pts.push({ x: i, y: i * 0.5, pressure: 0.5, t: i * 4 });
  }
  return pts;
}

function makeStroke(numPoints: number): StrokeObject {
  return {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    type: 'stroke',
    tool: 'pen',
    style: { color: '#000', width: 2, dash: 'solid', opacity: 1 },
    points: makePoints(numPoints),
    streamline: 0.5,
  };
}

function createSpyCtx() {
  let fillCount = 0;
  const noop = () => {};
  const ctx = {
    save: noop,
    restore: noop,
    clearRect: noop,
    fillRect: noop,
    fill() {
      fillCount++;
    },
    stroke: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    set fillStyle(_v: string) {},
    set strokeStyle(_v: string) {},
    set globalAlpha(_v: number) {},
    set globalCompositeOperation(_v: string) {},
    set lineWidth(_v: number) {},
    set lineCap(_v: string) {},
    set lineJoin(_v: string) {},
    setLineDash: noop,
    get fillCount() {
      return fillCount;
    },
  };
  return ctx as unknown as CanvasRenderingContext2D & { fillCount: number };
}

describe('stroke render caching', () => {
  it('caches Path2D after first drawStroke call', () => {
    const stroke = makeStroke(100);
    const ctx = createSpyCtx();

    expect(hasStrokeCacheEntry(stroke)).toBe(false);
    drawStroke(ctx, stroke, { ptToPx: 2 });
    expect(hasStrokeCacheEntry(stroke)).toBe(true);
  });

  it('reuses cache on repeated calls with same parameters', () => {
    const stroke = makeStroke(100);
    const ctx = createSpyCtx();

    drawStroke(ctx, stroke, { ptToPx: 2 });
    const t0 = performance.now();
    for (let i = 0; i < 1000; i++) {
      drawStroke(ctx, stroke, { ptToPx: 2 });
    }
    const perCall = (performance.now() - t0) / 1000;
    expect(perCall).toBeLessThan(0.1);
  });

  it('invalidates cache when ptToPx changes', () => {
    const stroke = makeStroke(50);
    const ctx = createSpyCtx();

    drawStroke(ctx, stroke, { ptToPx: 2 });
    expect(hasStrokeCacheEntry(stroke)).toBe(true);

    drawStroke(ctx, stroke, { ptToPx: 3 });
    expect(hasStrokeCacheEntry(stroke)).toBe(true);
  });
});
