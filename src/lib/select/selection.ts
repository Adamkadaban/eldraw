import { derived, get, writable, type Readable } from 'svelte/store';
import type { AnyObject, ObjectId } from '$lib/types';
import { objectAabb } from '$lib/tools/spatialIndex';
import type { Rect } from './geometry';

export interface SelectionState {
  pageIndex: number | null;
  ids: ReadonlySet<ObjectId>;
}

function empty(): SelectionState {
  return { pageIndex: null, ids: new Set() };
}

function createSelectionStore() {
  const store = writable<SelectionState>(empty());

  return {
    subscribe: store.subscribe,
    snapshot: () => get(store),

    clear() {
      store.set(empty());
    },

    setPage(pageIndex: number) {
      store.update((s) => (s.pageIndex === pageIndex ? s : { pageIndex, ids: new Set() }));
    },

    set(pageIndex: number, ids: Iterable<ObjectId>) {
      store.set({ pageIndex, ids: new Set(ids) });
    },

    toggle(pageIndex: number, id: ObjectId) {
      store.update((s) => {
        if (s.pageIndex !== pageIndex) {
          return { pageIndex, ids: new Set([id]) };
        }
        const ids = new Set(s.ids);
        if (ids.has(id)) ids.delete(id);
        else ids.add(id);
        return { pageIndex, ids };
      });
    },

    add(pageIndex: number, newIds: Iterable<ObjectId>) {
      store.update((s) => {
        const base = s.pageIndex === pageIndex ? s.ids : new Set<ObjectId>();
        const ids = new Set(base);
        for (const id of newIds) ids.add(id);
        return { pageIndex, ids };
      });
    },

    remove(ids: Iterable<ObjectId>) {
      store.update((s) => {
        const next = new Set(s.ids);
        for (const id of ids) next.delete(id);
        return { ...s, ids: next };
      });
    },
  };
}

export const selection = createSelectionStore();

export const selectionCount: Readable<number> = derived(selection, ($s) => $s.ids.size);

export function boundsOfObjects(objects: readonly AnyObject[]): Rect | null {
  if (objects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const o of objects) {
    const b = objectAabb(o);
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function filterSelected(
  objects: readonly AnyObject[],
  ids: ReadonlySet<ObjectId>,
): AnyObject[] {
  if (ids.size === 0) return [];
  return objects.filter((o) => ids.has(o.id));
}
