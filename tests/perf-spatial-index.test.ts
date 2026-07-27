import { describe, it, expect } from 'vitest';
import { createSpatialIndex, queryPoint } from '$lib/tools/spatialIndex';
import type { StrokeObject, Point, AnyObject } from '$lib/types';

function makePoints(n: number): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    pts.push({
      x: Math.random() * 800,
      y: Math.random() * 600,
      pressure: 0.5,
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
    style: { color: '#000', width: 2, dash: 'solid', opacity: 1 },
    points: makePoints(numPoints),
  };
}

describe('spatialIndex perf baseline', () => {
  it('measures full rebuild for 500 strokes × 200 pts', () => {
    const objects: AnyObject[] = Array.from({ length: 500 }, () => makeStroke(200));
    const t0 = performance.now();
    const iterations = 10;
    for (let i = 0; i < iterations; i++) {
      createSpatialIndex(objects);
    }
    const elapsed = performance.now() - t0;
    const perBuild = elapsed / iterations;
    console.log(
      `[BENCH] spatialIndex build (500 strokes × 200 pts) ×${iterations}: ${elapsed.toFixed(1)}ms (${perBuild.toFixed(1)}ms/build)`,
    );
    expect(elapsed).toBeLessThan(30000);
  });

  it('measures query cost', () => {
    const objects: AnyObject[] = Array.from({ length: 500 }, () => makeStroke(200));
    const index = createSpatialIndex(objects);
    const iterations = 1000;
    const t0 = performance.now();
    for (let i = 0; i < iterations; i++) {
      queryPoint(index, Math.random() * 800, Math.random() * 600, 8);
    }
    const elapsed = performance.now() - t0;
    console.log(
      `[BENCH] spatialIndex query ×${iterations}: ${elapsed.toFixed(1)}ms (${(elapsed / iterations).toFixed(3)}ms/query)`,
    );
    expect(elapsed).toBeLessThan(10000);
  });
});
