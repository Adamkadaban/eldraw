/**
 * Temp-ink stroke buffer.
 *
 * Strokes are kept entirely in-memory, never serialized into the
 * document. Each stroke carries the wall-clock time when its last point
 * was recorded; after `fadeMs` have elapsed past that time the stroke is
 * fully transparent and is pruned by the caller on the next animation
 * frame.
 *
 * The fade curve is linear in time for predictability. See
 * `fadeOpacity`.
 */

import type { Point, StrokeStyle } from '$lib/types';

export const DEFAULT_TEMP_INK_FADE_MS = 3000;
export const MIN_TEMP_INK_FADE_MS = 500;
export const MAX_TEMP_INK_FADE_MS = 30_000;

export function clampFadeMs(ms: number): number {
  if (!Number.isFinite(ms)) return DEFAULT_TEMP_INK_FADE_MS;
  return Math.min(MAX_TEMP_INK_FADE_MS, Math.max(MIN_TEMP_INK_FADE_MS, ms));
}

export interface TempInkStroke {
  id: string;
  style: StrokeStyle;
  points: Point[];
  /** Wall-clock ms when the stroke finished (or was last extended). */
  endedAt: number;
  fadeMs: number;
  /** perfect-freehand `streamline` baked when the stroke is committed; `undefined` means no smoothing. */
  streamline?: number;
}

export function newTempStrokeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `temp-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function createTempStroke(
  points: Point[],
  style: StrokeStyle,
  fadeMs: number,
  endedAt: number,
  streamline?: number,
): TempInkStroke {
  return {
    id: newTempStrokeId(),
    style: { ...style },
    points: points.map((p) => ({ ...p })),
    endedAt,
    fadeMs: clampFadeMs(fadeMs),
    ...(streamline !== undefined ? { streamline } : {}),
  };
}

/**
 * Linear fade from 1.0 at `endedAt` to 0.0 at `endedAt + fadeMs`.
 * Returns 1 before fade starts (while drawing) and 0 after fade ends.
 */
export function fadeOpacity(stroke: TempInkStroke, now: number): number {
  const age = now - stroke.endedAt;
  if (age <= 0) return 1;
  if (age >= stroke.fadeMs) return 0;
  return 1 - age / stroke.fadeMs;
}

export function pruneStrokes(strokes: TempInkStroke[], now: number): TempInkStroke[] {
  let expired = 0;
  for (const s of strokes) {
    if (fadeOpacity(s, now) <= 0) expired++;
    else break;
  }
  return expired === 0 ? strokes : strokes.slice(expired);
}
