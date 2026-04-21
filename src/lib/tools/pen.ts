import type { Point, StrokeObject, StrokeStyle } from '$lib/types';

export function strokeFromInput(
  points: Point[],
  style: StrokeStyle,
  tool: 'pen' | 'highlighter',
): StrokeObject {
  return {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    type: 'stroke',
    tool,
    style: { ...style },
    points: points.map((p) => ({ ...p })),
  };
}
