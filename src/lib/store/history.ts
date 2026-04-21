import { derived, writable, get, type Readable } from 'svelte/store';
import type { AnyObject, ObjectId, Page } from '$lib/types';

/**
 * A removal or re-insertion entry carries both the object and the index it
 * occupied before being removed, so one undo restores the batch in the exact
 * order it had on-page.
 */
export interface IndexedObject {
  object: AnyObject;
  index: number;
}

export type Command =
  | { type: 'add'; object: AnyObject }
  | { type: 'remove'; object: AnyObject }
  | { type: 'removeMany'; items: IndexedObject[] }
  | { type: 'insertMany'; items: IndexedObject[] }
  | { type: 'update'; objectId: ObjectId; before: AnyObject; after: AnyObject }
  | { type: 'clearPage'; objects: AnyObject[] }
  | { type: 'restorePage'; objects: AnyObject[] };

export const HISTORY_LIMIT = 200;

export function applyCommand(page: Page, cmd: Command): Page {
  switch (cmd.type) {
    case 'add':
      return { ...page, objects: [...page.objects, cmd.object] };
    case 'remove':
      return { ...page, objects: page.objects.filter((o) => o.id !== cmd.object.id) };
    case 'removeMany': {
      const drop = new Set(cmd.items.map((i) => i.object.id));
      return { ...page, objects: page.objects.filter((o) => !drop.has(o.id)) };
    }
    case 'insertMany': {
      const sorted = [...cmd.items].sort((a, b) => a.index - b.index);
      const next = [...page.objects];
      for (const { object, index } of sorted) {
        next.splice(Math.min(index, next.length), 0, object);
      }
      return { ...page, objects: next };
    }
    case 'update':
      return {
        ...page,
        objects: page.objects.map((o) => (o.id === cmd.objectId ? cmd.after : o)),
      };
    case 'clearPage':
      return { ...page, objects: [] };
    case 'restorePage':
      return { ...page, objects: [...cmd.objects] };
  }
}

export function invertCommand(cmd: Command): Command {
  switch (cmd.type) {
    case 'add':
      return { type: 'remove', object: cmd.object };
    case 'remove':
      return { type: 'add', object: cmd.object };
    case 'removeMany':
      return { type: 'insertMany', items: cmd.items };
    case 'insertMany':
      return { type: 'removeMany', items: cmd.items };
    case 'update':
      return {
        type: 'update',
        objectId: cmd.objectId,
        before: cmd.after,
        after: cmd.before,
      };
    case 'clearPage':
      return { type: 'restorePage', objects: cmd.objects };
    case 'restorePage':
      return { type: 'clearPage', objects: cmd.objects };
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
  /** Top of the undo stack without mutating it. Used to preview the next
   *  command that would be undone (e.g. for firing mutation events). */
  peekUndo(pageIndex: number): Command | null;
  peekRedo(pageIndex: number): Command | null;
  canUndo(pageIndex: number): Readable<boolean>;
  canRedo(pageIndex: number): Readable<boolean>;
  /** Shift all page stacks at index >= `from` up by one to keep them
   *  aligned with document pages after an insert at `from`. */
  shiftPageIndicesFrom(from: number): void;
  /** Drop the stack at `index` and shift stacks at higher indices down by one. */
  onPageDelete(index: number): void;
  /** Move the stack at `from` to `to`, preserving relative order of the others. */
  onPageMove(from: number, to: number): void;
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

    peekUndo(pageIndex) {
      const s = get(stacks)[pageIndex];
      if (!s || s.undo.length === 0) return null;
      return s.undo[s.undo.length - 1];
    },

    peekRedo(pageIndex) {
      const s = get(stacks)[pageIndex];
      if (!s || s.redo.length === 0) return null;
      return s.redo[s.redo.length - 1];
    },

    clear() {
      stacks.set({});
    },

    shiftPageIndicesFrom(from) {
      stacks.update((all) => {
        const next: Record<number, PageStack> = {};
        for (const [k, v] of Object.entries(all)) {
          const idx = Number(k);
          next[idx >= from ? idx + 1 : idx] = v;
        }
        return next;
      });
    },

    onPageDelete(index) {
      stacks.update((all) => {
        const next: Record<number, PageStack> = {};
        for (const [k, v] of Object.entries(all)) {
          const idx = Number(k);
          if (idx === index) continue;
          next[idx > index ? idx - 1 : idx] = v;
        }
        return next;
      });
    },

    onPageMove(from, to) {
      if (from === to) return;
      stacks.update((all) => {
        const moved = all[from];
        const next: Record<number, PageStack> = {};
        const lo = Math.min(from, to);
        const hi = Math.max(from, to);
        for (const [k, v] of Object.entries(all)) {
          const idx = Number(k);
          if (idx === from) continue;
          if (idx < lo || idx > hi) {
            next[idx] = v;
          } else if (from < to) {
            next[idx - 1] = v;
          } else {
            next[idx + 1] = v;
          }
        }
        if (moved) next[to] = moved;
        return next;
      });
    },

    _stacks: { subscribe: stacks.subscribe },
  };
}
