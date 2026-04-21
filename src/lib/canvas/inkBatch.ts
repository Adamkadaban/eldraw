/**
 * Pure, testable rAF batch scheduler for pointer-to-render pipelines.
 *
 * The live-drawing hot path receives many more pointer samples per second
 * than we can realistically paint (coalesced events push this well past
 * 240 Hz on some stylii). We don't want one render per sample — we want
 * one render per frame, fed with *all* samples that arrived in between.
 *
 * This module is a plain function state machine; it has no DOM or Svelte
 * dependencies so it can be unit-tested deterministically.
 */

export interface BatchClock {
  now: () => number;
  requestFrame: (cb: (t: number) => void) => number;
  cancelFrame: (id: number) => void;
}

export interface BatchStats {
  /** Samples consumed since the batcher was created. */
  samples: number;
  /** Render ticks emitted since the batcher was created. */
  renders: number;
  /** Samples consumed during the most recent render tick. */
  lastBatchSize: number;
  /** Largest batch ever flushed in a single tick. */
  peakBatchSize: number;
}

export interface Batcher<T> {
  push: (sample: T) => void;
  pushMany: (samples: readonly T[]) => void;
  flushNow: () => void;
  cancel: () => void;
  stats: () => BatchStats;
}

/**
 * Create a batcher that coalesces `push` / `pushMany` calls into a single
 * `onFlush` per animation frame. `onFlush` receives every pending sample
 * in arrival order; the caller is responsible for ingesting them into the
 * live stroke and repainting.
 */
export function createRafBatcher<T>(
  onFlush: (samples: T[]) => void,
  clock: BatchClock = defaultClock(),
): Batcher<T> {
  const queue: T[] = [];
  let frameId: number | null = null;
  const stats: BatchStats = { samples: 0, renders: 0, lastBatchSize: 0, peakBatchSize: 0 };

  function schedule() {
    if (frameId !== null) return;
    frameId = clock.requestFrame(() => {
      frameId = null;
      flush();
    });
  }

  function flush() {
    if (queue.length === 0) return;
    const batch = queue.splice(0, queue.length);
    stats.renders += 1;
    stats.lastBatchSize = batch.length;
    if (batch.length > stats.peakBatchSize) stats.peakBatchSize = batch.length;
    onFlush(batch);
  }

  return {
    push(sample) {
      queue.push(sample);
      stats.samples += 1;
      schedule();
    },
    pushMany(samples) {
      if (samples.length === 0) return;
      for (const s of samples) queue.push(s);
      stats.samples += samples.length;
      schedule();
    },
    flushNow() {
      if (frameId !== null) {
        clock.cancelFrame(frameId);
        frameId = null;
      }
      flush();
    },
    cancel() {
      if (frameId !== null) {
        clock.cancelFrame(frameId);
        frameId = null;
      }
      queue.length = 0;
    },
    stats: () => ({ ...stats }),
  };
}

function defaultClock(): BatchClock {
  if (typeof requestAnimationFrame === 'function') {
    return {
      now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
      requestFrame: (cb) => requestAnimationFrame(cb),
      cancelFrame: (id) => cancelAnimationFrame(id),
    };
  }
  return {
    now: () => Date.now(),
    requestFrame: (cb) => setTimeout(() => cb(Date.now()), 16) as unknown as number,
    cancelFrame: (id) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
  };
}

/**
 * A manually-advanced clock for tests. `tick()` fires every pending frame
 * callback once, in FIFO order, simulating one rAF boundary.
 */
export function manualClock(startMs = 0): BatchClock & {
  tick: () => void;
  advance: (ms: number) => void;
  pending: () => number;
} {
  let nowMs = startMs;
  let nextId = 1;
  const pending = new Map<number, (t: number) => void>();

  return {
    now: () => nowMs,
    requestFrame: (cb) => {
      const id = nextId++;
      pending.set(id, cb);
      return id;
    },
    cancelFrame: (id) => {
      pending.delete(id);
    },
    tick: () => {
      const snapshot = Array.from(pending.entries());
      pending.clear();
      for (const [, cb] of snapshot) cb(nowMs);
    },
    advance: (ms) => {
      nowMs += ms;
    },
    pending: () => pending.size,
  };
}
