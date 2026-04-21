import type { EldrawDocument, PdfMeta } from '$lib/types';
import { loadSidecar } from '$lib/ipc';
import { fetchPdfMeta, type PdfSource } from '$lib/pdf/source';
import { setError, setLoading, setMeta, setSource } from '$lib/store/pdf';
import { documentStore } from '$lib/store/document';
import { startAutosave } from '$lib/store/autosave';
import { viewport } from '$lib/store/viewport';
import { settings, type ReloadBehavior } from '$lib/store/settings';
import { emitReloadWarning } from '$lib/store/reloadWarning';
import { planReload } from '$lib/pdf/reload';

let autosaveStop: (() => void) | null = null;

function stopAutosave(): void {
  autosaveStop?.();
  autosaveStop = null;
}

export function buildEmptyDoc(meta: PdfMeta): EldrawDocument {
  return {
    version: 1,
    pdfHash: meta.hash,
    pdfPath: meta.path,
    pages: meta.pages.map((p, i) => ({
      pageIndex: i,
      type: 'pdf',
      insertedAfterPdfPage: null,
      pdfSourceIndex: i,
      width: p.width,
      height: p.height,
      objects: [],
    })),
    palettes: [],
    prefs: {
      sidebarPinned: true,
      defaultTool: 'pen',
      toolDefaults: {
        pen: { color: '#000000', width: 2, dash: 'solid', opacity: 1 },
        highlighter: { color: '#fdd835', width: 14, dash: 'solid', opacity: 0.3 },
        line: { color: '#000000', width: 2, dash: 'solid', opacity: 1 },
      },
    },
  };
}

async function fetchMetaWithState(source: PdfSource): Promise<PdfMeta | null> {
  setLoading(true);
  try {
    const meta = await fetchPdfMeta(source);
    setMeta(meta);
    return meta;
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function loadPdfFromSource(source: PdfSource): Promise<PdfMeta | null> {
  setSource(source);
  const meta = await fetchMetaWithState(source);
  if (!meta) return null;

  let sidecar: EldrawDocument | null = null;
  try {
    sidecar = await loadSidecar(source.path);
  } catch {
    sidecar = null;
  }

  documentStore.load(sidecar ?? buildEmptyDoc(meta));

  stopAutosave();
  autosaveStop = startAutosave(source.path);
  viewport.setPage(0, meta.pageCount);
  return meta;
}

export interface ReloadResult {
  meta: PdfMeta;
  warning: string | null;
}

export async function reloadCurrentPdf(opts: {
  currentDoc: EldrawDocument;
  source: PdfSource;
  behavior?: ReloadBehavior;
}): Promise<ReloadResult | null> {
  const behavior = opts.behavior ?? settings.snapshot().reloadBehavior;
  const meta = await fetchMetaWithState(opts.source);
  if (!meta) return null;

  const { doc, warning } = planReload(opts.currentDoc, meta, behavior);
  documentStore.load(doc);

  stopAutosave();
  autosaveStop = startAutosave(opts.source.path);

  const nextPageCount = doc.pages.length;
  if (nextPageCount > 0) {
    const snap = viewport.snapshot();
    const clamped = Math.min(snap.currentPageIndex, nextPageCount - 1);
    viewport.setPage(Math.max(0, clamped), nextPageCount);
  }

  if (warning) emitReloadWarning(warning);
  return { meta, warning };
}
