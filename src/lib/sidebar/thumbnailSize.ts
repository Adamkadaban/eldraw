export interface ThumbSize {
  width: number;
  height: number;
}

/**
 * Fit a page of (widthPt, heightPt) into a box of maxWidth px, preserving
 * aspect ratio. Degenerate or non-finite inputs fall back to a square of
 * maxWidth.
 */
export function thumbnailSize(widthPt: number, heightPt: number, maxWidth: number): ThumbSize {
  const safeMax = Number.isFinite(maxWidth) && maxWidth > 0 ? Math.max(1, Math.round(maxWidth)) : 1;
  if (!Number.isFinite(widthPt) || !Number.isFinite(heightPt) || widthPt <= 0 || heightPt <= 0) {
    return { width: safeMax, height: safeMax };
  }
  const aspect = heightPt / widthPt;
  const width = safeMax;
  const height = Math.max(1, Math.round(width * aspect));
  return { width, height };
}
