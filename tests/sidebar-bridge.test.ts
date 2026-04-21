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

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('sidebar detached window bridge', () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(undefined);
    listeners.clear();
    vi.resetModules();
  });
  afterEach(() => {
    listeners.clear();
  });

  it('ipc wrappers invoke the correct commands', async () => {
    const { openSidebarWindow, closeSidebarWindow, sidebarSync, sidebarSyncBack } =
      await import('../src/lib/ipc/sidebar-window');

    await openSidebarWindow();
    expect(invoke).toHaveBeenCalledWith('open_sidebar_window');

    invoke.mockClear();
    await closeSidebarWindow();
    expect(invoke).toHaveBeenCalledWith('close_sidebar_window');

    invoke.mockClear();
    await sidebarSync({ activeTool: 'pen' });
    expect(invoke).toHaveBeenCalledWith('sidebar_sync', {
      payload: { activeTool: 'pen' },
    });

    invoke.mockClear();
    await sidebarSyncBack({ activeTool: 'line' });
    expect(invoke).toHaveBeenCalledWith('sidebar_sync_back', {
      payload: { activeTool: 'line' },
    });
  });

  it('main side pushes local changes via sidebar_sync', async () => {
    const { startSidebarBridge } = await import('../src/lib/app/sidebarBridge');
    const { sidebar } = await import('../src/lib/store/sidebar');

    sidebar.reset();
    const stop = startSidebarBridge('main');
    await flush();

    invoke.mockClear();
    sidebar.setTool('highlighter');
    await flush();

    const syncCalls = invoke.mock.calls.filter((c) => c[0] === 'sidebar_sync');
    expect(syncCalls.length).toBeGreaterThan(0);
    const payload = syncCalls[syncCalls.length - 1][1] as { payload: { activeTool: string } };
    expect(payload.payload.activeTool).toBe('highlighter');

    stop();
  });

  it('main applies remote snapshots from detached and does not bounce them back', async () => {
    const { startSidebarBridge } = await import('../src/lib/app/sidebarBridge');
    const { sidebar } = await import('../src/lib/store/sidebar');
    const { SIDEBAR_SYNC_BACK_EVENT } = await import('../src/lib/ipc/sidebar-window');

    sidebar.reset();
    const stop = startSidebarBridge('main');
    await flush();

    invoke.mockClear();
    dispatch(SIDEBAR_SYNC_BACK_EVENT, {
      pinned: true,
      activeTool: 'line',
      toolStyles: get(sidebar).toolStyles,
      palettes: get(sidebar).palettes,
      activeColor: '#abcdef',
      laser: get(sidebar).laser,
      tempInkFadeMs: get(sidebar).tempInkFadeMs,
      smoothingPen: get(sidebar).smoothingPen,
      smoothingHighlighter: get(sidebar).smoothingHighlighter,
      smoothingTempInk: get(sidebar).smoothingTempInk,
      presets: [],
    });
    await flush();

    expect(get(sidebar).activeTool).toBe('line');
    expect(get(sidebar).activeColor).toBe('#abcdef');
    const echoes = invoke.mock.calls.filter(
      (c) => c[0] === 'sidebar_sync' || c[0] === 'sidebar_sync_back',
    );
    expect(echoes.length).toBe(0);

    stop();
  });

  it('detached pushes local changes via sidebar_sync_back', async () => {
    const { startSidebarBridge } = await import('../src/lib/app/sidebarBridge');
    const { sidebar } = await import('../src/lib/store/sidebar');

    sidebar.reset();
    const stop = startSidebarBridge('detached');
    await flush();

    invoke.mockClear();
    sidebar.setTool('highlighter');
    sidebar.setActiveColor('#112233');
    await flush();

    const syncBack = invoke.mock.calls.filter((c) => c[0] === 'sidebar_sync_back');
    expect(syncBack.length).toBeGreaterThan(0);
    const last = syncBack[syncBack.length - 1][1] as {
      payload: { activeTool: string; activeColor: string };
    };
    expect(last.payload.activeTool).toBe('highlighter');
    expect(last.payload.activeColor).toBe('#112233');

    const forwardEchoes = invoke.mock.calls.filter((c) => c[0] === 'sidebar_sync');
    expect(forwardEchoes.length).toBe(0);

    stop();
  });

  it('detached applies remote snapshots from main and does not bounce them back', async () => {
    const { startSidebarBridge } = await import('../src/lib/app/sidebarBridge');
    const { sidebar } = await import('../src/lib/store/sidebar');
    const { SIDEBAR_SYNC_EVENT } = await import('../src/lib/ipc/sidebar-window');

    sidebar.reset();
    const stop = startSidebarBridge('detached');
    await flush();

    invoke.mockClear();
    dispatch(SIDEBAR_SYNC_EVENT, {
      pinned: true,
      activeTool: 'eraser',
      toolStyles: get(sidebar).toolStyles,
      palettes: get(sidebar).palettes,
      activeColor: '#778899',
      laser: get(sidebar).laser,
      tempInkFadeMs: get(sidebar).tempInkFadeMs,
      smoothingPen: get(sidebar).smoothingPen,
      smoothingHighlighter: get(sidebar).smoothingHighlighter,
      smoothingTempInk: get(sidebar).smoothingTempInk,
      presets: [],
    });
    await flush();

    expect(get(sidebar).activeTool).toBe('eraser');
    expect(get(sidebar).activeColor).toBe('#778899');
    const echoes = invoke.mock.calls.filter(
      (c) => c[0] === 'sidebar_sync' || c[0] === 'sidebar_sync_back',
    );
    expect(echoes.length).toBe(0);

    stop();
  });

  it('preserves window-local fields (detached, floatingPos) on remote apply', async () => {
    const { sidebar } = await import('../src/lib/store/sidebar');
    sidebar.reset();
    sidebar.setDetached(true);
    sidebar.setFloatingPos({ x: 50, y: 50 });

    sidebar.applyRemote({ activeTool: 'eraser', activeColor: '#123456' });

    const s = get(sidebar);
    expect(s.detached).toBe(true);
    expect(s.floatingPos).toEqual({ x: 50, y: 50 });
    expect(s.activeTool).toBe('eraser');
    expect(s.activeColor).toBe('#123456');
  });

  it('syncableEqual ignores non-syncable fields', async () => {
    const { pickSyncable, syncableEqual, sidebar } = await import('../src/lib/store/sidebar');
    sidebar.reset();
    const a = pickSyncable(get(sidebar));
    sidebar.setDetached(true);
    sidebar.setFloatingPos({ x: 1, y: 2 });
    const b = pickSyncable(get(sidebar));
    expect(syncableEqual(a, b)).toBe(true);
  });
});
