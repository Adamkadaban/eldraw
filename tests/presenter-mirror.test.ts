import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

type Handler = (event: { payload: unknown }) => void;

const invoke = vi.fn();
const listeners = new Map<string, Set<Handler>>();

const listen = vi.fn((name: string, handler: Handler) => {
  const set = listeners.get(name) ?? new Set<Handler>();
  set.add(handler);
  listeners.set(name, set);
  return Promise.resolve(() => set.delete(handler));
});

function dispatch(name: string, payload: unknown): void {
  const set = listeners.get(name);
  if (!set) return;
  for (const h of set) h({ payload });
}

vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen }));

describe('presenter mirror + event wiring', () => {
  beforeEach(() => {
    invoke.mockReset();
    listeners.clear();
    vi.resetModules();
  });
  afterEach(() => {
    listeners.clear();
  });

  it('applies sync payloads delivered via the presenter-sync event', async () => {
    const { onPresenterSync, PRESENTER_SYNC_EVENT } = await import('../src/lib/ipc/presenter');
    const { presenterMirror } = await import('../src/lib/store/presenterMirror');

    presenterMirror.reset();
    const stop = await onPresenterSync((p) => presenterMirror.apply(p));

    dispatch(PRESENTER_SYNC_EVENT, {
      pdfId: 'hash-1',
      pageIndex: 2,
      document: {
        version: 1,
        pdfHash: 'hash-1',
        pdfPath: '/tmp/a.pdf',
        pages: [],
        palettes: [],
        prefs: {
          sidebarPinned: true,
          defaultTool: 'pen',
          toolDefaults: {
            pen: { color: '#000', width: 2, dash: 'solid', opacity: 1 },
            highlighter: { color: '#ff0', width: 10, dash: 'solid', opacity: 0.3 },
            line: { color: '#000', width: 2, dash: 'solid', opacity: 1 },
          },
        },
      },
    });

    const state = get(presenterMirror);
    expect(state.pdfId).toBe('hash-1');
    expect(state.pageIndex).toBe(2);
    expect(state.document?.pdfHash).toBe('hash-1');

    stop();
  });

  it('reset clears the mirror', async () => {
    const { presenterMirror } = await import('../src/lib/store/presenterMirror');
    presenterMirror.apply({ pdfId: 'x', pageIndex: 5, document: null });
    presenterMirror.reset();
    const state = get(presenterMirror);
    expect(state.pdfId).toBeNull();
    expect(state.pageIndex).toBe(0);
    expect(state.document).toBeNull();
  });

  it('openPresenterWindow invokes the Rust command with the monitor index', async () => {
    const { openPresenterWindow, closePresenterWindow, presenterSync, listMonitors } =
      await import('../src/lib/ipc/presenter');

    invoke.mockResolvedValue(undefined);
    await openPresenterWindow(1);
    expect(invoke).toHaveBeenCalledWith('open_presenter_window', { monitorIndex: 1 });

    invoke.mockClear();
    await closePresenterWindow();
    expect(invoke).toHaveBeenCalledWith('close_presenter_window');

    invoke.mockClear();
    await presenterSync({ pdfId: null, pageIndex: 0, document: null });
    expect(invoke).toHaveBeenCalledWith('presenter_sync', {
      payload: { pdfId: null, pageIndex: 0, document: null },
    });

    invoke.mockClear();
    invoke.mockResolvedValue([]);
    await listMonitors();
    expect(invoke).toHaveBeenCalledWith('list_monitors');
  });
});
