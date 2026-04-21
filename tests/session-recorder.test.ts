import { describe, it, expect, beforeEach } from 'vitest';
import { createRecorder, type RecorderDeps } from '$lib/session/recorder';
import { replay } from '$lib/session/store';
import { documentStore } from '$lib/store/document';
import { viewport } from '$lib/store/viewport';
import type { Session, SessionEvent } from '$lib/session/types';
import type { EldrawDocument, Page, StrokeObject } from '$lib/types';

class FakeMediaRecorder {
  ondataavailable:
    | ((e: { data: { size: number; arrayBuffer(): Promise<ArrayBuffer> } }) => void)
    | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onstop: (() => void) | null = null;
  start(_interval?: number): void {
    void _interval;
  }
  pause(): void {}
  resume(): void {}
  stop(): void {
    this.onstop?.();
  }
  emitChunk(bytes: Uint8Array): void {
    this.ondataavailable?.({
      data: {
        size: bytes.byteLength,
        arrayBuffer: () => Promise.resolve(bytes.buffer),
      },
    });
  }
}

class FakeStream {
  getTracks(): { stop(): void }[] {
    return [{ stop() {} }];
  }
}

function pdfPage(i: number): Page {
  return {
    pageIndex: i,
    type: 'pdf',
    insertedAfterPdfPage: null,
    width: 612,
    height: 792,
    objects: [],
  };
}

function doc(): EldrawDocument {
  return {
    version: 1,
    pdfHash: 'h',
    pdfPath: '/tmp/x.pdf',
    pages: [pdfPage(0), pdfPage(1)],
    palettes: [],
    prefs: {
      sidebarPinned: true,
      defaultTool: 'pen',
      toolDefaults: {
        pen: { color: '#000', width: 2, dash: 'solid', opacity: 1 },
        highlighter: { color: '#ff0', width: 14, dash: 'solid', opacity: 0.3 },
        line: { color: '#000', width: 2, dash: 'solid', opacity: 1 },
      },
    },
  };
}

function stroke(id: string): StrokeObject {
  return {
    id,
    createdAt: 0,
    type: 'stroke',
    tool: 'pen',
    style: { color: '#000', width: 2, dash: 'solid', opacity: 1 },
    points: [{ x: 0, y: 0, pressure: 0.5, t: 0 }],
  };
}

interface Harness {
  recorder: ReturnType<typeof createRecorder>;
  fakeRec: FakeMediaRecorder;
  audioChunks: { bytes: Uint8Array; reset: boolean }[];
  written: Session[];
  now: { ms: number };
}

function makeHarness(): Harness {
  const fakeRec = new FakeMediaRecorder();
  const audioChunks: { bytes: Uint8Array; reset: boolean }[] = [];
  const written: Session[] = [];
  const now = { ms: 0 };
  const deps: RecorderDeps = {
    now: () => now.ms,
    getUserMedia: () => Promise.resolve(new FakeStream() as unknown as MediaStream),
    createRecorder: () => fakeRec as unknown as MediaRecorder,
    persistAudioChunk: async (_path, _id, bytes, reset) => {
      audioChunks.push({ bytes, reset });
    },
    persistSession: async (_path, _id, session) => {
      written.push(session);
    },
  };
  return { recorder: createRecorder(deps), fakeRec, audioChunks, written, now };
}

describe('recorder', () => {
  beforeEach(() => {
    documentStore.load(doc());
    viewport.setPage(0, 2);
    replay.exit();
  });

  it('starts recording and emits an initial pageChange at t=0', async () => {
    const h = makeHarness();
    h.now.ms = 100;
    await h.recorder.start('/tmp/x.pdf');
    const status = h.recorder.snapshot();
    expect(status.status).toBe('recording');
    const events = h.recorder._inject.events;
    expect(events[0]).toMatchObject({ kind: 'pageChange', t: 0, page: 0 });
  });

  it('collects document mutations with monotonic t while recording', async () => {
    const h = makeHarness();
    h.now.ms = 0;
    await h.recorder.start('/tmp/x.pdf');
    h.now.ms = 500;
    documentStore.addObject(0, stroke('s1'));
    h.now.ms = 1_200;
    documentStore.addObject(0, stroke('s2'));

    const events = h.recorder._inject.events as SessionEvent[];
    const strokeEvents = events.filter((e) => e.kind === 'stroke');
    expect(strokeEvents).toHaveLength(2);
    expect(strokeEvents[0].t).toBe(500);
    expect(strokeEvents[1].t).toBe(1_200);
    expect(strokeEvents[0].t).toBeLessThanOrEqual(strokeEvents[1].t);
  });

  it('emits pageChange on viewport change, ignoring repeats', async () => {
    const h = makeHarness();
    h.now.ms = 0;
    await h.recorder.start('/tmp/x.pdf');
    h.now.ms = 300;
    viewport.setPage(1, 2);
    h.now.ms = 400;
    viewport.setPage(1, 2);
    const events = h.recorder._inject.events as SessionEvent[];
    const pages = events.filter((e) => e.kind === 'pageChange');
    expect(pages).toHaveLength(2);
    expect(pages[0].page).toBe(0);
    expect(pages[1]).toMatchObject({ page: 1, t: 300 });
  });

  it('rejects a second start while busy', async () => {
    const h = makeHarness();
    await h.recorder.start('/tmp/x.pdf');
    await expect(h.recorder.start('/tmp/x.pdf')).rejects.toThrow(/busy/);
  });

  it('rejects start while replay is active', async () => {
    const h = makeHarness();
    replay.enter(
      {
        id: 'abc',
        name: 'x',
        createdAt: 0,
        durationMs: 0,
        audioFile: 'audio.webm',
        audioMime: 'audio/webm;codecs=opus',
        hasAudio: true,
      },
      'blob:fake',
    );
    await expect(h.recorder.start('/tmp/x.pdf')).rejects.toThrow(/replay/);
    expect(h.recorder.snapshot().status).toBe('idle');
    replay.exit();
  });

  it('stop persists session with duration and events, returns to idle', async () => {
    const h = makeHarness();
    h.now.ms = 0;
    await h.recorder.start('/tmp/x.pdf');
    h.now.ms = 800;
    documentStore.addObject(0, stroke('s1'));
    h.now.ms = 2_000;
    const session = await h.recorder.stop();
    expect(session).not.toBeNull();
    expect(h.written).toHaveLength(1);
    expect(h.written[0].durationMs).toBe(2_000);
    expect(h.written[0].events.some((e) => e.kind === 'stroke')).toBe(true);
    expect(h.recorder.snapshot().status).toBe('idle');
  });

  it('first persisted audio chunk has reset=true, later have reset=false', async () => {
    const h = makeHarness();
    await h.recorder.start('/tmp/x.pdf');
    h.fakeRec.emitChunk(new Uint8Array([1, 2, 3]));
    h.fakeRec.emitChunk(new Uint8Array([4, 5]));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(h.audioChunks.map((c) => c.reset)).toEqual([true, false]);
    await h.recorder.stop();
  });

  it('does not collect mutations after stop', async () => {
    const h = makeHarness();
    await h.recorder.start('/tmp/x.pdf');
    await h.recorder.stop();
    const before = h.recorder._inject.events.length;
    documentStore.addObject(0, stroke('late'));
    expect(h.recorder._inject.events.length).toBe(before);
  });
});
