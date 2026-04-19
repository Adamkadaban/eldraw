import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writable } from 'svelte/store';
import { startAutosave, autosaveError } from '$lib/store/autosave';
import type { EldrawDocument } from '$lib/types';

function doc(hash: string): EldrawDocument {
  return {
    version: 1,
    pdfHash: hash,
    pdfPath: '/tmp/x.pdf',
    pages: [],
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

describe('autosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    autosaveError.set(null);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces multiple edits into one save', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const source = writable<EldrawDocument | null>(doc('initial'));
    const stop = startAutosave('/tmp/x.pdf', { debounceMs: 100, save, source });

    source.set(doc('a'));
    await vi.advanceTimersByTimeAsync(50);
    source.set(doc('b'));
    await vi.advanceTimersByTimeAsync(50);
    source.set(doc('c'));
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][1].pdfHash).toBe('c');
    stop();
  });

  it('does not save when pdfPath is null', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const source = writable<EldrawDocument | null>(doc('a'));
    const stop = startAutosave(null, { debounceMs: 50, save, source });
    source.set(doc('b'));
    await vi.advanceTimersByTimeAsync(200);
    expect(save).not.toHaveBeenCalled();
    stop();
  });

  it('populates autosaveError on failure', async () => {
    const save = vi.fn().mockRejectedValue(new Error('disk full'));
    const source = writable<EldrawDocument | null>(doc('a'));
    const stop = startAutosave('/tmp/x.pdf', { debounceMs: 50, save, source });
    source.set(doc('b'));
    await vi.advanceTimersByTimeAsync(60);
    await Promise.resolve();
    let err: string | null = null;
    autosaveError.subscribe((v) => (err = v))();
    expect(err).toBe('disk full');
    stop();
  });

  it('stop cancels pending save', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const source = writable<EldrawDocument | null>(doc('a'));
    const stop = startAutosave('/tmp/x.pdf', { debounceMs: 100, save, source });
    source.set(doc('b'));
    stop();
    await vi.advanceTimersByTimeAsync(500);
    expect(save).not.toHaveBeenCalled();
  });
});
