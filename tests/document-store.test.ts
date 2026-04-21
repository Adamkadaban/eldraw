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

  it('replace swaps the document without clearing history', () => {
    const store = createDocumentStore();
    store.load(docWithPages([pdfPage(0)]));
    store.addObject(0, stroke('a'));
    expect(get(store.canUndo(0))).toBe(true);

    const next = docWithPages([pdfPage(0), pdfPage(1)]);
    store.replace(next);

    expect(get(store)!.pages).toHaveLength(2);
    expect(get(store.canUndo(0))).toBe(true);
  });

  it('objectsOnPage derived tracks updates', () => {
    const store = createDocumentStore();
    store.load(docWithPages([pdfPage(0)]));
    const derivedStore = store.objectsOnPage(0);
    expect(get(derivedStore)).toEqual([]);
    store.addObject(0, stroke('a'));
    expect(get(derivedStore).map((o) => o.id)).toEqual(['a']);
  });

  it('load strips non-hex background values from sidecar blank pages', () => {
    const store = createDocumentStore();
    const malicious: Page = {
      pageIndex: 0,
      type: 'blank',
      insertedAfterPdfPage: null,
      width: 500,
      height: 700,
      background: 'red; background-image: url(x)',
      objects: [],
    };
    store.load(docWithPages([malicious]));
    const doc = get(store)!;
    expect(doc.pages[0].background).toBeUndefined();
  });

  it('load preserves valid #rrggbb backgrounds', () => {
    const store = createDocumentStore();
    const page: Page = {
      pageIndex: 0,
      type: 'blank',
      insertedAfterPdfPage: null,
      width: 500,
      height: 700,
      background: '#abcdef',
      objects: [],
    };
    store.load(docWithPages([page]));
    const doc = get(store)!;
    expect(doc.pages[0].background).toBe('#abcdef');
  });

  it('insertBlankPageAfter ignores non-hex background params', () => {
    const store = createDocumentStore();
    store.load(docWithPages([pdfPage(0)]));
    store.insertBlankPageAfter(0, 500, 700, 'red; background-image: url(x)');
    const doc = get(store)!;
    expect(doc.pages[1].type).toBe('blank');
    expect(doc.pages[1].background).toBeUndefined();
  });

  it('insertBlankPageAfter accepts valid #rrggbb background params', () => {
    const store = createDocumentStore();
    store.load(docWithPages([pdfPage(0)]));
    store.insertBlankPageAfter(0, 500, 700, '#123456');
    const doc = get(store)!;
    expect(doc.pages[1].background).toBe('#123456');
  });

  it('onPageCommit fires on add/remove/update/clear and on undo/redo', () => {
    const store = createDocumentStore();
    store.load(docWithPages([pdfPage(0), pdfPage(1)]));
    const events: number[] = [];
    const unsub = store.onPageCommit((i) => events.push(i));

    store.addObject(0, stroke('a'));
    store.addObject(1, stroke('b'));
    store.updateObject(0, 'a', { style: { color: '#f00', width: 2, dash: 'solid', opacity: 1 } });
    store.removeObject(1, 'b');
    store.undo(0);
    store.redo(0);
    store.clearPage(0);

    expect(events).toEqual([0, 1, 0, 1, 0, 0, 0]);
    unsub();
  });

  it('onPageCommit does not fire for structural page ops', () => {
    const store = createDocumentStore();
    store.load(docWithPages([pdfPage(0), pdfPage(1)]));
    const events: number[] = [];
    store.onPageCommit((i) => events.push(i));

    store.insertBlankPageAfter(0, 500, 700);
    store.movePage(0, 1);
    store.duplicatePage(0);
    store.deletePage(0);

    expect(events).toEqual([]);
  });

  it('onPageCommit does not fire when the store is unchanged by a no-op', () => {
    const store = createDocumentStore();
    store.load(docWithPages([pdfPage(0)]));
    const events: number[] = [];
    store.onPageCommit((i) => events.push(i));

    // No undo stack yet: these should be silent.
    store.undo(0);
    store.redo(0);
    // Removing a nonexistent object is a no-op.
    store.removeObject(0, 'does-not-exist');
    // Clearing an empty page is a no-op.
    store.clearPage(0);

    expect(events).toEqual([]);
  });

  it('onPageCommit unsubscribe stops delivery', () => {
    const store = createDocumentStore();
    store.load(docWithPages([pdfPage(0)]));
    const events: number[] = [];
    const unsub = store.onPageCommit((i) => events.push(i));

    store.addObject(0, stroke('a'));
    unsub();
    store.addObject(0, stroke('b'));

    expect(events).toEqual([0]);
  });

  it('strokes round-trip their baked streamline through document load/save', () => {
    const store = createDocumentStore();
    const baked: StrokeObject = { ...stroke('s1'), streamline: 0.792 };
    const legacy: StrokeObject = stroke('s2');
    const doc = docWithPages([{ ...pdfPage(0), objects: [baked, legacy] }]);
    store.load(doc);
    const serialized = JSON.parse(JSON.stringify(get(store)!));
    const [a, b] = serialized.pages[0].objects as StrokeObject[];
    expect(a.streamline).toBe(0.792);
    expect(b.streamline).toBeUndefined();
  });

  it('removeObjects drops a batch with one commit and one-step undo', () => {
    const store = createDocumentStore();
    const initial = docWithPages([
      { ...pdfPage(0), objects: [stroke('a'), stroke('b'), stroke('c'), stroke('d')] },
    ]);
    store.load(initial);
    const events: number[] = [];
    store.onPageCommit((i) => events.push(i));

    store.removeObjects(0, ['a', 'c']);
    expect(events).toEqual([0]);
    expect(get(store)!.pages[0].objects.map((o) => o.id)).toEqual(['b', 'd']);

    store.undo(0);
    expect(get(store)!.pages[0].objects.map((o) => o.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(events).toEqual([0, 0]);

    store.redo(0);
    expect(get(store)!.pages[0].objects.map((o) => o.id)).toEqual(['b', 'd']);
  });

  it('removeObjects is a no-op for empty id list and for unknown ids', () => {
    const store = createDocumentStore();
    store.load(docWithPages([{ ...pdfPage(0), objects: [stroke('a')] }]));
    const events: number[] = [];
    store.onPageCommit((i) => events.push(i));

    store.removeObjects(0, []);
    store.removeObjects(0, ['zzz']);
    expect(events).toEqual([]);
    expect(get(store)!.pages[0].objects.map((o) => o.id)).toEqual(['a']);
  });
});
