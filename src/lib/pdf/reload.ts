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

/**
 * Rebuild the page list so PDF slots are keyed by `pdfSourceIndex` (not array
 * position) and blank pages stay anchored to the PDF page they follow.
 *
 * When a blank page's anchor no longer exists (PDF shrank past it), the blank
 * is re-anchored to the last surviving PDF page — or to the front (null
 * anchor) when the reloaded PDF has no pages at all. Simpler than dropping
 * user-created blank pages on a PDF shrink.
 */
function buildKeptDoc(
  previous: EldrawDocument,
  meta: PdfMeta,
): { doc: EldrawDocument; droppedPdfPages: number } {
  const pdfBySource = new Map<number, Page>();
  const blanksByAnchor = new Map<number | null, Page[]>();

  const pushBlank = (anchor: number | null, page: Page) => {
    const list = blanksByAnchor.get(anchor) ?? [];
    list.push(page);
    blanksByAnchor.set(anchor, list);
  };

  let derivedSourceIdx = 0;
  for (const page of previous.pages) {
    if (page.type === 'pdf') {
      const sourceIdx = page.pdfSourceIndex ?? derivedSourceIdx;
      derivedSourceIdx = Math.max(derivedSourceIdx, sourceIdx + 1);
      if (!pdfBySource.has(sourceIdx)) pdfBySource.set(sourceIdx, page);
    } else {
      pushBlank(page.insertedAfterPdfPage, page);
    }
  }

  let droppedPdfPages = 0;
  for (const sourceIdx of pdfBySource.keys()) {
    if (sourceIdx >= meta.pageCount) droppedPdfPages += 1;
  }

  const fallbackAnchor: number | null = meta.pageCount > 0 ? meta.pageCount - 1 : null;
  const staleAnchors = [...blanksByAnchor.keys()].filter(
    (a): a is number => a !== null && a >= meta.pageCount,
  );
  for (const anchor of staleAnchors) {
    const blanks = blanksByAnchor.get(anchor)!;
    blanksByAnchor.delete(anchor);
    for (const b of blanks) pushBlank(fallbackAnchor, b);
  }

  const out: Page[] = [];
  const appendBlanks = (anchor: number | null) => {
    const blanks = blanksByAnchor.get(anchor);
    if (!blanks) return;
    for (const blank of blanks) {
      out.push({
        ...blank,
        insertedAfterPdfPage: anchor,
        pageIndex: out.length,
      });
    }
  };

  appendBlanks(null);
  for (let i = 0; i < meta.pageCount; i += 1) {
    const dims = meta.pages[i];
    const prev = pdfBySource.get(i);
    if (prev) {
      out.push({
        ...prev,
        width: dims.width,
        height: dims.height,
        pdfSourceIndex: i,
        pageIndex: out.length,
      });
    } else {
      out.push({ ...emptyPdfPage(i, dims), pageIndex: out.length });
    }
    appendBlanks(i);
  }

  return {
    doc: { ...previous, pdfHash: meta.hash, pdfPath: meta.path, pages: out },
    droppedPdfPages,
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
  const { doc, droppedPdfPages } = buildKeptDoc(previous, meta);
  if (droppedPdfPages === 0) return { doc, warning: null };
  return {
    doc,
    warning: `PDF now has ${meta.pageCount} page${
      meta.pageCount === 1 ? '' : 's'
    }; dropped ${droppedPdfPages} PDF page${droppedPdfPages === 1 ? '' : 's'} from the document.`,
  };
}
