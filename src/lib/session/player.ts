import { get, writable, type Readable } from 'svelte/store';
import type { AnyObject, ObjectId, StrokeObject } from '$lib/types';
import { sliceStrokePointsUpTo, strokeDurationMs } from './events';
import type { Session, SessionEvent } from './types';

export interface PlayerStatus {
  playing: boolean;
  currentTimeMs: number;
  durationMs: number;
  currentPage: number;
}

export interface ReplayRenderState {
  currentPage: number;
  /** All objects, by page, that have been applied up to the current time. */
  byPage: Map<number, AnyObject[]>;
  /** Strokes currently mid-animation on the current page (partial points only). */
  activeStrokes: StrokeObject[];
}

export interface PlayerDeps {
  onPageChange?: (page: number) => void;
  /** Called whenever render state changes, for the replay layer to redraw. */
  onRender?: (state: ReplayRenderState) => void;
}

/**
 * Compute the full replay state at time `tMs` by linearly scanning events
 * from `fromIndex`. For a pure seek, pass `fromIndex = 0` and an empty
 * accumulator. Returns the new cursor position and whether a page changed.
 */
export function replayStateAt(
  events: readonly SessionEvent[],
  tMs: number,
): {
  cursor: number;
  currentPage: number;
  byPage: Map<number, AnyObject[]>;
  activeStrokes: StrokeObject[];
} {
  const byPage = new Map<number, AnyObject[]>();
  const activeStrokes: StrokeObject[] = [];
  let currentPage = 0;
  let cursor = 0;

  function getPage(page: number): AnyObject[] {
    let arr = byPage.get(page);
    if (!arr) {
      arr = [];
      byPage.set(page, arr);
    }
    return arr;
  }

  function removeIds(page: number, ids: ObjectId[]) {
    const arr = byPage.get(page);
    if (!arr) return;
    const drop = new Set(ids);
    byPage.set(
      page,
      arr.filter((o) => !drop.has(o.id)),
    );
  }

  for (let i = 0; i < events.length; i += 1) {
    const ev = events[i];
    if (ev.t > tMs) break;
    cursor = i + 1;
    switch (ev.kind) {
      case 'pageChange':
        currentPage = ev.page;
        break;
      case 'stroke':
        getPage(ev.page).push(ev.stroke);
        break;
      case 'objectAdd':
        getPage(ev.page).push(ev.obj);
        break;
      case 'objectDel':
        removeIds(ev.page, ev.ids);
        break;
      case 'objectUpdate': {
        const arr = byPage.get(ev.page);
        if (arr) {
          byPage.set(
            ev.page,
            arr.map((o) => (o.id === ev.id ? ev.after : o)),
          );
        }
        break;
      }
    }
  }

  for (let i = cursor; i < events.length; i += 1) {
    const ev = events[i];
    if (ev.kind !== 'stroke') continue;
    const duration = strokeDurationMs(ev.stroke);
    const strokeStart = ev.t - duration;
    if (strokeStart <= tMs && tMs < ev.t && ev.page === currentPage) {
      const offset = tMs - strokeStart;
      activeStrokes.push(sliceStrokePointsUpTo(ev.stroke, offset));
    }
  }

  return { cursor, currentPage, byPage, activeStrokes };
}

export function chapterMarkers(events: readonly SessionEvent[]): { t: number; page: number }[] {
  const out: { t: number; page: number }[] = [];
  let lastPage = -1;
  for (const ev of events) {
    if (ev.kind === 'pageChange' && ev.page !== lastPage) {
      out.push({ t: ev.t, page: ev.page });
      lastPage = ev.page;
    }
  }
  return out;
}

export function nearestPageChangeAtOrBefore(events: readonly SessionEvent[], tMs: number): number {
  let best = 0;
  for (const ev of events) {
    if (ev.t > tMs) break;
    if (ev.kind === 'pageChange') best = ev.t;
  }
  return best;
}

export interface PlayerController {
  subscribe: Readable<PlayerStatus>['subscribe'];
  render: Readable<ReplayRenderState>;
  load(session: Session, audio: HTMLAudioElement, deps?: PlayerDeps): void;
  play(): void;
  pause(): void;
  toggle(): void;
  seek(ms: number): void;
  stop(): void;
  snapshot(): PlayerStatus;
  /** For tests: compute state at an arbitrary time without an audio element. */
  stateAt(ms: number): ReplayRenderState;
}

const EMPTY_RENDER: ReplayRenderState = {
  currentPage: 0,
  byPage: new Map(),
  activeStrokes: [],
};

export function createPlayer(): PlayerController {
  const state = writable<PlayerStatus>({
    playing: false,
    currentTimeMs: 0,
    durationMs: 0,
    currentPage: 0,
  });
  const render = writable<ReplayRenderState>(EMPTY_RENDER);
  let session: Session | null = null;
  let audio: HTMLAudioElement | null = null;
  let deps: PlayerDeps = {};
  let raf = 0;
  let lastPage = -1;

  function emit(time: number): void {
    if (!session) return;
    const r = replayStateAt(session.events, time);
    state.update((s) => ({
      ...s,
      currentTimeMs: time,
      currentPage: r.currentPage,
    }));
    if (r.currentPage !== lastPage) {
      lastPage = r.currentPage;
      deps.onPageChange?.(r.currentPage);
    }
    const next: ReplayRenderState = {
      currentPage: r.currentPage,
      byPage: r.byPage,
      activeStrokes: r.activeStrokes,
    };
    render.set(next);
    deps.onRender?.(next);
  }

  function loop(): void {
    if (!audio || !session) return;
    emit(audio.currentTime * 1000);
    raf = requestAnimationFrame(loop);
  }

  function load(s: Session, a: HTMLAudioElement, d: PlayerDeps = {}): void {
    session = s;
    audio = a;
    deps = d;
    lastPage = -1;
    state.set({
      playing: false,
      currentTimeMs: 0,
      durationMs: s.durationMs,
      currentPage: 0,
    });
    a.addEventListener('play', () => {
      state.update((v) => ({ ...v, playing: true }));
      if (raf === 0) loop();
    });
    a.addEventListener('pause', () => {
      state.update((v) => ({ ...v, playing: false }));
      if (raf !== 0) cancelAnimationFrame(raf);
      raf = 0;
      if (audio) emit(audio.currentTime * 1000);
    });
    a.addEventListener('seeked', () => {
      if (audio) emit(audio.currentTime * 1000);
    });
    a.addEventListener('timeupdate', () => {
      if (!audio) return;
      state.update((v) => ({ ...v, currentTimeMs: audio!.currentTime * 1000 }));
    });
    a.addEventListener('ended', () => {
      state.update((v) => ({ ...v, playing: false }));
      if (raf !== 0) cancelAnimationFrame(raf);
      raf = 0;
    });
    emit(0);
  }

  function play(): void {
    void audio?.play();
  }
  function pause(): void {
    audio?.pause();
  }
  function toggle(): void {
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  }
  function seek(ms: number): void {
    if (!audio) return;
    const clamped = Math.max(0, Math.min((session?.durationMs ?? 0) / 1000, ms / 1000));
    audio.currentTime = clamped;
    emit(clamped * 1000);
  }

  function stop(): void {
    audio?.pause();
    if (raf !== 0) cancelAnimationFrame(raf);
    raf = 0;
    audio = null;
    session = null;
    deps = {};
    lastPage = -1;
    state.set({ playing: false, currentTimeMs: 0, durationMs: 0, currentPage: 0 });
    render.set(EMPTY_RENDER);
  }

  function stateAt(ms: number): ReplayRenderState {
    if (!session) {
      return { currentPage: 0, byPage: new Map(), activeStrokes: [] };
    }
    const r = replayStateAt(session.events, ms);
    return { currentPage: r.currentPage, byPage: r.byPage, activeStrokes: r.activeStrokes };
  }

  return {
    subscribe: state.subscribe,
    render: { subscribe: render.subscribe },
    load,
    play,
    pause,
    toggle,
    seek,
    stop,
    snapshot: () => get(state),
    stateAt,
  };
}

export const player: PlayerController = createPlayer();
export const playerState: Readable<PlayerStatus> = { subscribe: player.subscribe };
