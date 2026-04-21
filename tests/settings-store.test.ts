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

describe('settings store', () => {
  let stub: ReturnType<typeof makeLocalStorageStub>;

  beforeEach(() => {
    stub = makeLocalStorageStub();
    vi.stubGlobal('localStorage', stub.impl);
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults reload behavior to keep', async () => {
    const { settings } = await import('$lib/store/settings');
    expect(settings.snapshot().reloadBehavior).toBe('keep');
  });

  it('setReloadBehavior updates and persists', async () => {
    const { settings } = await import('$lib/store/settings');
    settings.setReloadBehavior('discard');
    expect(settings.snapshot().reloadBehavior).toBe('discard');
    expect(stub.store.get('eldraw.settings.v1')).toContain('discard');
  });

  it('reads back persisted value on fresh module load', async () => {
    stub.store.set('eldraw.settings.v1', JSON.stringify({ reloadBehavior: 'discard' }));
    const { settings } = await import('$lib/store/settings');
    expect(settings.snapshot().reloadBehavior).toBe('discard');
  });

  it('ignores invalid persisted values', async () => {
    stub.store.set('eldraw.settings.v1', JSON.stringify({ reloadBehavior: 'bogus' }));
    const { settings } = await import('$lib/store/settings');
    expect(settings.snapshot().reloadBehavior).toBe('keep');
  });

  it('defaults graphTheme to classic and graphOverrides to {}', async () => {
    const { settings } = await import('$lib/store/settings');
    const snap = settings.snapshot();
    expect(snap.graphTheme).toBe('classic');
    expect(snap.graphOverrides).toEqual({});
  });

  it('migrates a legacy settings blob without graphTheme to classic', async () => {
    stub.store.set('eldraw.settings.v1', JSON.stringify({ reloadBehavior: 'discard' }));
    const { settings } = await import('$lib/store/settings');
    expect(settings.snapshot().graphTheme).toBe('classic');
    expect(settings.snapshot().reloadBehavior).toBe('discard');
  });

  it('persists graphTheme and graphOverrides', async () => {
    const { settings } = await import('$lib/store/settings');
    settings.setGraphTheme('blueprint');
    settings.setGraphOverrides({ axisColor: '#ff0000' });
    const raw = stub.store.get('eldraw.settings.v1') ?? '';
    expect(raw).toContain('blueprint');
    expect(raw).toContain('ff0000');
  });

  it('rejects an unknown graphTheme on load', async () => {
    stub.store.set(
      'eldraw.settings.v1',
      JSON.stringify({ reloadBehavior: 'keep', graphTheme: 'nope' }),
    );
    const { settings } = await import('$lib/store/settings');
    expect(settings.snapshot().graphTheme).toBe('classic');
  });
});
