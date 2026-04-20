import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { createDocumentStore, pdfPageIndexAt } from '$lib/store/document';
import type { EldrawDocument, Page, StrokeObject } from '$lib/types';

function stroke(id: string): StrokeObject {
  return {
    id,
    createdAt: 0,
    type: 'stroke',
    tool: 'pen',
    style: { color: '#000', width: 2, dash: 'solid', opacity: 1 },
    points: [],
  };
}

function pdfPage(index: number, withSource = true): Page {
  const base: Page = {
    pageIndex: index,
    type: 'pdf',
    insertedAfterPdfPage: null,
    width: 612,
    height: 792,
    objects: [],
  };
  return withSource ? { ...base, pdfSourceIndex: index } : base;
}

function blankPage(index: number): Page {
  return {
    pageIndex: index,
    type: 'blank',
    insertedAfterPdfPage: null,
    width: 612,
    height: 792,
    objects: [],
  };
}

function docWithPages(pages: Page[]): EldrawDocument {
  return {
    version: 1,
    pdfHash: 'h',
    pdfPath: '/tmp/x.pdf',
    pages,
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

describe('pdfPageIndexAt', () => {
  it('honors explicit pdfSourceIndex after reorder', () => {
    const pages: Page[] = [pdfPage(1), pdfPage(0), pdfPage(2)].map((p, i) => ({
      ...p,
      pageIndex: i,
    }));
    expect(pdfPageIndexAt(pages, 0)).toBe(1);
    expect(pdfPageIndexAt(pages, 1)).toBe(0);
    expect(pdfPageIndexAt(pages, 2)).toBe(2);
  });

  it('falls back to position counting when pdfSourceIndex is missing', () => {
    const pages: Page[] = [pdfPage(0, false), blankPage(1), pdfPage(2, false)];
    expect(pdfPageIndexAt(pages, 0)).toBe(0);
    expect(pdfPageIndexAt(pages, 1)).toBeNull();
    expect(pdfPageIndexAt(pages, 2)).toBe(1);
  });
});

describe('documentStore page ops', () => {
  it('load normalizes missing pdfSourceIndex from position', () => {
    const store = createDocumentStore();
    store.load(
      docWithPages([pdfPage(0, false), blankPage(1), pdfPage(2, false), pdfPage(3, false)]),
    );
    const doc = get(store)!;
    expect(doc.pages[0].pdfSourceIndex).toBe(0);
    expect(doc.pages[1].pdfSourceIndex).toBeUndefined();
    expect(doc.pages[2].pdfSourceIndex).toBe(1);
    expect(doc.pages[3].pdfSourceIndex).toBe(2);
  });

  it('movePage reorders and reindexes', () => {
    const store = createDocumentStore();
    store.load(docWithPages([pdfPage(0), pdfPage(1), pdfPage(2)]));
    store.movePage(0, 2);
    const doc = get(store)!;
    expect(doc.pages.map((p) => p.pdfSourceIndex)).toEqual([1, 2, 0]);
    expect(doc.pages.map((p) => p.pageIndex)).toEqual([0, 1, 2]);
    expect(pdfPageIndexAt(doc.pages, 2)).toBe(0);
  });

  it('movePage is a no-op for identity and invalid from', () => {
    const store = createDocumentStore();
    store.load(docWithPages([pdfPage(0), pdfPage(1)]));
    const before = get(store)!.pages.map((p) => p.pdfSourceIndex);
    store.movePage(0, 0);
    store.movePage(-1, 1);
    store.movePage(5, 0);
    expect(get(store)!.pages.map((p) => p.pdfSourceIndex)).toEqual(before);
  });

  it('movePage clamps destination to [0, length-1]', () => {
    const store = createDocumentStore();
    store.load(docWithPages([pdfPage(0), pdfPage(1), pdfPage(2)]));
    store.movePage(0, 99);
    expect(get(store)!.pages.map((p) => p.pdfSourceIndex)).toEqual([1, 2, 0]);
  });

  it('duplicatePage inserts a copy directly after with fresh object ids', () => {
    const store = createDocumentStore();
    store.load(docWithPages([pdfPage(0)]));
    store.addObject(0, stroke('s1'));
    store.duplicatePage(0);
    const doc = get(store)!;
    expect(doc.pages).toHaveLength(2);
    expect(doc.pages[1].pdfSourceIndex).toBe(0);
    expect(doc.pages[1].objects).toHaveLength(1);
    expect(doc.pages[1].objects[0].id).not.toBe('s1');
  });

  it('deletePage removes and reindexes', () => {
    const store = createDocumentStore();
    store.load(docWithPages([pdfPage(0), pdfPage(1), pdfPage(2)]));
    store.deletePage(1);
    const doc = get(store)!;
    expect(doc.pages).toHaveLength(2);
    expect(doc.pages.map((p) => p.pdfSourceIndex)).toEqual([0, 2]);
    expect(doc.pages.map((p) => p.pageIndex)).toEqual([0, 1]);
  });

  it('deletePage refuses to delete the only remaining page', () => {
    const store = createDocumentStore();
    store.load(docWithPages([pdfPage(0)]));
    store.deletePage(0);
    expect(get(store)!.pages).toHaveLength(1);
  });

  it('history travels with moved pages', () => {
    const store = createDocumentStore();
    store.load(docWithPages([pdfPage(0), pdfPage(1)]));
    store.addObject(0, stroke('a'));
    store.movePage(0, 1);
    store.undo(1);
    const doc = get(store)!;
    expect(doc.pages[1].objects).toHaveLength(0);
  });

  it('history is dropped for a deleted page and shifts down for higher pages', () => {
    const store = createDocumentStore();
    store.load(docWithPages([pdfPage(0), pdfPage(1), pdfPage(2)]));
    store.addObject(2, stroke('c'));
    store.deletePage(0);
    store.undo(1);
    expect(get(store)!.pages[1].objects).toHaveLength(0);
  });
});
