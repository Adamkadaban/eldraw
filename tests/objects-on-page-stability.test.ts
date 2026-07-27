import { describe, it, expect } from 'vitest';
import { createDocumentStore } from '$lib/store/document';
import type { AnyObject, EldrawDocument, Page, ShapeObject } from '$lib/types';

function makeDoc(objectsPerPage: AnyObject[][]): EldrawDocument {
  const pages: Page[] = objectsPerPage.map((objects, i) => ({
    pageIndex: i,
    type: 'blank',
    insertedAfterPdfPage: null,
    width: 612,
    height: 792,
    objects,
  }));
  return {
    version: 1,
    pdfHash: 'test',
    pdfPath: null,
    pages,
    palettes: [],
    prefs: {
      sidebarPinned: false,
      defaultTool: 'pen',
      toolDefaults: {
        pen: { color: '#000', width: 2, dash: 'solid', opacity: 1 },
        highlighter: { color: '#ff0', width: 14, dash: 'solid', opacity: 0.3 },
        line: { color: '#000', width: 2, dash: 'solid', opacity: 1 },
      },
    },
  };
}

function makeShape(id: string): ShapeObject {
  return {
    id,
    createdAt: Date.now(),
    type: 'shape',
    kind: 'rect',
    style: { color: '#000', width: 2, dash: 'solid', opacity: 1 },
    fill: null,
    bounds: { x: 10, y: 10, w: 50, h: 50 },
  };
}

describe('objectsOnPage stability', () => {
  it('returns referentially identical arrays when unrelated page changes', () => {
    const store = createDocumentStore();
    store.load(makeDoc([[], []]));

    const emissions: AnyObject[][] = [];
    const unsub = store.objectsOnPage(1).subscribe((v) => {
      emissions.push(v);
    });

    store.addObject(0, makeShape('s1'));
    store.addObject(0, makeShape('s2'));

    // svelte/store derived always fires subscribers (safe_not_equal treats
    // objects as always-changed). But our optimization ensures each emission
    // carries the *same* array reference, so downstream identity checks
    // (like the incremental-draw guard in InkLayer) can short-circuit.
    expect(emissions.length).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < emissions.length; i++) {
      expect(emissions[i]).toBe(emissions[0]);
    }

    unsub();
  });

  it('emits new reference when the tracked page changes', () => {
    const store = createDocumentStore();
    store.load(makeDoc([[], []]));

    const emissions: AnyObject[][] = [];
    const unsub = store.objectsOnPage(0).subscribe((v) => {
      emissions.push(v);
    });

    store.addObject(0, makeShape('s1'));

    expect(emissions.length).toBe(2);
    expect(emissions[1].length).toBe(1);
    expect(emissions[1][0].id).toBe('s1');

    unsub();
  });
});
