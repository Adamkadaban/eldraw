import { get, writable, type Readable } from 'svelte/store';
import { documentStore } from '$lib/store/document';
import { viewportStore } from '$lib/store/viewport';
import { warn, log } from '$lib/log';
import { writeAudioChunk, writeSession } from './ipc';
import { mutationToSessionEvents } from './events';
import { replay } from './store';
import {
  defaultSessionName,
  makeSessionId,
  type Session,
  type SessionEvent,
  type SessionMeta,
} from './types';

export type RecorderStatus = 'idle' | 'requesting' | 'recording' | 'paused' | 'error';

export interface RecorderState {
  status: RecorderStatus;
  sessionId: string | null;
  startedAt: number | null;
  elapsedMs: number;
  error: string | null;
}

const initialState: RecorderState = {
  status: 'idle',
  sessionId: null,
  startedAt: null,
  elapsedMs: 0,
  error: null,
};

export interface RecorderDeps {
  now: () => number;
  getUserMedia: (c: MediaStreamConstraints) => Promise<MediaStream>;
  createRecorder: (stream: MediaStream, mime: string) => MediaRecorder;
  persistAudioChunk: (
    pdfPath: string,
    sessionId: string,
    bytes: Uint8Array,
    reset: boolean,
  ) => Promise<void>;
  persistSession: (pdfPath: string, sessionId: string, session: Session) => Promise<void>;
}

const AUDIO_MIME = 'audio/webm;codecs=opus';
const AUDIO_BITRATE = 32_000;
const CHUNK_MS = 1000;

function browserDeps(): RecorderDeps {
  return {
    now: () => performance.now(),
    getUserMedia: (c) => navigator.mediaDevices.getUserMedia(c),
    createRecorder: (stream, mime) =>
      new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: AUDIO_BITRATE }),
    persistAudioChunk: writeAudioChunk,
    persistSession: writeSession,
  };
}

export function createRecorder(deps: RecorderDeps = browserDeps()) {
  const state = writable<RecorderState>(initialState);

  let stream: MediaStream | null = null;
  let mediaRecorder: MediaRecorder | null = null;
  let unsubscribeMutations: (() => void) | null = null;
  let unsubscribeViewport: (() => void) | null = null;
  let events: SessionEvent[] = [];
  let sessionStart = -1;
  let pausedOffsetMs = 0;
  let pauseStartedAt: number | null = null;
  let lastPage = -1;
  let firstChunk = true;
  let currentPdfPath: string | null = null;
  let sessionId: string | null = null;
  let sessionName = '';
  let sessionCreatedAt = 0;
  let tick: ReturnType<typeof setInterval> | null = null;

  function currentElapsed(): number {
    if (sessionStart < 0) return 0;
    const raw = deps.now() - sessionStart;
    const paused = pauseStartedAt !== null ? deps.now() - pauseStartedAt : 0;
    return Math.max(0, raw - pausedOffsetMs - paused);
  }

  function pushSessionEvent(ev: SessionEvent) {
    events.push(ev);
  }

  function onMutation(ev: Parameters<Parameters<typeof documentStore.onMutation>[0]>[0]) {
    if (get(state).status !== 'recording') return;
    const t = currentElapsed();
    for (const se of mutationToSessionEvents(ev, t)) pushSessionEvent(se);
  }

  function onViewport(v: { currentPageIndex: number }) {
    if (get(state).status !== 'recording') return;
    if (v.currentPageIndex === lastPage) return;
    lastPage = v.currentPageIndex;
    pushSessionEvent({ kind: 'pageChange', t: currentElapsed(), page: lastPage });
  }

  async function start(pdfPath: string, nameHint?: string): Promise<void> {
    if (get(state).status !== 'idle' && get(state).status !== 'error') {
      throw new Error('recorder busy');
    }
    if (get(replay).active) {
      throw new Error('cannot record while a session is being replayed');
    }
    state.update((s) => ({ ...s, status: 'requesting', error: null }));
    let ms: MediaStream;
    try {
      ms = await deps.getUserMedia({ audio: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      state.update((s) => ({ ...s, status: 'error', error: msg }));
      throw err;
    }
    stream = ms;
    const id = makeSessionId();
    const createdAt = Date.now();
    sessionId = id;
    sessionCreatedAt = createdAt;
    sessionName = nameHint?.trim() || defaultSessionName(createdAt);
    currentPdfPath = pdfPath;
    events = [];
    pausedOffsetMs = 0;
    pauseStartedAt = null;
    firstChunk = true;

    const recorder = deps.createRecorder(ms, AUDIO_MIME);
    mediaRecorder = recorder;

    recorder.ondataavailable = async (e: BlobEvent) => {
      if (!currentPdfPath || !sessionId) return;
      if (!e.data || e.data.size === 0) return;
      try {
        const buf = new Uint8Array(await e.data.arrayBuffer());
        const reset = firstChunk;
        firstChunk = false;
        await deps.persistAudioChunk(currentPdfPath, sessionId, buf, reset);
      } catch (err) {
        warn('session', `audio chunk write failed ${String(err)}`);
      }
    };
    recorder.onerror = (e) => {
      warn('session', `MediaRecorder error ${String((e as ErrorEvent).error ?? e)}`);
    };

    sessionStart = deps.now();
    const vp = get(viewportStore);
    lastPage = vp.currentPageIndex;
    pushSessionEvent({ kind: 'pageChange', t: 0, page: lastPage });

    unsubscribeMutations = documentStore.onMutation(onMutation);
    unsubscribeViewport = viewportStore.subscribe(onViewport);

    recorder.start(CHUNK_MS);
    state.set({
      status: 'recording',
      sessionId: id,
      startedAt: sessionStart,
      elapsedMs: 0,
      error: null,
    });
    tick = setInterval(() => {
      state.update((s) => (s.status === 'recording' ? { ...s, elapsedMs: currentElapsed() } : s));
    }, 250);
    log('session', `recording started id=${id}`);
  }

  function pause(): void {
    if (get(state).status !== 'recording') return;
    mediaRecorder?.pause();
    pauseStartedAt = deps.now();
    state.update((s) => ({ ...s, status: 'paused' }));
  }

  function resume(): void {
    if (get(state).status !== 'paused') return;
    if (pauseStartedAt !== null) {
      pausedOffsetMs += deps.now() - pauseStartedAt;
      pauseStartedAt = null;
    }
    mediaRecorder?.resume();
    state.update((s) => ({ ...s, status: 'recording' }));
  }

  async function stop(): Promise<Session | null> {
    const s = get(state);
    if (s.status !== 'recording' && s.status !== 'paused') return null;
    if (!sessionId || !currentPdfPath) return null;
    if (pauseStartedAt !== null) {
      pausedOffsetMs += deps.now() - pauseStartedAt;
      pauseStartedAt = null;
    }
    const duration = currentElapsed();

    await new Promise<void>((resolve) => {
      const rec = mediaRecorder;
      if (!rec) return resolve();
      rec.onstop = () => resolve();
      try {
        rec.stop();
      } catch {
        resolve();
      }
    });
    for (const t of stream?.getTracks() ?? []) t.stop();

    unsubscribeMutations?.();
    unsubscribeMutations = null;
    unsubscribeViewport?.();
    unsubscribeViewport = null;
    if (tick) {
      clearInterval(tick);
      tick = null;
    }

    const meta: SessionMeta = {
      id: sessionId,
      name: sessionName,
      createdAt: sessionCreatedAt,
      durationMs: Math.round(duration),
      audioFile: 'audio.webm',
      audioMime: AUDIO_MIME,
    };
    const session: Session = { ...meta, events };
    try {
      await deps.persistSession(currentPdfPath, sessionId, session);
      log('session', `recording stopped id=${sessionId} dur=${Math.round(duration)}ms`);
    } catch (err) {
      state.update((v) => ({
        ...v,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      }));
      throw err;
    }

    stream = null;
    mediaRecorder = null;
    currentPdfPath = null;
    sessionId = null;
    sessionStart = -1;
    state.set(initialState);
    return session;
  }

  return {
    subscribe: state.subscribe,
    start,
    pause,
    resume,
    stop,
    snapshot(): RecorderState {
      return get(state);
    },
    _inject: {
      get events(): readonly SessionEvent[] {
        return events;
      },
    },
  };
}

export type Recorder = ReturnType<typeof createRecorder>;

export const recorder: Recorder = createRecorder(
  typeof navigator !== 'undefined' &&
    typeof (globalThis as { MediaRecorder?: unknown }).MediaRecorder !== 'undefined'
    ? browserDeps()
    : stubDeps(),
);

export const recorderState: Readable<RecorderState> = { subscribe: recorder.subscribe };

function stubDeps(): RecorderDeps {
  return {
    now: () => Date.now(),
    getUserMedia: () => Promise.reject(new Error('MediaRecorder unavailable')),
    createRecorder: () => {
      throw new Error('MediaRecorder unavailable');
    },
    persistAudioChunk: writeAudioChunk,
    persistSession: writeSession,
  };
}
