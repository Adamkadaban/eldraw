import type { MutationEvent } from '$lib/store/document';
import type { StrokeObject } from '$lib/types';
import type { SessionEvent } from './types';

/**
 * Turn a documentStore MutationEvent into the SessionEvents to log. A stroke
 * add becomes a dedicated `stroke` event so the player can animate partial
 * stroke progress; non-stroke adds become `objectAdd`.
 */
export function mutationToSessionEvents(ev: MutationEvent, t: number): SessionEvent[] {
  switch (ev.kind) {
    case 'add': {
      if (ev.object.type === 'stroke') {
        return [{ kind: 'stroke', t, page: ev.pageIndex, stroke: ev.object as StrokeObject }];
      }
      return [{ kind: 'objectAdd', t, page: ev.pageIndex, obj: ev.object }];
    }
    case 'remove':
      if (ev.ids.length === 0) return [];
      return [{ kind: 'objectDel', t, page: ev.pageIndex, ids: [...ev.ids] }];
    case 'update':
      return [{ kind: 'objectUpdate', t, page: ev.pageIndex, id: ev.id, after: ev.after }];
  }
}

/**
 * Stroke duration in ms, derived from the last point's `t`. Points carry
 * per-point `t` relative to stroke start (see `Point.t`).
 */
export function strokeDurationMs(stroke: StrokeObject): number {
  if (stroke.points.length === 0) return 0;
  return Math.max(0, stroke.points[stroke.points.length - 1].t);
}

/**
 * Slice a stroke's point list to only the prefix with per-point `t <= cutoff`.
 * Used for mid-stroke replay rendering. Always keeps at least the first point
 * when any are within the cutoff.
 */
export function sliceStrokePointsUpTo(stroke: StrokeObject, cutoff: number): StrokeObject {
  if (cutoff <= 0) {
    return { ...stroke, points: stroke.points.length > 0 ? [stroke.points[0]] : [] };
  }
  const points = [];
  for (const p of stroke.points) {
    if (p.t <= cutoff) points.push(p);
    else break;
  }
  if (points.length === 0 && stroke.points.length > 0) {
    points.push(stroke.points[0]);
  }
  return { ...stroke, points };
}
