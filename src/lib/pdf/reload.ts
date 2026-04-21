/**
 * Compute the document state after reloading a PDF.
 *
 * Pure function so the keep/discard rules can be exercised without IPC.
 * Caller is responsible for pushing the result into stores and resetting
 * history when discarding.
 */

import type { EldrawDocument, Page, PdfMeta } from '$lib/types';
import type { ReloadBehavior } from '$lib/store/settings';

export interface ReloadPlan {
  doc: EldrawDocument;
  warning: string | null;
}

function emptyPdfPage(pageIndex: number, dims: { width: number; height: number }): Page {
  return {
    pageIndex,
    type: 'pdf',
    insertedAfterPdfPage: null,
    pdfSourceIndex: pageIndex,
    width: dims.width,
    height: dims.height,
    objects: [],
  };
}

function buildDiscardedDoc(previous: EldrawDocument, meta: PdfMeta): EldrawDocument {
  return {
    ...previous,
    pdfHash: meta.hash,
    pdfPath: meta.path,
    pages: meta.pages.map((dims, i) => emptyPdfPage(i, dims)),
  };
}

function buildKeptDoc(
  previous: EldrawDocument,
  meta: PdfMeta,
): { doc: EldrawDocument; truncated: boolean } {
  const targetLength = Math.min(previous.pages.length, meta.pageCount);
  const truncated = previous.pages.length > targetLength;

  const kept = previous.pages.slice(0, targetLength).map((page, i) => {
    if (page.type !== 'pdf') return page;
    const sourceIndex = page.pdfSourceIndex ?? i;
    const newDims = meta.pages[sourceIndex];
    if (!newDims) return page;
    return { ...page, width: newDims.width, height: newDims.height };
  });

  const appended: Page[] = [];
  for (let i = previous.pages.length; i < meta.pageCount; i += 1) {
    appended.push(emptyPdfPage(i, meta.pages[i]));
  }

  const pages = [...kept, ...appended].map((p, i) =>
    p.pageIndex === i ? p : { ...p, pageIndex: i },
  );

  return {
    doc: { ...previous, pdfHash: meta.hash, pdfPath: meta.path, pages },
    truncated,
  };
}

export function planReload(
  previous: EldrawDocument,
  meta: PdfMeta,
  behavior: ReloadBehavior,
): ReloadPlan {
  if (behavior === 'discard') {
    return { doc: buildDiscardedDoc(previous, meta), warning: null };
  }
  const { doc, truncated } = buildKeptDoc(previous, meta);
  if (!truncated) return { doc, warning: null };
  return {
    doc,
    warning: `PDF now has ${meta.pageCount} page${
      meta.pageCount === 1 ? '' : 's'
    }; truncated ${previous.pages.length - meta.pageCount} trailing page${
      previous.pages.length - meta.pageCount === 1 ? '' : 's'
    } from the document.`,
  };
}
