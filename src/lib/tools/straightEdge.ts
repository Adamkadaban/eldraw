import type { LineObject, Point, StrokeObject, StrokeStyle } from '$lib/types';
import { snapAngleToStep } from './lineSnap';

export interface Vec2 {
  x: number;
  y: number;
}

export const DEFAULT_STRAIGHT_EDGE_SNAP_STEP = 15;

export interface StraightEdgeEndpointInput {
  start: Vec2;
  current: Vec2;
  snapStepDeg: number;
  bypassSnap: boolean;
}

/**
 * Resolve the committed endpoint for a Shift-held stroke. When Alt is held
 * (`bypassSnap`) or the configured snap step is non-positive, the raw cursor
 * position wins; otherwise the angle is locked to the nearest multiple.
 */
export function straightEdgeEndpoint(input: StraightEdgeEndpointInput): Vec2 {
  if (input.bypassSnap) return { x: input.current.x, y: input.current.y };
  return snapAngleToStep(input.start, input.current, input.snapStepDeg);
}

export interface StraightEdgeCommitInput {
  shiftAtPointerUp: boolean;
  rulerActive: boolean;
  tool: 'pen' | 'highlighter' | 'eraser' | 'select' | string;
  altAtPointerUp: boolean;
  first: Vec2;
  last: Vec2;
  style: StrokeStyle;
  snapStepDeg: number;
}

export type StraightEdgeCommit =
  | { kind: 'line'; from: Vec2; to: Vec2 }
  | { kind: 'stroke'; from: Vec2; to: Vec2 }
  | { kind: 'none' };

/**
 * Pure commit-time decision for Shift-held strokes. Pen commits resolve to a
 * `LineObject` so they render via `ShapeLayer`; highlighter commits resolve
 * to a 2-point `StrokeObject` so the straight segment keeps the same
 * multiply blend + opacity clamp as a normal highlighter stroke and matches
 * the live preview. `none` means the caller should commit the stroke as-is.
 */
export function decideStraightEdgeCommit(input: StraightEdgeCommitInput): StraightEdgeCommit {
  if (!input.shiftAtPointerUp) return { kind: 'none' };
  if (input.rulerActive) return { kind: 'none' };
  if (input.tool !== 'pen' && input.tool !== 'highlighter') return { kind: 'none' };
  const to = straightEdgeEndpoint({
    start: input.first,
    current: input.last,
    snapStepDeg: input.snapStepDeg,
    bypassSnap: input.altAtPointerUp,
  });
  if (Math.hypot(to.x - input.first.x, to.y - input.first.y) < 1e-6) {
    return { kind: 'none' };
  }
  const from = { ...input.first };
  if (input.tool === 'highlighter') return { kind: 'stroke', from, to };
  return { kind: 'line', from, to };
}

export function buildStraightEdgeLine(
  id: string,
  createdAt: number,
  from: Vec2,
  to: Vec2,
  style: StrokeStyle,
): LineObject {
  return {
    id,
    createdAt,
    type: 'line',
    style: { ...style },
    from: { ...from },
    to: { ...to },
    arrow: { start: false, end: false },
  };
}

/**
 * Build a 2-point highlighter `StrokeObject` for a Shift-committed straight
 * segment. Mirrors `strokeFromInput` shape so the stroke renders via the
 * highlighter layer (multiply + opacity clamp) exactly like a free-drawn
 * highlighter stroke.
 */
export function buildStraightEdgeStroke(
  id: string,
  createdAt: number,
  from: Vec2,
  to: Vec2,
  style: StrokeStyle,
): StrokeObject {
  const endpoints: Point[] = [
    { x: from.x, y: from.y, pressure: 0.5, t: 0 },
    { x: to.x, y: to.y, pressure: 0.5, t: 0 },
  ];
  return {
    id,
    createdAt,
    type: 'stroke',
    tool: 'highlighter',
    style: { ...style },
    points: endpoints,
  };
}
