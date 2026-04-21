import type { AnyObject, Point, StrokeObject } from '$lib/types';
import { hitTestLine, hitTestNumberLine, hitTestShape } from '$lib/tools/shapes';
import { hitTestTextObject } from '$lib/text/hitTest';

interface Vec {
  x: number;
  y: number;
}

function distanceToSegment(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ex = p.x - a.x;
    const ey = p.y - a.y;
    return Math.hypot(ex, ey);
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  return Math.hypot(p.x - cx, p.y - cy);
}

/**
 * Hit-test an eraser touch against a stroke.
 * Treats the stroke as a thick polyline whose half-thickness is
 * max(style.width / 2, pressure * style.width) at each segment, plus `radius`.
 */
export function hitTestStroke(
  stroke: StrokeObject,
  at: { x: number; y: number },
  radius: number,
): boolean {
  const pts = stroke.points;
  if (pts.length === 0) return false;

  const baseHalf = stroke.style.width / 2;

  if (pts.length === 1) {
    const d = Math.hypot(pts[0].x - at.x, pts[0].y - at.y);
    return d <= baseHalf + radius;
  }

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const pressure = Math.max(a.pressure, b.pressure);
    const half = Math.max(baseHalf, baseHalf * 2 * pressure);
    const d = distanceToSegment(at, a, b);
    if (d <= half + radius) return true;
  }
  return false;
}

export function hitTestStrokes(
  strokes: StrokeObject[],
  at: { x: number; y: number },
  radius: number,
): StrokeObject[] {
  return strokes.filter((s) => hitTestStroke(s, at, radius));
}

function hitTestBounds(
  bounds: { x: number; y: number; w: number; h: number },
  at: Vec,
  radius: number,
): boolean {
  return (
    at.x >= bounds.x - radius &&
    at.x <= bounds.x + bounds.w + radius &&
    at.y >= bounds.y - radius &&
    at.y <= bounds.y + bounds.h + radius
  );
}

/**
 * Unified hit-test for any overlay object. The eraser uses this to decide
 * whether a pointer sample covers an object. Curve-accurate hit-testing for
 * graphs is a future improvement; a bounding-box test is acceptable today.
 */
export function hitTestObject(
  obj: AnyObject,
  at: { x: number; y: number },
  radius: number,
): boolean {
  switch (obj.type) {
    case 'stroke':
      return hitTestStroke(obj, at, radius);
    case 'line':
      return hitTestLine(obj, at, radius);
    case 'shape':
      return hitTestShape(obj, at, radius);
    case 'numberline':
      return hitTestNumberLine(obj, at, radius);
    case 'graph':
      return hitTestBounds(obj.bounds, at, radius);
    case 'text':
      return hitTestTextObject(obj, at, radius);
    case 'angleMark': {
      const half = obj.width / 2;
      const dA = distanceToSegment(at, obj.vertex, obj.rayA);
      if (dA <= half + radius) return true;
      const dB = distanceToSegment(at, obj.vertex, obj.rayB);
      return dB <= half + radius;
    }
    default: {
      const _exhaustiveCheck: never = obj;
      void _exhaustiveCheck;
      return false;
    }
  }
}

export function hitTestObjects(
  objects: readonly AnyObject[],
  at: { x: number; y: number },
  radius: number,
): AnyObject[] {
  return objects.filter((o) => hitTestObject(o, at, radius));
}

export type { Point };
