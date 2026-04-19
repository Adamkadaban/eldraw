import { derived, writable, get, type Readable } from 'svelte/store';
import type { AnyObject, ObjectId, Page } from '$lib/types';

export type Command =
  | { type: 'add'; object: AnyObject }
  | { type: 'remove'; object: AnyObject }
  | { type: 'update'; objectId: ObjectId; before: AnyObject; after: AnyObject };

export const HISTORY_LIMIT = 200;

export function applyCommand(page: Page, cmd: Command): Page {
  switch (cmd.type) {
    case 'add':
      return { ...page, objects: [...page.objects, cmd.object] };
    case 'remove':
      return { ...page, objects: page.objects.filter((o) => o.id !== cmd.object.id) };
    case 'update':
      return {
        ...page,
        objects: page.objects.map((o) => (o.id === cmd.objectId ? cmd.after : o)),
      };
  }
}

export function invertCommand(cmd: Command): Command {
  switch (cmd.type) {
    case 'add':
      return { type: 'remove', object: cmd.object };
    case 'remove':
      return { type: 'add', object: cmd.object };
    case 'update':
      return {
        type: 'update',
        objectId: cmd.objectId,
        before: cmd.after,
        after: cmd.before,
      };
  }
}

interface PageStack {
  undo: Command[];
  redo: Command[];
}

function emptyStack(): PageStack {
  return { undo: [], redo: [] };
}

function trim(stack: Command[]): Command[] {
  return stack.length > HISTORY_LIMIT ? stack.slice(stack.length - HISTORY_LIMIT) : stack;
}

export interface History {
  pushCommand(pageIndex: number, cmd: Command): void;
  undo(pageIndex: number, page: Page): Page | null;
  redo(pageIndex: number, page: Page): Page | null;
  canUndo(pageIndex: number): Readable<boolean>;
  canRedo(pageIndex: number): Readable<boolean>;
  clear(): void;
  /** For tests. */
  _stacks: Readable<Record<number, PageStack>>;
}

export function createHistory(): History {
  const stacks = writable<Record<number, PageStack>>({});

  function mutate(pageIndex: number, fn: (s: PageStack) => PageStack) {
    stacks.update((all) => {
      const current = all[pageIndex] ?? emptyStack();
      return { ...all, [pageIndex]: fn(current) };
    });
  }

  return {
    pushCommand(pageIndex, cmd) {
      mutate(pageIndex, (s) => ({
        undo: trim([...s.undo, cmd]),
        redo: [],
      }));
    },

    undo(pageIndex, page) {
      const all = get(stacks);
      const stack = all[pageIndex];
      if (!stack || stack.undo.length === 0) return null;
      const cmd = stack.undo[stack.undo.length - 1];
      const inverse = invertCommand(cmd);
      const nextPage = applyCommand(page, inverse);
      mutate(pageIndex, (s) => ({
        undo: s.undo.slice(0, -1),
        redo: trim([...s.redo, cmd]),
      }));
      return nextPage;
    },

    redo(pageIndex, page) {
      const all = get(stacks);
      const stack = all[pageIndex];
      if (!stack || stack.redo.length === 0) return null;
      const cmd = stack.redo[stack.redo.length - 1];
      const nextPage = applyCommand(page, cmd);
      mutate(pageIndex, (s) => ({
        undo: trim([...s.undo, cmd]),
        redo: s.redo.slice(0, -1),
      }));
      return nextPage;
    },

    canUndo(pageIndex) {
      return derived(stacks, ($s) => ($s[pageIndex]?.undo.length ?? 0) > 0);
    },

    canRedo(pageIndex) {
      return derived(stacks, ($s) => ($s[pageIndex]?.redo.length ?? 0) > 0);
    },

    clear() {
      stacks.set({});
    },

    _stacks: { subscribe: stacks.subscribe },
  };
}
