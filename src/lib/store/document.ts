import { derived, get, writable, type Readable } from 'svelte/store';
import type { AnyObject, EldrawDocument, ObjectId, Page } from '$lib/types';
import { applyCommand, createHistory, type Command, type History } from './history';

export interface DocumentStore {
  subscribe: Readable<EldrawDocument | null>['subscribe'];
  load(doc: EldrawDocument): void;
  clear(): void;

  addObject(pageIndex: number, obj: AnyObject): void;
  removeObject(pageIndex: number, id: ObjectId): void;
  updateObject(pageIndex: number, id: ObjectId, patch: Partial<AnyObject>): void;

  insertBlankPageAfter(pdfPageIndex: number, width: number, height: number): void;

  undo(pageIndex: number): void;
  redo(pageIndex: number): void;
  canUndo(pageIndex: number): Readable<boolean>;
  canRedo(pageIndex: number): Readable<boolean>;

  objectsOnPage(pageIndex: number): Readable<AnyObject[]>;

  /** Escape hatch for undo/redo replays that must not re-push history. */
  _internalApply(pageIndex: number, cmd: Command): void;

  history: History;
}

function replacePage(doc: EldrawDocument, pageIndex: number, next: Page): EldrawDocument {
  return {
    ...doc,
    pages: doc.pages.map((p, i) => (i === pageIndex ? next : p)),
  };
}

export function createDocumentStore(): DocumentStore {
  const state = writable<EldrawDocument | null>(null);
  const history = createHistory();

  function mutatePage(pageIndex: number, fn: (p: Page) => Page) {
    state.update((doc) => {
      if (!doc) return doc;
      const page = doc.pages[pageIndex];
      if (!page) return doc;
      return replacePage(doc, pageIndex, fn(page));
    });
  }

  function pushAndApply(pageIndex: number, cmd: Command) {
    history.pushCommand(pageIndex, cmd);
    mutatePage(pageIndex, (p) => applyCommand(p, cmd));
  }

  return {
    subscribe: state.subscribe,

    load(doc) {
      state.set(doc);
      history.clear();
    },

    clear() {
      state.set(null);
      history.clear();
    },

    addObject(pageIndex, obj) {
      pushAndApply(pageIndex, { type: 'add', object: obj });
    },

    removeObject(pageIndex, id) {
      const doc = get(state);
      if (!doc) return;
      const page = doc.pages[pageIndex];
      if (!page) return;
      const obj = page.objects.find((o) => o.id === id);
      if (!obj) return;
      pushAndApply(pageIndex, { type: 'remove', object: obj });
    },

    updateObject(pageIndex, id, patch) {
      const doc = get(state);
      if (!doc) return;
      const page = doc.pages[pageIndex];
      if (!page) return;
      const before = page.objects.find((o) => o.id === id);
      if (!before) return;
      const after = { ...before, ...patch } as AnyObject;
      pushAndApply(pageIndex, { type: 'update', objectId: id, before, after });
    },

    insertBlankPageAfter(pdfPageIndex, width, height) {
      state.update((doc) => {
        if (!doc) return doc;
        const insertIdx = pdfPageIndex + 1;
        const blank: Page = {
          pageIndex: insertIdx,
          type: 'blank',
          insertedAfterPdfPage: pdfPageIndex,
          width,
          height,
          objects: [],
        };
        const pages = [...doc.pages];
        pages.splice(insertIdx, 0, blank);
        const reindexed = pages.map((p, i) => ({ ...p, pageIndex: i }));
        history.shiftPageIndicesFrom(insertIdx);
        return { ...doc, pages: reindexed };
      });
    },

    undo(pageIndex) {
      const doc = get(state);
      if (!doc) return;
      const page = doc.pages[pageIndex];
      if (!page) return;
      const next = history.undo(pageIndex, page);
      if (next) mutatePage(pageIndex, () => next);
    },

    redo(pageIndex) {
      const doc = get(state);
      if (!doc) return;
      const page = doc.pages[pageIndex];
      if (!page) return;
      const next = history.redo(pageIndex, page);
      if (next) mutatePage(pageIndex, () => next);
    },

    canUndo(pageIndex) {
      return history.canUndo(pageIndex);
    },

    canRedo(pageIndex) {
      return history.canRedo(pageIndex);
    },

    objectsOnPage(pageIndex) {
      return derived(state, ($doc) => $doc?.pages[pageIndex]?.objects ?? []);
    },

    _internalApply(pageIndex, cmd) {
      mutatePage(pageIndex, (p) => applyCommand(p, cmd));
    },

    history,
  };
}

export const documentStore = createDocumentStore();
export const currentDocument: Readable<EldrawDocument | null> = {
  subscribe: documentStore.subscribe,
};
