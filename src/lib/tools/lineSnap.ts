import type { Point2 } from './shapes';

const SNAP_STEP = Math.PI / 12;

/**
 * Snap `end` so the vector from `start` to `end` has an angle that is a
 * multiple of 15° (π/12 rad), preserving length. Zero-length drags are
 * returned unchanged.
 */
export function snapAngle15(start: Point2, end: Point2): Point2 {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return { x: end.x, y: end.y };
  const snapped = Math.round(Math.atan2(dy, dx) / SNAP_STEP) * SNAP_STEP;
  return {
    x: start.x + length * Math.cos(snapped),
    y: start.y + length * Math.sin(snapped),
  };
}
