import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function makeLocalStorageStub() {
  const store = new Map<string, string>();
  return {
    store,
    impl: {
      getItem: (k: string) => (store.has(k) ? (store.get(k) ?? null) : null),
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size;
      },
    } as Storage,
  };
}

describe('sidebar smoothing persistence', () => {
  let stub: ReturnType<typeof makeLocalStorageStub>;

  beforeEach(() => {
    stub = makeLocalStorageStub();
    vi.stubGlobal('localStorage', stub.impl);
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes smoothing values to localStorage on change', async () => {
    const mod = await import('$lib/store/sidebar');
    const stop = mod.hydrateSidebarFromStorage();

    mod.sidebar.setSmoothing('pen', 73);
    mod.sidebar.setSmoothing('highlighter', 22);
    mod.sidebar.setSmoothing('temp-ink', 4);

    const raw = stub.store.get('eldraw.smoothing.v1');
    expect(raw).toBeDefined();
    expect(JSON.parse(raw as string)).toEqual({ pen: 73, highlighter: 22, tempInk: 4 });

    stop();
  });

  it('restores smoothing values from localStorage on hydrate', async () => {
    stub.store.set('eldraw.smoothing.v1', JSON.stringify({ pen: 81, highlighter: 17, tempInk: 9 }));
    const mod = await import('$lib/store/sidebar');
    const stop = mod.hydrateSidebarFromStorage();

    const s = mod.sidebar.snapshot();
    expect(s.smoothingPen).toBe(81);
    expect(s.smoothingHighlighter).toBe(17);
    expect(s.smoothingTempInk).toBe(9);

    stop();
  });

  it('clamps persisted out-of-range values on load', async () => {
    stub.store.set(
      'eldraw.smoothing.v1',
      JSON.stringify({ pen: -50, highlighter: 500, tempInk: 42 }),
    );
    const mod = await import('$lib/store/sidebar');
    const stop = mod.hydrateSidebarFromStorage();

    const s = mod.sidebar.snapshot();
    expect(s.smoothingPen).toBe(0);
    expect(s.smoothingHighlighter).toBe(100);
    expect(s.smoothingTempInk).toBe(42);

    stop();
  });

  it('ignores malformed persisted smoothing payload', async () => {
    stub.store.set('eldraw.smoothing.v1', '{"pen":"nope"}');
    const mod = await import('$lib/store/sidebar');
    const stop = mod.hydrateSidebarFromStorage();

    const s = mod.sidebar.snapshot();
    expect(s.smoothingPen).toBe(mod.DEFAULT_SMOOTHING_PEN);
    expect(s.smoothingHighlighter).toBe(mod.DEFAULT_SMOOTHING_HIGHLIGHTER);
    expect(s.smoothingTempInk).toBe(mod.DEFAULT_SMOOTHING_TEMP_INK);

    stop();
  });
});
