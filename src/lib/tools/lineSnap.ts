import type { Point2 } from './shapes';

const DEG_TO_RAD = Math.PI / 180;

/**
 * Snap `end` so the vector from `start` to `end` has an angle that is a
 * multiple of `stepDeg`, preserving length. Zero-length drags and
 * non-positive step values return the endpoint unchanged.
 */
export function snapAngleToStep(start: Point2, end: Point2, stepDeg: number): Point2 {
  if (!Number.isFinite(stepDeg) || stepDeg <= 0) return { x: end.x, y: end.y };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return { x: end.x, y: end.y };
  const stepRad = stepDeg * DEG_TO_RAD;
  const snapped = Math.round(Math.atan2(dy, dx) / stepRad) * stepRad;
  return {
    x: start.x + length * Math.cos(snapped),
    y: start.y + length * Math.sin(snapped),
  };
}

/**
 * Back-compat wrapper: snap to the nearest 15° multiple. `ShapeLiveLayer`
 * still wires this for the line-tool Shift-drag snap.
 */
export function snapAngle15(start: Point2, end: Point2): Point2 {
  return snapAngleToStep(start, end, 15);
}
