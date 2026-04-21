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

describe('sidebar straight-edge snap setting', () => {
  let stub: ReturnType<typeof makeLocalStorageStub>;

  beforeEach(() => {
    stub = makeLocalStorageStub();
    vi.stubGlobal('localStorage', stub.impl);
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults to 15°', async () => {
    const mod = await import('$lib/store/sidebar');
    expect(mod.sidebar.snapshot().straightEdgeSnapStep).toBe(mod.DEFAULT_STRAIGHT_EDGE_SNAP_STEP);
  });

  it('clamps out-of-range updates to [MIN, MAX]', async () => {
    const mod = await import('$lib/store/sidebar');
    mod.sidebar.setStraightEdgeSnapStep(-5);
    expect(mod.sidebar.snapshot().straightEdgeSnapStep).toBe(mod.MIN_STRAIGHT_EDGE_SNAP_STEP);
    mod.sidebar.setStraightEdgeSnapStep(9999);
    expect(mod.sidebar.snapshot().straightEdgeSnapStep).toBe(mod.MAX_STRAIGHT_EDGE_SNAP_STEP);
    mod.sidebar.setStraightEdgeSnapStep(30);
    expect(mod.sidebar.snapshot().straightEdgeSnapStep).toBe(30);
  });

  it('persists and restores the snap step', async () => {
    const mod = await import('$lib/store/sidebar');
    const stop = mod.hydrateSidebarFromStorage();
    mod.sidebar.setStraightEdgeSnapStep(45);
    const raw = stub.store.get('eldraw.straight-edge.v1');
    expect(raw).toBeDefined();
    expect(JSON.parse(raw as string)).toEqual({ snapStepDeg: 45 });
    stop();

    vi.resetModules();
    stub.store.set('eldraw.straight-edge.v1', JSON.stringify({ snapStepDeg: 60 }));
    const reloaded = await import('$lib/store/sidebar');
    const stop2 = reloaded.hydrateSidebarFromStorage();
    expect(reloaded.sidebar.snapshot().straightEdgeSnapStep).toBe(60);
    stop2();
  });

  it('ignores malformed persisted payload', async () => {
    stub.store.set('eldraw.straight-edge.v1', '{"snapStepDeg":"nope"}');
    const mod = await import('$lib/store/sidebar');
    const stop = mod.hydrateSidebarFromStorage();
    expect(mod.sidebar.snapshot().straightEdgeSnapStep).toBe(mod.DEFAULT_STRAIGHT_EDGE_SNAP_STEP);
    stop();
  });
});
