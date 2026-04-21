import { describe, it, expect } from 'vitest';
import { createDocumentStore, type MutationEvent } from '$lib/store/document';
import type { EldrawDocument, Page, StrokeObject, TextObject } from '$lib/types';

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

function text(id: string, content = 'x'): TextObject {
  return {
    id,
    createdAt: 0,
    type: 'text',
    at: { x: 0, y: 0 },
    content,
    latex: false,
    fontSize: 16,
    color: '#000',
  };
}

function pdfPage(i: number): Page {
  return {
    pageIndex: i,
    type: 'pdf',
    insertedAfterPdfPage: null,
    width: 612,
    height: 792,
    objects: [],
  };
}

function doc(): EldrawDocument {
  return {
    version: 1,
    pdfHash: 'h',
    pdfPath: '/tmp/x.pdf',
    pages: [pdfPage(0)],
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

describe('documentStore.onMutation', () => {
  it('fires add/remove/update events with correct kinds and page', () => {
    const store = createDocumentStore();
    store.load(doc());
    const events: MutationEvent[] = [];
    const off = store.onMutation((e) => events.push(e));

    const s = stroke('s1');
    store.addObject(0, s);
    store.updateObject(0, 's1', { style: { color: '#f00', width: 3, dash: 'solid', opacity: 1 } });
    store.removeObject(0, 's1');

    expect(events.map((e) => e.kind)).toEqual(['add', 'update', 'remove']);
    expect(events[0]).toMatchObject({ kind: 'add', pageIndex: 0 });
    expect(events[1]).toMatchObject({ kind: 'update', pageIndex: 0, id: 's1' });
    expect(events[2]).toMatchObject({ kind: 'remove', pageIndex: 0, ids: ['s1'] });
    off();
  });

  it('fires inverted events on undo and re-applied events on redo', () => {
    const store = createDocumentStore();
    store.load(doc());
    store.addObject(0, stroke('s1'));

    const events: MutationEvent[] = [];
    store.onMutation((e) => events.push(e));
    store.undo(0);
    store.redo(0);

    expect(events).toHaveLength(2);
    expect(events[0].kind).toBe('remove');
    expect(events[1].kind).toBe('add');
  });

  it('emits remove event with all ids when clearPage runs', () => {
    const store = createDocumentStore();
    store.load(doc());
    store.addObject(0, stroke('s1'));
    store.addObject(0, text('t1'));

    const events: MutationEvent[] = [];
    store.onMutation((e) => events.push(e));
    store.clearPage(0);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('remove');
    if (events[0].kind === 'remove') {
      expect(events[0].ids.sort()).toEqual(['s1', 't1']);
    }
  });
});
