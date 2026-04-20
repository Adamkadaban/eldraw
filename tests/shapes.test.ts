import { describe, it, expect } from 'vitest';
import {
  hitTestLine,
  hitTestNumberLine,
  hitTestShape,
  normalizeBounds,
  numberLineValueToX,
  numberLineXToValue,
} from '$lib/tools/shapes';
import type { LineObject, NumberLineObject, ShapeObject, StrokeStyle } from '$lib/types';

const STYLE: StrokeStyle = { color: '#000', width: 2, dash: 'solid', opacity: 1 };

function mkLine(from: { x: number; y: number }, to: { x: number; y: number }): LineObject {
  return {
    id: 'l',
    createdAt: 0,
    type: 'line',
    style: STYLE,
    from,
    to,
    arrow: { start: false, end: false },
  };
}

function mkShape(
  kind: 'rect' | 'ellipse',
  bounds: { x: number; y: number; w: number; h: number },
  fill: string | null = null,
): ShapeObject {
  return {
    id: 's',
    createdAt: 0,
    type: 'shape',
    kind,
    style: STYLE,
    fill,
    bounds,
  };
}

function mkNumberLine(overrides: Partial<NumberLineObject> = {}): NumberLineObject {
  return {
    id: 'n',
    createdAt: 0,
    type: 'numberline',
    style: STYLE,
    from: { x: 0, y: 100 },
    length: 200,
    min: -5,
    max: 5,
    tickStep: 1,
    labelStep: 1,
    marks: [],
    ...overrides,
  };
}

describe('normalizeBounds', () => {
  it('returns positive size for positive drag', () => {
    expect(normalizeBounds({ x: 1, y: 2 }, { x: 11, y: 22 })).toEqual({ x: 1, y: 2, w: 10, h: 20 });
  });

  it('flips negative drags to positive bounds', () => {
    expect(normalizeBounds({ x: 11, y: 22 }, { x: 1, y: 2 })).toEqual({ x: 1, y: 2, w: 10, h: 20 });
  });

  it('handles mixed-sign drag', () => {
    expect(normalizeBounds({ x: 0, y: 30 }, { x: 30, y: 0 })).toEqual({ x: 0, y: 0, w: 30, h: 30 });
  });

  it('returns zero size for identical points', () => {
    expect(normalizeBounds({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({ x: 5, y: 5, w: 0, h: 0 });
  });
});

describe('hitTestLine', () => {
  it('hits along the segment', () => {
    expect(hitTestLine(mkLine({ x: 0, y: 0 }, { x: 100, y: 0 }), { x: 50, y: 0 }, 0)).toBe(true);
  });

  it('misses far above', () => {
    expect(hitTestLine(mkLine({ x: 0, y: 0 }, { x: 100, y: 0 }), { x: 50, y: 50 }, 1)).toBe(false);
  });

  it('uses radius to widen hit area', () => {
    const l = mkLine({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(hitTestLine(l, { x: 50, y: 5 }, 0)).toBe(false);
    expect(hitTestLine(l, { x: 50, y: 5 }, 5)).toBe(true);
  });
});

describe('hitTestShape (rect)', () => {
  it('outline-only rect hits the edge', () => {
    const s = mkShape('rect', { x: 10, y: 10, w: 100, h: 50 });
    expect(hitTestShape(s, { x: 10, y: 30 }, 0)).toBe(true);
    expect(hitTestShape(s, { x: 60, y: 30 }, 0)).toBe(false);
  });

  it('filled rect hits inside', () => {
    const s = mkShape('rect', { x: 10, y: 10, w: 100, h: 50 }, '#f00');
    expect(hitTestShape(s, { x: 60, y: 30 }, 0)).toBe(true);
  });

  it('rect misses far outside', () => {
    const s = mkShape('rect', { x: 0, y: 0, w: 10, h: 10 });
    expect(hitTestShape(s, { x: 100, y: 100 }, 1)).toBe(false);
  });
});

describe('hitTestShape (ellipse)', () => {
  it('outline ellipse hits on the rim', () => {
    const s = mkShape('ellipse', { x: 0, y: 0, w: 100, h: 100 });
    expect(hitTestShape(s, { x: 100, y: 50 }, 0)).toBe(true);
  });

  it('filled ellipse hits inside the center', () => {
    const s = mkShape('ellipse', { x: 0, y: 0, w: 100, h: 100 }, '#0f0');
    expect(hitTestShape(s, { x: 50, y: 50 }, 0)).toBe(true);
  });

  it('outline ellipse misses center', () => {
    const s = mkShape('ellipse', { x: 0, y: 0, w: 100, h: 100 });
    expect(hitTestShape(s, { x: 50, y: 50 }, 0)).toBe(false);
  });
});

describe('numberLine value/x mapping', () => {
  const nl = mkNumberLine();

  it('maps min to from.x', () => {
    expect(numberLineValueToX(nl, -5)).toBeCloseTo(0);
  });

  it('maps max to from.x + length', () => {
    expect(numberLineValueToX(nl, 5)).toBeCloseTo(200);
  });

  it('maps midpoint correctly', () => {
    expect(numberLineValueToX(nl, 0)).toBeCloseTo(100);
  });

  it('inverse mapping recovers the value', () => {
    expect(numberLineXToValue(nl, 100)).toBeCloseTo(0);
    expect(numberLineXToValue(nl, 200)).toBeCloseTo(5);
    expect(numberLineXToValue(nl, 50)).toBeCloseTo(-2.5);
  });

  it('handles offset origins', () => {
    const offset = mkNumberLine({ from: { x: 50, y: 100 }, length: 100, min: 0, max: 10 });
    expect(numberLineValueToX(offset, 0)).toBeCloseTo(50);
    expect(numberLineValueToX(offset, 10)).toBeCloseTo(150);
    expect(numberLineXToValue(offset, 100)).toBeCloseTo(5);
  });

  it('degenerate range maps to start', () => {
    const flat = mkNumberLine({ min: 3, max: 3 });
    expect(numberLineValueToX(flat, 3)).toBeCloseTo(flat.from.x);
  });
});

describe('hitTestNumberLine', () => {
  it('hits points on or near the axis', () => {
    const nl = mkNumberLine();
    expect(hitTestNumberLine(nl, { x: 100, y: 100 }, 0)).toBe(true);
    expect(hitTestNumberLine(nl, { x: 100, y: 105 }, 0)).toBe(true);
  });

  it('misses points far from the axis', () => {
    const nl = mkNumberLine();
    expect(hitTestNumberLine(nl, { x: 100, y: 200 }, 0)).toBe(false);
  });
});
