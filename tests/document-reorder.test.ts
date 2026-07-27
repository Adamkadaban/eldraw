import { describe, expect, it } from 'vitest';
import { createDocumentStore } from '$lib/store/document';
import type { AnyObject, EldrawDocument, Page } from '$lib/types';

function textObject(id: string): AnyObject {
  return {
    id,
    createdAt: 0,
    type: 'text',
    at: { x: 0, y: 0 },
    content: id,
    latex: false,
    fontSize: 12,
    color: '#000000',
  };
}

function doc(objects: AnyObject[]): EldrawDocument {
  const page: Page = {
    pageIndex: 0,
    type: 'blank',
    insertedAfterPdfPage: null,
    width: 612,
    height: 792,
    objects,
  };
  return {
    version: 1,
    pdfHash: 'h',
    pdfPath: null,
    pages: [page],
    palettes: [],
    prefs: {
      sidebarPinned: false,
      defaultTool: 'pen',
      toolDefaults: {
        pen: { color: '#000000', width: 2, dash: 'solid', opacity: 1 },
        highlighter: { color: '#ffff00', width: 8, dash: 'solid', opacity: 0.4 },
        line: { color: '#000000', width: 2, dash: 'solid', opacity: 1 },
      },
    },
  };
}

function makeStore(ids: string[]) {
  const store = createDocumentStore();
  store.load(doc(ids.map(textObject)));
  const read = () => {
    let current: AnyObject[] = [];
    store.subscribe((d) => (current = d?.pages[0].objects ?? []))();
    return current.map((o) => o.id);
  };
  return { store, read };
}

describe('reorderObjects', () => {
  it('applies a valid permutation', () => {
    const { store, read } = makeStore(['a', 'b', 'c']);
    store.reorderObjects(0, [textObject('c'), textObject('a'), textObject('b')]);
    expect(read()).toEqual(['c', 'a', 'b']);
  });

  it('is a single undoable action', () => {
    const { store, read } = makeStore(['a', 'b', 'c']);
    store.reorderObjects(0, [textObject('c'), textObject('b'), textObject('a')]);
    expect(read()).toEqual(['c', 'b', 'a']);
    store.undo(0);
    expect(read()).toEqual(['a', 'b', 'c']);
  });

  it('rejects a duplicated id rather than dropping an object', () => {
    const { store, read } = makeStore(['a', 'b', 'c']);
    // Same length and every id known, but 'c' would silently vanish.
    store.reorderObjects(0, [textObject('a'), textObject('a'), textObject('b')]);
    expect(read()).toEqual(['a', 'b', 'c']);
  });

  it('rejects an order containing an unknown id', () => {
    const { store, read } = makeStore(['a', 'b']);
    store.reorderObjects(0, [textObject('a'), textObject('zzz')]);
    expect(read()).toEqual(['a', 'b']);
  });

  it('rejects a length mismatch', () => {
    const { store, read } = makeStore(['a', 'b', 'c']);
    store.reorderObjects(0, [textObject('a'), textObject('b')]);
    expect(read()).toEqual(['a', 'b', 'c']);
  });

  it('ignores an unknown page index', () => {
    const { store, read } = makeStore(['a']);
    expect(() => store.reorderObjects(9, [textObject('a')])).not.toThrow();
    expect(read()).toEqual(['a']);
  });
});
