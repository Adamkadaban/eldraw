import { describe, it, expect } from 'vitest';
import { createRafBatcher, manualClock } from '$lib/canvas/inkBatch';

describe('createRafBatcher', () => {
  it('emits one render per frame regardless of event density', () => {
    const clock = manualClock();
    let flushes = 0;
    const batcher = createRafBatcher<number>(() => flushes++, clock);

    for (let i = 0; i < 200; i++) batcher.push(i);
    expect(flushes).toBe(0);

    clock.tick();
    expect(flushes).toBe(1);
  });

  it('passes all coalesced samples to the single flush in arrival order', () => {
    const clock = manualClock();
    const flushed: number[][] = [];
    const batcher = createRafBatcher<number>((b) => flushed.push(b), clock);

    batcher.pushMany([1, 2, 3]);
    batcher.push(4);
    batcher.pushMany([5, 6]);

    clock.tick();
    expect(flushed).toHaveLength(1);
    expect(flushed[0]).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('coalesces across rapid frames: one flush per tick', () => {
    const clock = manualClock();
    const batches: number[][] = [];
    const batcher = createRafBatcher<number>((b) => batches.push(b), clock);

    batcher.push(1);
    batcher.push(2);
    clock.tick();
    batcher.push(3);
    clock.tick();
    batcher.push(4);
    batcher.push(5);
    batcher.push(6);
    clock.tick();

    expect(batches).toEqual([[1, 2], [3], [4, 5, 6]]);
  });

  it('an empty frame does not flush', () => {
    const clock = manualClock();
    let flushes = 0;
    const batcher = createRafBatcher<number>(() => flushes++, clock);

    clock.tick();
    expect(flushes).toBe(0);

    batcher.push(1);
    clock.tick();
    expect(flushes).toBe(1);

    clock.tick();
    expect(flushes).toBe(1);
  });

  it('push after flush schedules a new frame', () => {
    const clock = manualClock();
    const batches: number[][] = [];
    const batcher = createRafBatcher<number>((b) => batches.push(b), clock);

    batcher.push(1);
    clock.tick();
    expect(batches).toEqual([[1]]);

    batcher.push(2);
    expect(clock.pending()).toBe(1);
    clock.tick();
    expect(batches).toEqual([[1], [2]]);
  });

  it('flushNow drains synchronously and cancels the pending frame', () => {
    const clock = manualClock();
    const batches: number[][] = [];
    const batcher = createRafBatcher<number>((b) => batches.push(b), clock);

    batcher.pushMany([1, 2, 3]);
    expect(clock.pending()).toBe(1);
    batcher.flushNow();
    expect(batches).toEqual([[1, 2, 3]]);
    expect(clock.pending()).toBe(0);

    clock.tick();
    expect(batches).toHaveLength(1);
  });

  it('cancel drops pending samples without flushing', () => {
    const clock = manualClock();
    let flushes = 0;
    const batcher = createRafBatcher<number>(() => flushes++, clock);

    batcher.pushMany([1, 2, 3]);
    batcher.cancel();
    clock.tick();
    expect(flushes).toBe(0);
    expect(clock.pending()).toBe(0);
  });

  it('stats track samples, renders, and peak batch size', () => {
    const clock = manualClock();
    const batcher = createRafBatcher<number>(() => undefined, clock);

    batcher.pushMany([1, 2]);
    clock.tick();
    batcher.pushMany([3, 4, 5, 6]);
    clock.tick();

    const s = batcher.stats();
    expect(s.samples).toBe(6);
    expect(s.renders).toBe(2);
    expect(s.lastBatchSize).toBe(4);
    expect(s.peakBatchSize).toBe(4);
  });
});
