import { describe, it, expect, beforeEach } from 'vitest';
import { documentStore } from '$lib/store/document';
import { commitStylePatch, commitTranslate, commitDelete } from '$lib/select/ops';
import type { EldrawDocument, ShapeObject, StrokeStyle } from '$lib/types';

const STYLE: StrokeStyle = { color: '#000', width: 2, dash: 'solid', opacity: 1 };

function mkShape(id: string): ShapeObject {
  return {
    id,
    createdAt: 0,
    type: 'shape',
    kind: 'rect',
    style: STYLE,
    fill: null,
    bounds: { x: 0, y: 0, w: 10, h: 10 },
  };
}

function doc(shapes: ShapeObject[]): EldrawDocument {
  return {
    version: 1,
    pdfHash: 'h',
    pdfPath: null,
    pages: [
      {
        pageIndex: 0,
        type: 'pdf',
        insertedAfterPdfPage: null,
        width: 612,
        height: 792,
        objects: shapes,
      },
    ],
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

describe('commit ops', () => {
  beforeEach(() => {
    documentStore.clear();
  });

  it('commitTranslate updates all selected objects in one history entry', () => {
    const a = mkShape('a');
    const b = mkShape('b');
    documentStore.load(doc([a, b]));
    commitTranslate(0, new Set(['a', 'b']), 5, 6);
    const state1 = documentStore.history.canUndo(0);
    let canUndo = false;
    const unsub = state1.subscribe((v) => (canUndo = v));
    unsub();
    expect(canUndo).toBe(true);
    documentStore.undo(0);
    // After one undo both should be back to original
    let objs: ShapeObject[] = [];
    const u2 = documentStore.objectsOnPage(0).subscribe((v) => (objs = v as ShapeObject[]));
    u2();
    expect(objs[0].bounds.x).toBe(0);
    expect(objs[1].bounds.x).toBe(0);
  });

  it('commitStylePatch changes color across selection', () => {
    const a = mkShape('a');
    const b = mkShape('b');
    documentStore.load(doc([a, b]));
    commitStylePatch(0, new Set(['a', 'b']), { color: '#f00' });
    let objs: ShapeObject[] = [];
    const u = documentStore.objectsOnPage(0).subscribe((v) => (objs = v as ShapeObject[]));
    u();
    expect(objs[0].style.color).toBe('#f00');
    expect(objs[1].style.color).toBe('#f00');
  });

  it('commitDelete removes selection', () => {
    const a = mkShape('a');
    const b = mkShape('b');
    documentStore.load(doc([a, b]));
    commitDelete(0, new Set(['a']));
    let objs: ShapeObject[] = [];
    const u = documentStore.objectsOnPage(0).subscribe((v) => (objs = v as ShapeObject[]));
    u();
    expect(objs.map((o) => o.id)).toEqual(['b']);
  });

  it('no-op on empty selection', () => {
    const a = mkShape('a');
    documentStore.load(doc([a]));
    commitTranslate(0, new Set(), 5, 5);
    let canUndo = false;
    const u = documentStore.history.canUndo(0).subscribe((v) => (canUndo = v));
    u();
    expect(canUndo).toBe(false);
  });
});
