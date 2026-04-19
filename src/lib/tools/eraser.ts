import type { Point, StrokeObject } from '$lib/types';

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

export type { Point };
