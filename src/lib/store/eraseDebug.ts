import { writable, type Readable } from 'svelte/store';

export interface EraseDebugStats {
  /** `true` when `?erasedebug=1` or localStorage flag is set. */
  enabled: boolean;
  /** Total pointermove events observed on the live layer while erasing. */
  pointerMoves: number;
  /** Total objects removed by the eraser across this session. */
  eraseHits: number;
  /** Timestamp (performance.now) of the last pointermove from eraser drag. */
  lastPointerMoveAt: number;
  /** Rolling 1s rates, updated on every sample. */
  eraseHitsPerSec: number;
  pointerMovesPerSec: number;
}

const initial: EraseDebugStats = {
  enabled: false,
  pointerMoves: 0,
  eraseHits: 0,
  lastPointerMoveAt: 0,
  eraseHitsPerSec: 0,
  pointerMovesPerSec: 0,
};

const store = writable<EraseDebugStats>(initial);

function detectEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('erasedebug') === '1') return true;
  } catch {
    // ignore
  }
  try {
    if (window.localStorage.getItem('eldrawEraseDebug') === '1') return true;
  } catch {
    // ignore
  }
  return false;
}

interface Bucket {
  times: number[];
  count: number;
}

function pushWithWindow(bucket: Bucket, now: number, windowMs = 1000): number {
  bucket.times.push(now);
  bucket.count += 1;
  const cutoff = now - windowMs;
  while (bucket.times.length > 0 && bucket.times[0] < cutoff) {
    bucket.times.shift();
  }
  return bucket.times.length;
}

const moveBucket: Bucket = { times: [], count: 0 };
const hitBucket: Bucket = { times: [], count: 0 };

export const eraseDebug: Readable<EraseDebugStats> & {
  init: () => void;
  recordPointerMove: () => void;
  recordHits: (n: number) => void;
} = {
  subscribe: store.subscribe,
  init() {
    const enabled = detectEnabled();
    store.update((s) => ({ ...s, enabled }));
  },
  recordPointerMove() {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const perSec = pushWithWindow(moveBucket, now);
    store.update((s) => ({
      ...s,
      pointerMoves: s.pointerMoves + 1,
      pointerMovesPerSec: perSec,
      lastPointerMoveAt: now,
    }));
  },
  recordHits(n) {
    if (n <= 0) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    for (let i = 0; i < n; i += 1) pushWithWindow(hitBucket, now);
    store.update((s) => ({
      ...s,
      eraseHits: s.eraseHits + n,
      eraseHitsPerSec: hitBucket.times.length,
    }));
  },
};
