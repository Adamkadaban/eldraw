import { derived, get, writable, type Readable } from 'svelte/store';
import type { AnyObject, EldrawDocument, ObjectId, Page } from '$lib/types';
import { isSafeHexColor } from '$lib/color';
import { applyCommand, createHistory, type Command, type History } from './history';

export type PageCommitListener = (pageIndex: number) => void;

export interface DocumentStore {
  subscribe: Readable<EldrawDocument | null>['subscribe'];
  load(doc: EldrawDocument): void;
  /**
   * Swap the document without clearing undo/redo history. Used by PDF
   * reload's "keep annotations" path where the user expects their history
   * stack to survive.
   */
  replace(doc: EldrawDocument): void;
  clear(): void;

  addObject(pageIndex: number, obj: AnyObject): void;
  removeObject(pageIndex: number, id: ObjectId): void;
  removeObjects(pageIndex: number, ids: readonly ObjectId[]): void;
  updateObject(pageIndex: number, id: ObjectId, patch: Partial<AnyObject>): void;

  insertBlankPageAfter(
    afterArrayIndex: number,
    width: number,
    height: number,
    background?: string,
  ): void;
  movePage(from: number, to: number): void;
  duplicatePage(index: number): void;
  deletePage(index: number): void;
  clearPage(pageIndex: number): void;

  undo(pageIndex: number): void;
  redo(pageIndex: number): void;
  canUndo(pageIndex: number): Readable<boolean>;
  canRedo(pageIndex: number): Readable<boolean>;

  objectsOnPage(pageIndex: number): Readable<AnyObject[]>;

  /**
   * Subscribe to page annotation commits. Fires on add/remove/update/clear
   * and on undo/redo — i.e. every mutation that changes a page's `objects`.
   * Does NOT fire during live strokes (those never touch the store) or
   * structural page ops (insert/move/duplicate/delete).
   */
  onPageCommit(listener: PageCommitListener): () => void;

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

/**
 * Return the stable underlying PDF page index for the page at the given
 * array position. Honors the explicit `pdfSourceIndex` field when present
 * (so reordered/duplicated pages keep rendering the original PDF page);
 * falls back to counting preceding pdf slots for sidecars written before
 * the field was introduced.
 */
export function pdfPageIndexAt(pages: readonly Page[], arrayIndex: number): number | null {
  const page = pages[arrayIndex];
  if (!page || page.type !== 'pdf') return null;
  if (typeof page.pdfSourceIndex === 'number') return page.pdfSourceIndex;
  let count = 0;
  for (let i = 0; i < arrayIndex; i += 1) {
    if (pages[i].type === 'pdf') count += 1;
  }
  return count;
}

function lastPdfIndexAtOrBefore(pages: readonly Page[], arrayIndex: number): number | null {
  let last: number | null = null;
  for (let i = 0; i <= arrayIndex && i < pages.length; i += 1) {
    const idx = pdfPageIndexAt(pages, i);
    if (idx !== null) last = idx;
  }
  return last;
}

function normalizeLoaded(doc: EldrawDocument): EldrawDocument {
  let nextDerived = 0;
  const pages = doc.pages.map((p, i) => {
    const withBg = sanitizePageBackground(p);
    const base = withBg.pageIndex === i ? withBg : { ...withBg, pageIndex: i };
    if (base.type === 'pdf' && typeof base.pdfSourceIndex !== 'number') {
      const withSource = { ...base, pdfSourceIndex: nextDerived };
      nextDerived += 1;
      return withSource;
    }
    if (base.type === 'pdf' && typeof base.pdfSourceIndex === 'number') {
      nextDerived = Math.max(nextDerived, base.pdfSourceIndex + 1);
    }
    return base;
  });
  return { ...doc, pages };
}

/**
 * Sidecars are untrusted input. Drop any `background` value that doesn't
 * match the strict `#rrggbb` invariant so it can't leak into CSS at render
 * time.
 */
function sanitizePageBackground(page: Page): Page {
  if (page.background === undefined) return page;
  if (isSafeHexColor(page.background)) return page;
  const { background: _drop, ...rest } = page;
  void _drop;
  return rest as Page;
}

function reindex(pages: Page[]): Page[] {
  return pages.map((p, i) => (p.pageIndex === i ? p : { ...p, pageIndex: i }));
}

/**
 * After a structural op (move/duplicate/delete), each blank page's
 * `insertedAfterPdfPage` may disagree with its new neighbors. Rebind each
 * blank to the PDF page that now immediately precedes it, or null if no
 * PDF page precedes it.
 */
function recomputeBlankAnchors(pages: Page[]): Page[] {
  let lastPdf: number | null = null;
  return pages.map((p) => {
    if (p.type === 'pdf') {
      if (typeof p.pdfSourceIndex === 'number') lastPdf = p.pdfSourceIndex;
      return p;
    }
    return p.insertedAfterPdfPage === lastPdf ? p : { ...p, insertedAfterPdfPage: lastPdf };
  });
}

function cloneObjectWithNewId<T extends AnyObject>(o: T): T {
  return { ...o, id: crypto.randomUUID() };
}

function clonePageForDuplicate(p: Page): Page {
  return {
    ...p,
    objects: p.objects.map(cloneObjectWithNewId),
  };
}

export function createDocumentStore(): DocumentStore {
  const state = writable<EldrawDocument | null>(null);
  const history = createHistory();
  const commitListeners = new Set<PageCommitListener>();

  function emitCommit(pageIndex: number) {
    for (const listener of commitListeners) listener(pageIndex);
  }

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
    emitCommit(pageIndex);
  }

  return {
    subscribe: state.subscribe,

    load(doc) {
      state.set(normalizeLoaded(doc));
      history.clear();
    },

    replace(doc) {
      state.set(normalizeLoaded(doc));
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

    removeObjects(pageIndex, ids) {
      if (ids.length === 0) return;
      const doc = get(state);
      if (!doc) return;
      const page = doc.pages[pageIndex];
      if (!page) return;
      const wanted = new Set(ids);
      const items = page.objects
        .map((object, index) => ({ object, index }))
        .filter(({ object }) => wanted.has(object.id));
      if (items.length === 0) return;
      pushAndApply(pageIndex, { type: 'removeMany', items });
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

    insertBlankPageAfter(afterArrayIndex, width, height, background) {
      state.update((doc) => {
        if (!doc) return doc;
        const insertIdx = afterArrayIndex + 1;
        const insertedAfterPdfPage = lastPdfIndexAtOrBefore(doc.pages, afterArrayIndex);
        const safeBg = isSafeHexColor(background) ? background : undefined;
        const blank: Page = {
          pageIndex: insertIdx,
          type: 'blank',
          insertedAfterPdfPage,
          width,
          height,
          ...(safeBg ? { background: safeBg } : {}),
          objects: [],
        };
        const pages = [...doc.pages];
        pages.splice(insertIdx, 0, blank);
        history.shiftPageIndicesFrom(insertIdx);
        return { ...doc, pages: reindex(pages) };
      });
    },

    movePage(from, to) {
      state.update((doc) => {
        if (!doc) return doc;
        const pages = [...doc.pages];
        if (from < 0 || from >= pages.length) return doc;
        const clamped = Math.max(0, Math.min(pages.length - 1, to));
        if (clamped === from) return doc;
        const [moved] = pages.splice(from, 1);
        pages.splice(clamped, 0, moved);
        history.onPageMove(from, clamped);
        return { ...doc, pages: reindex(recomputeBlankAnchors(pages)) };
      });
    },

    duplicatePage(index) {
      state.update((doc) => {
        if (!doc) return doc;
        const src = doc.pages[index];
        if (!src) return doc;
        const copy = clonePageForDuplicate(src);
        const pages = [...doc.pages];
        pages.splice(index + 1, 0, copy);
        history.shiftPageIndicesFrom(index + 1);
        return { ...doc, pages: reindex(recomputeBlankAnchors(pages)) };
      });
    },

    deletePage(index) {
      state.update((doc) => {
        if (!doc) return doc;
        if (doc.pages.length <= 1) return doc;
        if (index < 0 || index >= doc.pages.length) return doc;
        const pages = [...doc.pages];
        pages.splice(index, 1);
        history.onPageDelete(index);
        return { ...doc, pages: reindex(recomputeBlankAnchors(pages)) };
      });
    },

    clearPage(pageIndex) {
      const doc = get(state);
      if (!doc) return;
      const page = doc.pages[pageIndex];
      if (!page || page.objects.length === 0) return;
      pushAndApply(pageIndex, { type: 'clearPage', objects: [...page.objects] });
    },

    undo(pageIndex) {
      const doc = get(state);
      if (!doc) return;
      const page = doc.pages[pageIndex];
      if (!page) return;
      const next = history.undo(pageIndex, page);
      if (next) {
        mutatePage(pageIndex, () => next);
        emitCommit(pageIndex);
      }
    },

    redo(pageIndex) {
      const doc = get(state);
      if (!doc) return;
      const page = doc.pages[pageIndex];
      if (!page) return;
      const next = history.redo(pageIndex, page);
      if (next) {
        mutatePage(pageIndex, () => next);
        emitCommit(pageIndex);
      }
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

    onPageCommit(listener) {
      commitListeners.add(listener);
      return () => {
        commitListeners.delete(listener);
      };
    },

    _internalApply(pageIndex, cmd) {
      mutatePage(pageIndex, (p) => applyCommand(p, cmd));
      emitCommit(pageIndex);
    },

    history,
  };
}

export const documentStore = createDocumentStore();
export const currentDocument: Readable<EldrawDocument | null> = {
  subscribe: documentStore.subscribe,
};
