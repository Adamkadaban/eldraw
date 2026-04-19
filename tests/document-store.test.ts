import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { createDocumentStore, pdfPageIndexAt } from '$lib/store/document';
import type { EldrawDocument, Page, StrokeObject } from '$lib/types';

function stroke(id: string, width = 2): StrokeObject {
  return {
    id,
    createdAt: 0,
    type: 'stroke',
    tool: 'pen',
    style: { color: '#000', width, dash: 'solid', opacity: 1 },
    points: [],
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

function pdfPage(index: number): Page {
  return {
    pageIndex: index,
    type: 'pdf',
    insertedAfterPdfPage: null,
    width: 612,
    height: 792,
    objects: [],
  };
}

describe('documentStore', () => {
  it('addObject appends and pushes history', () => {
    const store = createDocumentStore();
    store.load(docWithPages([pdfPage(0)]));
    store.addObject(0, stroke('a'));
    const doc = get(store)!;
    expect(doc.pages[0].objects).toHaveLength(1);
    expect(get(store.canUndo(0))).toBe(true);

    store.undo(0);
    expect(get(store)!.pages[0].objects).toHaveLength(0);
    expect(get(store.canRedo(0))).toBe(true);
  });

  it('removeObject drops and undo restores', () => {
    const store = createDocumentStore();
    const initial = docWithPages([{ ...pdfPage(0), objects: [stroke('a'), stroke('b')] }]);
    store.load(initial);
    store.removeObject(0, 'a');
    expect(get(store)!.pages[0].objects.map((o) => o.id)).toEqual(['b']);
    store.undo(0);
    expect(get(store)!.pages[0].objects.map((o) => o.id)).toEqual(['b', 'a']);
  });

  it('updateObject patches, undo reverts', () => {
    const store = createDocumentStore();
    const initial = docWithPages([{ ...pdfPage(0), objects: [stroke('a', 2)] }]);
    store.load(initial);
    const existing = get(store)!.pages[0].objects[0] as StrokeObject;
    store.updateObject(0, 'a', { style: { ...existing.style, width: 8 } });
    expect((get(store)!.pages[0].objects[0] as StrokeObject).style.width).toBe(8);
    store.undo(0);
    expect((get(store)!.pages[0].objects[0] as StrokeObject).style.width).toBe(2);
    store.redo(0);
    expect((get(store)!.pages[0].objects[0] as StrokeObject).style.width).toBe(8);
  });

  it('insertBlankPageAfter inserts at correct index with blank metadata', () => {
    const store = createDocumentStore();
    store.load(docWithPages([pdfPage(0), pdfPage(1)]));
    store.insertBlankPageAfter(0, 500, 700);
    const pages = get(store)!.pages;
    expect(pages).toHaveLength(3);
    expect(pages[1].type).toBe('blank');
    expect(pages[1].insertedAfterPdfPage).toBe(0);
    expect(pages[1].width).toBe(500);
    expect(pages[1].height).toBe(700);
    expect(pages[0].pageIndex).toBe(0);
    expect(pages[1].pageIndex).toBe(1);
    expect(pages[2].pageIndex).toBe(2);
  });

  it('insertBlankPageAfter with preceding blank records correct pdf index', () => {
    const store = createDocumentStore();
    store.load(docWithPages([pdfPage(0), pdfPage(1)]));
    store.insertBlankPageAfter(0, 500, 700);
    store.insertBlankPageAfter(1, 500, 700);
    const pages = get(store)!.pages;
    expect(pages).toHaveLength(4);
    expect(pages[1].type).toBe('blank');
    expect(pages[1].insertedAfterPdfPage).toBe(0);
    expect(pages[2].type).toBe('blank');
    expect(pages[2].insertedAfterPdfPage).toBe(0);
    expect(pages[3].type).toBe('pdf');
  });

  it('pdfPageIndexAt maps array positions to underlying PDF indices', () => {
    const pages: Page[] = [
      pdfPage(0),
      { ...pdfPage(1), type: 'blank', insertedAfterPdfPage: 0 },
      pdfPage(1),
      pdfPage(2),
    ];
    expect(pdfPageIndexAt(pages, 0)).toBe(0);
    expect(pdfPageIndexAt(pages, 1)).toBeNull();
    expect(pdfPageIndexAt(pages, 2)).toBe(1);
    expect(pdfPageIndexAt(pages, 3)).toBe(2);
    expect(pdfPageIndexAt(pages, 99)).toBeNull();
  });

  it('load clears history', () => {
    const store = createDocumentStore();
    store.load(docWithPages([pdfPage(0)]));
    store.addObject(0, stroke('a'));
    expect(get(store.canUndo(0))).toBe(true);
    store.load(docWithPages([pdfPage(0)]));
    expect(get(store.canUndo(0))).toBe(false);
  });

  it('objectsOnPage derived tracks updates', () => {
    const store = createDocumentStore();
    store.load(docWithPages([pdfPage(0)]));
    const derivedStore = store.objectsOnPage(0);
    expect(get(derivedStore)).toEqual([]);
    store.addObject(0, stroke('a'));
    expect(get(derivedStore).map((o) => o.id)).toEqual(['a']);
  });
});
