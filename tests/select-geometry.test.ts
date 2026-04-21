import { describe, it, expect } from 'vitest';
import {
  pointInPolygon,
  polygonOverlapsRect,
  polylineCrossesPolygon,
  rectContains,
  rectsOverlap,
  segmentsIntersect,
  strokeIntersectsPolygon,
  type Rect,
  type Vec2,
} from '$lib/select/geometry';
import type { StrokeObject, StrokeStyle } from '$lib/types';

const STYLE: StrokeStyle = { color: '#000', width: 2, dash: 'solid', opacity: 1 };

const SQUARE: Vec2[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

describe('pointInPolygon', () => {
  it('detects inside points', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, SQUARE)).toBe(true);
  });
  it('detects outside points', () => {
    expect(pointInPolygon({ x: 20, y: 5 }, SQUARE)).toBe(false);
  });
  it('rejects polygons with <3 vertices', () => {
    expect(pointInPolygon({ x: 0, y: 0 }, [{ x: 0, y: 0 }])).toBe(false);
  });
});

describe('segmentsIntersect', () => {
  it('crosses', () => {
    expect(
      segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }),
    ).toBe(true);
  });
  it('disjoint', () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 5, y: 5 }, { x: 6, y: 6 })).toBe(
      false,
    );
  });
});

describe('polylineCrossesPolygon', () => {
  it('crossing edge', () => {
    expect(
      polylineCrossesPolygon(
        [
          { x: -5, y: 5 },
          { x: 15, y: 5 },
        ],
        SQUARE,
      ),
    ).toBe(true);
  });
  it('fully outside', () => {
    expect(
      polylineCrossesPolygon(
        [
          { x: 100, y: 100 },
          { x: 200, y: 200 },
        ],
        SQUARE,
      ),
    ).toBe(false);
  });
  it('fully inside', () => {
    expect(
      polylineCrossesPolygon(
        [
          { x: 2, y: 2 },
          { x: 5, y: 5 },
        ],
        SQUARE,
      ),
    ).toBe(true);
  });
});

describe('strokeIntersectsPolygon', () => {
  it('matches polyline behavior', () => {
    const stroke: StrokeObject = {
      id: 's',
      createdAt: 0,
      type: 'stroke',
      tool: 'pen',
      style: STYLE,
      points: [
        { x: 5, y: 5, pressure: 0.5, t: 0 },
        { x: 25, y: 5, pressure: 0.5, t: 1 },
      ],
    };
    expect(strokeIntersectsPolygon(stroke, SQUARE)).toBe(true);
  });
});

describe('rect helpers', () => {
  const r: Rect = { x: 0, y: 0, w: 10, h: 10 };
  it('rectsOverlap', () => {
    expect(rectsOverlap(r, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(rectsOverlap(r, { x: 11, y: 0, w: 2, h: 2 })).toBe(false);
  });
  it('rectContains', () => {
    expect(rectContains(r, { x: 1, y: 1, w: 2, h: 2 })).toBe(true);
    expect(rectContains(r, { x: 1, y: 1, w: 20, h: 2 })).toBe(false);
  });
  it('polygonOverlapsRect', () => {
    expect(polygonOverlapsRect(SQUARE, { x: 5, y: 5, w: 50, h: 50 })).toBe(true);
    expect(polygonOverlapsRect(SQUARE, { x: 100, y: 100, w: 10, h: 10 })).toBe(false);
  });
});
