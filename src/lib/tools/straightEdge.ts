import type { LineObject, StrokeStyle } from '$lib/types';
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

export type StraightEdgeCommit = { kind: 'line'; from: Vec2; to: Vec2 } | { kind: 'stroke' };

/**
 * Pure commit-time decision. Produces a `line` descriptor when Shift was
 * held at pointer-up for a pen/highlighter stroke with no active ruler and
 * the segment has non-zero length; otherwise signals that the caller should
 * commit the stroke normally.
 */
export function decideStraightEdgeCommit(input: StraightEdgeCommitInput): StraightEdgeCommit {
  if (!input.shiftAtPointerUp) return { kind: 'stroke' };
  if (input.rulerActive) return { kind: 'stroke' };
  if (input.tool !== 'pen' && input.tool !== 'highlighter') return { kind: 'stroke' };
  const to = straightEdgeEndpoint({
    start: input.first,
    current: input.last,
    snapStepDeg: input.snapStepDeg,
    bypassSnap: input.altAtPointerUp,
  });
  if (Math.hypot(to.x - input.first.x, to.y - input.first.y) < 1e-6) {
    return { kind: 'stroke' };
  }
  return { kind: 'line', from: { ...input.first }, to };
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
