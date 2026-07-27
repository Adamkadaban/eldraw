/**
 * Page navigation targets for structural page operations.
 *
 * These take the page total *after* the operation has been applied, so callers
 * must not try to predict it by adjusting a stale count — reading the
 * authoritative total from the document store avoids an off-by-one that
 * depends on when derived state happens to recompute.
 */

/** Page to show after duplicating `sourceIndex`; the copy sits just after it. */
export function pageIndexAfterDuplicate(sourceIndex: number, totalAfter: number): number {
  if (totalAfter <= 0) return 0;
  return Math.max(0, Math.min(totalAfter - 1, sourceIndex + 1));
}

/**
 * Page to show after deleting `deletedIndex`.
 *
 * Deleting a page before the current one shifts it down by one so the same
 * content stays in view. Deleting the current page steps back to the previous
 * one. Deleting a later page leaves the position untouched.
 */
export function pageIndexAfterDelete(
  deletedIndex: number,
  currentIndex: number,
  totalAfter: number,
): number {
  if (totalAfter <= 0) return 0;
  const target = currentIndex >= deletedIndex ? currentIndex - 1 : currentIndex;
  return Math.max(0, Math.min(totalAfter - 1, target));
}
