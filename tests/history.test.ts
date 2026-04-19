import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { createHistory, HISTORY_LIMIT, applyCommand, type Command } from '$lib/store/history';
import type { Page, StrokeObject } from '$lib/types';

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

function emptyPage(): Page {
  return {
    pageIndex: 0,
    type: 'pdf',
    insertedAfterPdfPage: null,
    width: 100,
    height: 100,
    objects: [],
  };
}

describe('history', () => {
  it('add + undo removes, redo restores', () => {
    const h = createHistory();
    const obj = stroke('a');
    const cmd: Command = { type: 'add', object: obj };
    h.pushCommand(0, cmd);
    let page = applyCommand(emptyPage(), cmd);
    expect(page.objects).toHaveLength(1);

    const undone = h.undo(0, page);
    expect(undone).not.toBeNull();
    page = undone!;
    expect(page.objects).toHaveLength(0);

    const redone = h.redo(0, page);
    expect(redone).not.toBeNull();
    page = redone!;
    expect(page.objects).toHaveLength(1);
    expect(page.objects[0].id).toBe('a');
  });

  it('update undo restores before, redo reapplies after', () => {
    const h = createHistory();
    const before = stroke('a');
    const after: StrokeObject = { ...before, style: { ...before.style, width: 9 } };
    let page: Page = { ...emptyPage(), objects: [before] };
    const cmd: Command = { type: 'update', objectId: 'a', before, after };
    h.pushCommand(0, cmd);
    page = applyCommand(page, cmd);
    expect((page.objects[0] as StrokeObject).style.width).toBe(9);

    page = h.undo(0, page)!;
    expect((page.objects[0] as StrokeObject).style.width).toBe(2);
    page = h.redo(0, page)!;
    expect((page.objects[0] as StrokeObject).style.width).toBe(9);
  });

  it('canUndo / canRedo transitions', () => {
    const h = createHistory();
    expect(get(h.canUndo(0))).toBe(false);
    expect(get(h.canRedo(0))).toBe(false);
    const cmd: Command = { type: 'add', object: stroke('a') };
    h.pushCommand(0, cmd);
    expect(get(h.canUndo(0))).toBe(true);
    expect(get(h.canRedo(0))).toBe(false);
    let page = applyCommand(emptyPage(), cmd);
    page = h.undo(0, page)!;
    expect(page.objects).toHaveLength(0);
    expect(get(h.canUndo(0))).toBe(false);
    expect(get(h.canRedo(0))).toBe(true);
  });

  it('caps stack at HISTORY_LIMIT', () => {
    const h = createHistory();
    for (let i = 0; i < HISTORY_LIMIT + 50; i++) {
      h.pushCommand(0, { type: 'add', object: stroke(`s${i}`) });
    }
    const stacks = get(h._stacks);
    expect(stacks[0].undo.length).toBe(HISTORY_LIMIT);
    // oldest entries were dropped
    const first = stacks[0].undo[0] as { type: 'add'; object: StrokeObject };
    expect(first.object.id).toBe('s50');
  });

  it('new command after undo clears redo stack', () => {
    const h = createHistory();
    const c1: Command = { type: 'add', object: stroke('a') };
    h.pushCommand(0, c1);
    let page = applyCommand(emptyPage(), c1);
    page = h.undo(0, page)!;
    expect(page.objects).toHaveLength(0);
    expect(get(h.canRedo(0))).toBe(true);

    const c2: Command = { type: 'add', object: stroke('b') };
    h.pushCommand(0, c2);
    expect(get(h.canRedo(0))).toBe(false);
  });

  it('per-page stacks are independent', () => {
    const h = createHistory();
    h.pushCommand(0, { type: 'add', object: stroke('a') });
    expect(get(h.canUndo(0))).toBe(true);
    expect(get(h.canUndo(1))).toBe(false);
  });
});
