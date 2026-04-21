import type { AnyObject, StrokeObject } from '$lib/types';
import { estimateTextBounds } from '$lib/text/hitTest';

export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Ray-casting point-in-polygon. Polygon is a list of vertices (closed
 * implicitly by joining last->first). Returns true for interior points
 * and is unspecified on the boundary; edges-of-polygon cases are rare
 * enough in UI hit testing that a deterministic boundary rule isn't needed.
 */
export function pointInPolygon(p: Vec2, polygon: readonly Vec2[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    const intersects =
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || Number.MIN_VALUE) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const d1 = cross(sub(d, c), sub(a, c));
  const d2 = cross(sub(d, c), sub(b, c));
  const d3 = cross(sub(b, a), sub(c, a));
  const d4 = cross(sub(b, a), sub(d, a));
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  if (d1 === 0 && onSegment(c, d, a)) return true;
  if (d2 === 0 && onSegment(c, d, b)) return true;
  if (d3 === 0 && onSegment(a, b, c)) return true;
  if (d4 === 0 && onSegment(a, b, d)) return true;
  return false;
}

function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

function cross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

function onSegment(a: Vec2, b: Vec2, p: Vec2): boolean {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  return p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
}

/** True when any vertex of the polyline lies inside the polygon, or any
 *  polyline segment crosses any polygon edge. Open polylines, not strokes
 *  as thick ribbons — the stroke thickness is handled via the AABB prefilter. */
export function polylineCrossesPolygon(points: readonly Vec2[], polygon: readonly Vec2[]): boolean {
  if (points.length === 0 || polygon.length < 3) return false;
  for (const p of points) {
    if (pointInPolygon(p, polygon)) return true;
  }
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    for (let j = 0, k = polygon.length - 1; j < polygon.length; k = j, j += 1) {
      if (segmentsIntersect(a, b, polygon[k], polygon[j])) return true;
    }
  }
  return false;
}

export function strokeIntersectsPolygon(stroke: StrokeObject, polygon: readonly Vec2[]): boolean {
  return polylineCrossesPolygon(stroke.points, polygon);
}

export function rectToPolygon(r: Rect): Vec2[] {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ];
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

export function rectContains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

/**
 * True when the object intersects the lasso polygon. Strokes, lines, and
 * angle marks use accurate segment-vs-polygon tests on their polyline
 * geometry. Other types (shape, graph, numberline, text) fall back to
 * AABB-vs-polygon overlap, which is cheap and good enough for UI hit
 * testing without per-type polygon code.
 */
export function objectIntersectsPolygon(
  obj: AnyObject,
  polygon: readonly Vec2[],
  aabb: Rect,
): boolean {
  if (obj.type === 'stroke') {
    return strokeIntersectsPolygon(obj, polygon);
  }
  if (obj.type === 'line') {
    const a = { x: obj.from.x, y: obj.from.y };
    const b = { x: obj.to.x, y: obj.to.y };
    return polylineCrossesPolygon([a, b], polygon);
  }
  if (obj.type === 'angleMark') {
    return polylineCrossesPolygon([obj.rayA, obj.vertex, obj.rayB], polygon);
  }
  return polygonOverlapsRect(polygon, aabb);
}

/** True when any polygon vertex is in the rect, any rect corner is in the
 *  polygon, or any polygon edge crosses any rect edge. */
export function polygonOverlapsRect(polygon: readonly Vec2[], rect: Rect): boolean {
  const rectPoly = rectToPolygon(rect);
  for (const p of polygon) {
    if (p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h) {
      return true;
    }
  }
  for (const p of rectPoly) {
    if (pointInPolygon(p, polygon)) return true;
  }
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    for (let k = 0; k < rectPoly.length; k += 1) {
      const l = (k + 1) % rectPoly.length;
      if (segmentsIntersect(polygon[j], polygon[i], rectPoly[k], rectPoly[l])) return true;
    }
  }
  return false;
}

export function textObjectBounds(obj: Extract<AnyObject, { type: 'text' }>): Rect {
  const b = estimateTextBounds(obj);
  return { x: b.x, y: b.y, w: b.width, h: b.height };
}
