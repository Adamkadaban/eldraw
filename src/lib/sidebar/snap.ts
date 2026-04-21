export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export type SnapEdge = 'left' | 'right' | 'top' | 'bottom';

export const SNAP_MARGIN = 12;
export const SNAP_THRESHOLD = 24;
export const EDGE_SNAP_THRESHOLD = 40;

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

/**
 * Detect which viewport edge the sidebar is being dragged toward. Returns
 * the closest edge within `threshold`, or `null` if the drag point is in
 * the middle. Edge snap replaces free-floating placement: the dragged
 * sidebar docks full-length to that edge.
 */
export function detectSnapEdge(
  p: Point,
  size: Size,
  viewport: Size,
  threshold: number = EDGE_SNAP_THRESHOLD,
): SnapEdge | null {
  const rightEdge = Math.max(0, viewport.width - size.width);
  const bottomEdge = Math.max(0, viewport.height - size.height);
  const distLeft = Math.max(0, p.x);
  const distTop = Math.max(0, p.y);
  const distRight = Math.max(0, rightEdge - p.x);
  const distBottom = Math.max(0, bottomEdge - p.y);

  const dists: Array<[SnapEdge, number]> = [
    ['left', distLeft],
    ['right', distRight],
    ['top', distTop],
    ['bottom', distBottom],
  ];

  let best: SnapEdge | null = null;
  let bestDist = threshold;
  for (const [edge, d] of dists) {
    if (d < bestDist) {
      best = edge;
      bestDist = d;
    }
  }
  return best;
}
