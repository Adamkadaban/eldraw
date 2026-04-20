export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export const SNAP_MARGIN = 12;
export const SNAP_THRESHOLD = 24;

export function clampToViewport(p: Point, size: Size, viewport: Size): Point {
  const maxX = Math.max(0, viewport.width - size.width);
  const maxY = Math.max(0, viewport.height - size.height);
  return {
    x: Math.max(0, Math.min(maxX, p.x)),
    y: Math.max(0, Math.min(maxY, p.y)),
  };
}

export function applySnap(
  p: Point,
  size: Size,
  viewport: Size,
  threshold: number = SNAP_THRESHOLD,
  margin: number = SNAP_MARGIN,
): Point {
  const rightEdge = viewport.width - size.width;
  const bottomEdge = viewport.height - size.height;

  let x = p.x;
  let y = p.y;

  if (p.x <= threshold) x = margin;
  else if (rightEdge - p.x <= threshold) x = rightEdge - margin;

  if (p.y <= threshold) y = margin;
  else if (bottomEdge - p.y <= threshold) y = bottomEdge - margin;

  return clampToViewport({ x, y }, size, viewport);
}
