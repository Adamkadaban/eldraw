import { describe, it, expect, beforeAll } from 'vitest';
import { drawStroke } from '$lib/canvas/strokeRenderer';
import type { StrokeObject, Point } from '$lib/types';

beforeAll(() => {
  if (typeof globalThis.Path2D === 'undefined') {
    globalThis.Path2D = class Path2D {} as unknown as typeof Path2D;
  }
});

function makePoints(n: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    pts.push({
      x: 100 + Math.sin(i / 10) * 200,
      y: 100 + Math.cos(i / 10) * 150,
      pressure: 0.3 + Math.random() * 0.4,
      t: i * 4,
    });
  }
  return pts;
}

function makeStroke(numPoints: number): StrokeObject {
  return {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    type: 'stroke',
    tool: 'pen',
    style: { color: '#000000', width: 2, dash: 'solid', opacity: 1 },
    points: makePoints(numPoints),
    streamline: 0.5,
  };
}

function createMockCtx(): CanvasRenderingContext2D {
  const noop = () => {};
  return {
    save: noop,
    restore: noop,
    clearRect: noop,
    fillRect: noop,
    fill: noop,
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
  } as unknown as CanvasRenderingContext2D;
}

describe('strokeRenderer perf baseline', () => {
  it('measures drawStroke for 500-point strokes × 500 strokes', () => {
    const ctx = createMockCtx();
    const strokes = Array.from({ length: 500 }, () => makeStroke(500));
    const t0 = performance.now();
    for (const s of strokes) {
      drawStroke(ctx, s, { ptToPx: 2 });
    }
    const elapsed = performance.now() - t0;
    console.log(`[BENCH] 500 strokes × 500 pts = ${elapsed.toFixed(1)}ms`);
    expect(elapsed).toBeLessThan(30000);
  });

  it('measures incremental: 1 new stroke after 499 existing', () => {
    const ctx = createMockCtx();
    const strokes = Array.from({ length: 500 }, () => makeStroke(500));
    // Full redraw
    const t0 = performance.now();
    for (const s of strokes) drawStroke(ctx, s, { ptToPx: 2 });
    const fullRedraw = performance.now() - t0;

    // One stroke
    const t1 = performance.now();
    drawStroke(ctx, strokes[0], { ptToPx: 2 });
    const oneStroke = performance.now() - t1;

    console.log(`[BENCH] Full redraw (500): ${fullRedraw.toFixed(1)}ms`);
    console.log(`[BENCH] Single stroke:     ${oneStroke.toFixed(1)}ms`);
    console.log(`[BENCH] Ratio:             ${(fullRedraw / oneStroke).toFixed(0)}x`);
    expect(oneStroke).toBeLessThan(fullRedraw);
  });

  it('measures cached vs uncached full redraw (500 strokes)', () => {
    const ctx = createMockCtx();
    const strokes = Array.from({ length: 500 }, () => makeStroke(500));

    // Cold: first call computes everything
    const t0 = performance.now();
    for (const s of strokes) drawStroke(ctx, s, { ptToPx: 2 });
    const cold = performance.now() - t0;

    // Warm: second call hits the WeakMap cache
    const t1 = performance.now();
    for (const s of strokes) drawStroke(ctx, s, { ptToPx: 2 });
    const warm = performance.now() - t1;

    const speedup = cold / warm;
    console.log(`[BENCH] Cold full redraw (500): ${cold.toFixed(1)}ms`);
    console.log(`[BENCH] Warm full redraw (500): ${warm.toFixed(1)}ms`);
    console.log(`[BENCH] Cache speedup:          ${speedup.toFixed(1)}x`);
    expect(warm).toBeLessThan(cold);
  });
});
