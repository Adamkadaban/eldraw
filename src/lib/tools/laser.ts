/**
 * Laser pointer trail buffer.
 *
 * Points carry wall-clock timestamps (ms). Each point fades over
 * `trailMs` and is dropped once older than that. The buffer is never
 * persisted; it is a pure ring of recent pointer samples used only for
 * drawing the glowing trail.
 */

export interface LaserPoint {
  x: number;
  y: number;
  t: number;
}

export interface LaserTrailOptions {
  trailMs: number;
}

export const DEFAULT_LASER_TRAIL_MS = 300;
export const MIN_LASER_TRAIL_MS = 50;
export const MAX_LASER_TRAIL_MS = 2000;

export function clampTrailMs(ms: number): number {
  if (!Number.isFinite(ms)) return DEFAULT_LASER_TRAIL_MS;
  return Math.min(MAX_LASER_TRAIL_MS, Math.max(MIN_LASER_TRAIL_MS, ms));
}

export function pruneTrail(points: LaserPoint[], now: number, trailMs: number): LaserPoint[] {
  const cutoff = now - trailMs;
  let i = 0;
  while (i < points.length && points[i].t < cutoff) i++;
  return i === 0 ? points : points.slice(i);
}

export function appendPoint(points: LaserPoint[], p: LaserPoint, trailMs: number): LaserPoint[] {
  const next = pruneTrail(points, p.t, trailMs);
  next.push(p);
  return next;
}

/**
 * Linear fade. 1.0 at the newest point, 0.0 at `now - trailMs`.
 * Returns 0 for points outside the trail window (defensive).
 */
export function trailAlpha(point: LaserPoint, now: number, trailMs: number): number {
  if (trailMs <= 0) return 0;
  const age = now - point.t;
  if (age <= 0) return 1;
  if (age >= trailMs) return 0;
  return 1 - age / trailMs;
}
