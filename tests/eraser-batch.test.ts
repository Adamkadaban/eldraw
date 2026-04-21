import { describe, it, expect, vi } from 'vitest';
import { createRafBatcher, manualClock } from '$lib/canvas/inkBatch';
import { createSpatialIndex } from '$lib/tools/spatialIndex';
import { collectEraseIds, makeEraseFlush } from '$lib/tools/eraserBatch';
import type { Point, StrokeObject, StrokeStyle } from '$lib/types';

const STYLE: StrokeStyle = { color: '#000', width: 2, dash: 'solid', opacity: 1 };

function pt(x: number, y: number): Point {
  return { x, y, pressure: 0.5, t: 0 };
}

function mkStroke(id: string, points: Point[]): StrokeObject {
  return { id, createdAt: 0, type: 'stroke', tool: 'pen', style: STYLE, points };
}

describe('collectEraseIds', () => {
  it('returns deduped ids across a batch that hits one object at many samples', () => {
    const a = mkStroke('a', [pt(0, 0), pt(100, 0)]);
    const idx = createSpatialIndex([a]);
    const samples = Array.from({ length: 10 }, (_, i) => ({ x: 10 + i * 5, y: 0 }));
    expect(collectEraseIds(samples, 4, idx)).toEqual(['a']);
  });

  it('returns empty when nothing is within radius', () => {
    const a = mkStroke('a', [pt(0, 0), pt(10, 0)]);
    const idx = createSpatialIndex([a]);
    expect(collectEraseIds([{ x: 1000, y: 1000 }], 4, idx)).toEqual([]);
  });

  it('accumulates distinct hits across distinct samples', () => {
    const a = mkStroke('a', [pt(0, 0), pt(10, 0)]);
    const b = mkStroke('b', [pt(100, 0), pt(110, 0)]);
    const idx = createSpatialIndex([a, b]);
    const ids = collectEraseIds(
      [
        { x: 5, y: 0 },
        { x: 105, y: 0 },
      ],
      4,
      idx,
    );
    expect(ids.sort()).toEqual(['a', 'b']);
  });

  it('uses the spatial index to skip far-away objects (candidate narrowing)', () => {
    const a = mkStroke('a', [pt(0, 0), pt(10, 0)]);
    const far = mkStroke('far', [pt(10_000, 10_000), pt(10_010, 10_000)]);
    const idx = createSpatialIndex([a, far], 64);
    // sanity: only 'a' is reachable from the sample
    expect(collectEraseIds([{ x: 5, y: 0 }], 4, idx)).toEqual(['a']);
  });
});

describe('eraser rAF flush', () => {
  it('emits one removeObjects call per frame with deduped ids', () => {
    const clock = manualClock();
    const a = mkStroke('a', [pt(0, 0), pt(100, 0)]);
    const b = mkStroke('b', [pt(0, 50), pt(100, 50)]);
    const index = createSpatialIndex([a, b]);

    const remove = vi.fn<(ids: string[]) => void>();
    const flush = makeEraseFlush(() => index, 4, remove);
    const batcher = createRafBatcher<{ x: number; y: number }>(flush, clock);

    for (let i = 0; i < 30; i += 1) batcher.push({ x: i * 3, y: 0 });
    batcher.push({ x: 50, y: 50 });
    expect(remove).not.toHaveBeenCalled();

    clock.tick();
    expect(remove).toHaveBeenCalledTimes(1);
    const ids = remove.mock.calls[0][0];
    expect([...ids].sort()).toEqual(['a', 'b']);
  });

  it('silently skips frames whose samples hit nothing', () => {
    const clock = manualClock();
    const a = mkStroke('a', [pt(0, 0), pt(10, 0)]);
    const index = createSpatialIndex([a]);
    const remove = vi.fn<(ids: string[]) => void>();

    const batcher = createRafBatcher<{ x: number; y: number }>(
      makeEraseFlush(() => index, 4, remove),
      clock,
    );
    batcher.push({ x: 9999, y: 9999 });
    clock.tick();
    expect(remove).not.toHaveBeenCalled();
  });

  it('samples on a later frame produce a separate removeObjects call', () => {
    const clock = manualClock();
    const a = mkStroke('a', [pt(0, 0), pt(10, 0)]);
    const b = mkStroke('b', [pt(100, 0), pt(110, 0)]);
    const index = createSpatialIndex([a, b]);
    const remove = vi.fn<(ids: string[]) => void>();

    const batcher = createRafBatcher<{ x: number; y: number }>(
      makeEraseFlush(() => index, 4, remove),
      clock,
    );
    batcher.push({ x: 5, y: 0 });
    clock.tick();
    batcher.push({ x: 105, y: 0 });
    clock.tick();

    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove.mock.calls[0][0]).toEqual(['a']);
    expect(remove.mock.calls[1][0]).toEqual(['b']);
  });

  it('no-op flush when no index is available yet', () => {
    const clock = manualClock();
    const remove = vi.fn<(ids: string[]) => void>();
    const batcher = createRafBatcher<{ x: number; y: number }>(
      makeEraseFlush(() => null, 4, remove),
      clock,
    );
    batcher.push({ x: 5, y: 0 });
    clock.tick();
    expect(remove).not.toHaveBeenCalled();
  });
});
