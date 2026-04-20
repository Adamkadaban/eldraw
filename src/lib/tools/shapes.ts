import type { LineObject, NumberLineObject, ShapeObject } from '$lib/types';

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point2 {
  x: number;
  y: number;
}

/** Normalize a drag (start, end) into positive-width/height bounds. */
export function normalizeBounds(a: Point2, b: Point2): Bounds {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(b.x - a.x);
  const h = Math.abs(b.y - a.y);
  return { x, y, w, h };
}

function distanceToSegment(p: Point2, a: Point2, b: Point2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  return Math.hypot(p.x - cx, p.y - cy);
}

export function hitTestLine(line: LineObject, p: Point2, radius: number): boolean {
  const half = line.style.width / 2;
  return distanceToSegment(p, line.from, line.to) <= half + radius;
}

export function hitTestShape(shape: ShapeObject, p: Point2, radius: number): boolean {
  const { x, y, w, h } = shape.bounds;
  const half = shape.style.width / 2;
  if (shape.kind === 'rect') {
    if (shape.fill !== null) {
      return (
        p.x >= x - radius && p.x <= x + w + radius && p.y >= y - radius && p.y <= y + h + radius
      );
    }
    const onEdge = (() => {
      const insideX = p.x >= x - half - radius && p.x <= x + w + half + radius;
      const insideY = p.y >= y - half - radius && p.y <= y + h + half + radius;
      if (!insideX || !insideY) return false;
      const nearLeft = Math.abs(p.x - x) <= half + radius;
      const nearRight = Math.abs(p.x - (x + w)) <= half + radius;
      const nearTop = Math.abs(p.y - y) <= half + radius;
      const nearBottom = Math.abs(p.y - (y + h)) <= half + radius;
      return nearLeft || nearRight || nearTop || nearBottom;
    })();
    return onEdge;
  }
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  if (rx <= 0 || ry <= 0) return false;
  const nx = (p.x - cx) / rx;
  const ny = (p.y - cy) / ry;
  const dist = Math.hypot(nx, ny);
  if (shape.fill !== null) {
    return dist <= 1 + radius / Math.min(rx, ry);
  }
  const ringTol = (half + radius) / Math.min(rx, ry);
  return Math.abs(dist - 1) <= ringTol;
}

/** x-position (in page coords) of a numeric value along the number line. */
export function numberLineValueToX(nl: NumberLineObject, value: number): number {
  if (nl.max === nl.min) return nl.from.x;
  const t = (value - nl.min) / (nl.max - nl.min);
  return nl.from.x + t * nl.length;
}

/** Numeric value at a given x-position along the number line. */
export function numberLineXToValue(nl: NumberLineObject, x: number): number {
  if (nl.length === 0) return nl.min;
  const t = (x - nl.from.x) / nl.length;
  return nl.min + t * (nl.max - nl.min);
}

export function hitTestNumberLine(nl: NumberLineObject, p: Point2, radius: number): boolean {
  const a = nl.from;
  const b = { x: nl.from.x + nl.length, y: nl.from.y };
  const half = nl.style.width / 2;
  return distanceToSegment(p, a, b) <= half + radius + 6;
}
