import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({ invoke }));

function setupObjectUrls() {
  let counter = 0;
  const revoked: string[] = [];
  vi.stubGlobal('URL', {
    ...globalThis.URL,
    createObjectURL: vi.fn(() => `blob:test/${counter++}`),
    revokeObjectURL: vi.fn((url: string) => {
      revoked.push(url);
    }),
  });
  return { revoked };
}

describe('getThumbnail', () => {
  beforeEach(() => {
    invoke.mockReset();
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('invokes render_pdf_thumbnail and wraps the bytes in a blob URL', async () => {
    setupObjectUrls();
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer;
    invoke.mockResolvedValue(bytes);
    const mod = await import('../src/lib/pdf/thumbnails');

    const url = await mod.getThumbnail('hash-a', 3, 200);

    expect(invoke).toHaveBeenCalledWith('render_pdf_thumbnail', {
      pdfId: 'hash-a',
      pageIndex: 3,
      maxDim: 200,
    });
    expect(url).toMatch(/^blob:test\//);
  });

  it('returns the cached URL on repeat calls without re-invoking', async () => {
    setupObjectUrls();
    invoke.mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    const mod = await import('../src/lib/pdf/thumbnails');

    const a = await mod.getThumbnail('hash-a', 0);
    const b = await mod.getThumbnail('hash-a', 0);

    expect(a).toBe(b);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent requests for the same key', async () => {
    setupObjectUrls();
    let resolve!: (v: ArrayBuffer) => void;
    invoke.mockImplementation(
      () =>
        new Promise<ArrayBuffer>((r) => {
          resolve = r;
        }),
    );
    const mod = await import('../src/lib/pdf/thumbnails');

    const p1 = mod.getThumbnail('hash-a', 1);
    const p2 = mod.getThumbnail('hash-a', 1);
    resolve(new Uint8Array([1]).buffer);

    expect(await p1).toBe(await p2);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('revokeThumbnails drops only the requested pdfId', async () => {
    const { revoked } = setupObjectUrls();
    invoke.mockResolvedValue(new Uint8Array([1]).buffer);
    const mod = await import('../src/lib/pdf/thumbnails');

    const a0 = await mod.getThumbnail('hash-a', 0);
    await mod.getThumbnail('hash-b', 0);

    mod.revokeThumbnails('hash-a');
    expect(revoked).toContain(a0);

    // After revocation, the next call must re-invoke and produce a new URL.
    invoke.mockClear();
    const a0Again = await mod.getThumbnail('hash-a', 0);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(a0Again).not.toBe(a0);
  });

  it('defaults maxDim to 200', async () => {
    setupObjectUrls();
    invoke.mockResolvedValue(new Uint8Array([1]).buffer);
    const mod = await import('../src/lib/pdf/thumbnails');

    await mod.getThumbnail('hash-c', 7);

    expect(invoke).toHaveBeenCalledWith(
      'render_pdf_thumbnail',
      expect.objectContaining({ maxDim: 200 }),
    );
  });
});

describe('page generation', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts at 0, bumps to 1, notifies subscribers with the new generation', async () => {
    setupObjectUrls();
    const mod = await import('../src/lib/pdf/thumbnails');

    expect(mod.pageGeneration('hash-a', 0)).toBe(0);
    const seen: number[] = [];
    const unsub = mod.subscribePageGeneration('hash-a', 0, (g) => seen.push(g));

    mod.bumpPageGeneration('hash-a', 0);
    mod.bumpPageGeneration('hash-a', 0);

    expect(mod.pageGeneration('hash-a', 0)).toBe(2);
    expect(seen).toEqual([1, 2]);
    unsub();
    mod.bumpPageGeneration('hash-a', 0);
    expect(seen).toEqual([1, 2]);
  });

  it('scopes generations per (pdfId, pageIndex)', async () => {
    setupObjectUrls();
    const mod = await import('../src/lib/pdf/thumbnails');

    mod.bumpPageGeneration('hash-a', 0);
    expect(mod.pageGeneration('hash-a', 0)).toBe(1);
    expect(mod.pageGeneration('hash-a', 1)).toBe(0);
    expect(mod.pageGeneration('hash-b', 0)).toBe(0);
  });

  it('revokeThumbnails clears generations and subscribers for the pdfId', async () => {
    setupObjectUrls();
    const mod = await import('../src/lib/pdf/thumbnails');

    mod.bumpPageGeneration('hash-a', 0);
    mod.bumpPageGeneration('hash-b', 0);
    const seen: number[] = [];
    mod.subscribePageGeneration('hash-a', 0, (g) => seen.push(g));

    mod.revokeThumbnails('hash-a');

    expect(mod.pageGeneration('hash-a', 0)).toBe(0);
    expect(mod.pageGeneration('hash-b', 0)).toBe(1);

    mod.bumpPageGeneration('hash-a', 0);
    expect(seen).toEqual([]);
  });

  it('retainThumbnails drops generations for pages not in the retained set', async () => {
    setupObjectUrls();
    const mod = await import('../src/lib/pdf/thumbnails');

    mod.bumpPageGeneration('hash-a', 0);
    mod.bumpPageGeneration('hash-a', 1);
    mod.bumpPageGeneration('hash-a', 2);

    mod.retainThumbnails('hash-a', new Set([1]));

    expect(mod.pageGeneration('hash-a', 0)).toBe(0);
    expect(mod.pageGeneration('hash-a', 1)).toBe(1);
    expect(mod.pageGeneration('hash-a', 2)).toBe(0);
  });
});
