import type { AnyObject, DashStyle, ObjectId } from '$lib/types';
import { get } from 'svelte/store';
import { documentStore } from '$lib/store/document';
import { applyStyleToObject, transformObject, translateObject, type Affine } from './transform';

function pageObjects(pageIndex: number): AnyObject[] | null {
  const doc = get(documentStore);
  return doc?.pages[pageIndex]?.objects ? [...doc.pages[pageIndex].objects] : null;
}

function mapSelected(
  pageIndex: number,
  ids: ReadonlySet<ObjectId>,
  fn: (o: AnyObject) => AnyObject,
): AnyObject[] {
  const objs = pageObjects(pageIndex);
  if (!objs) return [];
  const out: AnyObject[] = [];
  for (const obj of objs) {
    if (ids.has(obj.id)) out.push(fn(obj));
  }
  return out;
}

export function commitTransform(
  pageIndex: number,
  ids: ReadonlySet<ObjectId>,
  t: Affine,
  opts: { scaleStrokeWidth?: boolean } = {},
): void {
  if (ids.size === 0) return;
  const afters = mapSelected(pageIndex, ids, (o) => transformObject(o, t, opts));
  documentStore.updateObjects(pageIndex, afters);
}

export function commitTranslate(
  pageIndex: number,
  ids: ReadonlySet<ObjectId>,
  dx: number,
  dy: number,
): void {
  if (ids.size === 0 || (dx === 0 && dy === 0)) return;
  const afters = mapSelected(pageIndex, ids, (o) => translateObject(o, dx, dy));
  documentStore.updateObjects(pageIndex, afters);
}

export function commitStylePatch(
  pageIndex: number,
  ids: ReadonlySet<ObjectId>,
  patch: { color?: string; width?: number; dash?: DashStyle },
): void {
  if (ids.size === 0) return;
  const afters = mapSelected(pageIndex, ids, (o) => applyStyleToObject(o, patch));
  documentStore.updateObjects(pageIndex, afters);
}

export function commitDelete(pageIndex: number, ids: ReadonlySet<ObjectId>): void {
  if (ids.size === 0) return;
  documentStore.removeObjects(pageIndex, [...ids]);
}

/**
 * Z-order mutation: remove then re-add in the new order. Wrapped under a
 * single undo entry is tricky given the existing commands; for now we
 * implement via two separate ops (remove + re-add). Undoing will take two
 * steps for z-order changes — acceptable for phase 1.
 */
export function bringForward(pageIndex: number, ids: ReadonlySet<ObjectId>): void {
  reorderSelection(pageIndex, ids, 'forward');
}

export function sendBackward(pageIndex: number, ids: ReadonlySet<ObjectId>): void {
  reorderSelection(pageIndex, ids, 'backward');
}

function pageSnapshot(pageIndex: number): AnyObject[] | null {
  return pageObjects(pageIndex);
}

function reorderSelection(
  pageIndex: number,
  ids: ReadonlySet<ObjectId>,
  direction: 'forward' | 'backward',
): void {
  const current = pageSnapshot(pageIndex);
  if (!current) return;
  const next = reorderArray(current, ids, direction);
  if (arraysEqualById(current, next)) return;
  documentStore.removeObjects(
    pageIndex,
    current.map((o) => o.id),
  );
  for (const obj of next) documentStore.addObject(pageIndex, obj);
}

function arraysEqualById(a: AnyObject[], b: AnyObject[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].id !== b[i].id) return false;
  }
  return true;
}

export function reorderArray(
  objects: readonly AnyObject[],
  ids: ReadonlySet<ObjectId>,
  direction: 'forward' | 'backward',
): AnyObject[] {
  const next = [...objects];
  if (direction === 'forward') {
    for (let i = next.length - 2; i >= 0; i -= 1) {
      if (ids.has(next[i].id) && !ids.has(next[i + 1].id)) {
        const t = next[i];
        next[i] = next[i + 1];
        next[i + 1] = t;
      }
    }
  } else {
    for (let i = 1; i < next.length; i += 1) {
      if (ids.has(next[i].id) && !ids.has(next[i - 1].id)) {
        const t = next[i];
        next[i] = next[i - 1];
        next[i - 1] = t;
      }
    }
  }
  return next;
}
