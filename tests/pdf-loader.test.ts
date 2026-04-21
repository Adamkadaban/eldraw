import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('$lib/ipc', () => ({
  openPdf: vi.fn(),
  loadSidecar: vi.fn(async () => null),
  saveSidecar: vi.fn(async () => undefined),
  acquireLock: vi.fn(async () => true),
  releaseLock: vi.fn(async () => undefined),
  renderPage: vi.fn(),
  renderPdfThumbnail: vi.fn(),
  exportFlattenedPdf: vi.fn(),
}));

import * as ipc from '$lib/ipc';
import { loadPdfFromSource, stopAutosave } from '$lib/pdf/loader';
import { pdf, reset as resetPdf, setSource } from '$lib/store/pdf';
import { documentStore } from '$lib/store/document';

const openPdf = ipc.openPdf as unknown as ReturnType<typeof vi.fn>;
const loadSidecar = ipc.loadSidecar as unknown as ReturnType<typeof vi.fn>;

describe('loadPdfFromSource', () => {
  beforeEach(() => {
    openPdf.mockReset();
    loadSidecar.mockReset();
    loadSidecar.mockResolvedValue(null);
    stopAutosave();
    documentStore.clear();
    resetPdf();
  });

  it('sets the source only after the meta fetch succeeds', async () => {
    openPdf.mockResolvedValueOnce({
      path: '/tmp/new.pdf',
      hash: 'h',
      pageCount: 1,
      pages: [{ width: 612, height: 792 }],
    });

    const result = await loadPdfFromSource({ kind: 'file', path: '/tmp/new.pdf' });
    expect(result).not.toBeNull();
    expect(get(pdf).source).toEqual({ kind: 'file', path: '/tmp/new.pdf' });

    stopAutosave();
  });

  it('leaves the previous source authoritative when meta fetch fails', async () => {
    setSource({ kind: 'file', path: '/tmp/previous.pdf' });
    openPdf.mockRejectedValueOnce(new Error('missing file'));

    const result = await loadPdfFromSource({ kind: 'file', path: '/tmp/broken.pdf' });
    expect(result).toBeNull();
    expect(get(pdf).source).toEqual({ kind: 'file', path: '/tmp/previous.pdf' });
    expect(get(pdf).error).toBe('missing file');
  });
});

describe('stopAutosave', () => {
  it('is idempotent and safe to call without a running autosave', () => {
    expect(() => stopAutosave()).not.toThrow();
    expect(() => stopAutosave()).not.toThrow();
  });
});
