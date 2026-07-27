/**
 * Change detection for incremental canvas layer redraws.
 *
 * A layer may draw only the new items when the previous list is an unchanged
 * prefix of the next one. Everything else — erase, undo, reorder, or a style
 * edit — must fall back to a full redraw, because already-painted pixels
 * cannot be corrected by drawing on top of them.
 *
 * This relies on the document store being immutable: any edit produces new
 * object references, so reference equality is a sound change test.
 */
export function isAppendOnly<T>(prev: readonly T[], next: readonly T[]): boolean {
  if (next.length < prev.length) return false;
  for (let i = 0; i < prev.length; i += 1) {
    if (prev[i] !== next[i]) return false;
  }
  return true;
}

/** Items added at the end when `prev` is an unchanged prefix of `next`. */
export function appendedItems<T>(prev: readonly T[], next: readonly T[]): T[] {
  if (!isAppendOnly(prev, next)) return [];
  return next.slice(prev.length);
}
