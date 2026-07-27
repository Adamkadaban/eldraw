import { describe, expect, it } from 'vitest';
import {
  RULER_BODY_PT,
  rulerEdge,
  rulerEdgesNearest,
  rulerFarEdge,
  snapPointToRuler,
} from '$lib/geometry';
import type { RulerState } from '$lib/geometry/ruler';

const horizontal: RulerState = {
  from: { x: 100, y: 200 },
  rotation: 0,
  length: 300,
  unit: 'cm',
};

describe('ruler far edge', () => {
  it('sits one body width across from the near edge', () => {
    const near = rulerEdge(horizontal);
    const far = rulerFarEdge(horizontal);
    expect(far.a.x).toBeCloseTo(near.a.x, 6);
    expect(far.a.y).toBeCloseTo(near.a.y + RULER_BODY_PT, 6);
    expect(far.b.y).toBeCloseTo(near.b.y + RULER_BODY_PT, 6);
  });

  it('stays a body width away when the ruler is rotated', () => {
    const rotated: RulerState = { ...horizontal, rotation: 37 };
    const near = rulerEdge(rotated);
    const far = rulerFarEdge(rotated);
    const dx = far.a.x - near.a.x;
    const dy = far.a.y - near.a.y;
    expect(Math.hypot(dx, dy)).toBeCloseTo(RULER_BODY_PT, 6);
  });
});

describe('rulerEdgesNearest', () => {
  it('puts the top edge first for a point above the ruler', () => {
    const [near] = rulerEdgesNearest({ x: 200, y: 195 }, horizontal);
    expect(near.a.y).toBeCloseTo(200, 6);
  });

  it('puts the bottom edge first for a point below the ruler', () => {
    const [near] = rulerEdgesNearest({ x: 200, y: 200 + RULER_BODY_PT + 5 }, horizontal);
    expect(near.a.y).toBeCloseTo(200 + RULER_BODY_PT, 6);
  });
});

describe('snapping to either ruler edge', () => {
  it('snaps ink drawn along the top edge', () => {
    const res = snapPointToRuler({ x: 250, y: 204 }, horizontal, 12);
    expect(res.snapped).toBe(true);
    expect(res.point.y).toBeCloseTo(200, 6);
  });

  /**
   * The regression that mattered: only the top edge used to be offered, so ink
   * drawn along the lower edge sat a whole body width away and never snapped.
   */
  it('snaps ink drawn along the bottom edge', () => {
    const res = snapPointToRuler({ x: 250, y: 200 + RULER_BODY_PT - 3 }, horizontal, 12);
    expect(res.snapped).toBe(true);
    expect(res.point.y).toBeCloseTo(200 + RULER_BODY_PT, 6);
  });

  it('snaps from anywhere on the body to the nearer edge', () => {
    for (let offset = 0; offset <= RULER_BODY_PT; offset += 2) {
      const res = snapPointToRuler({ x: 250, y: 200 + offset }, horizontal, 12);
      expect(res.snapped, `offset ${offset} did not snap`).toBe(true);
      const expected = offset <= RULER_BODY_PT / 2 ? 200 : 200 + RULER_BODY_PT;
      expect(res.point.y).toBeCloseTo(expected, 6);
    }
  });

  it('does not snap well clear of the ruler', () => {
    expect(snapPointToRuler({ x: 250, y: 100 }, horizontal, 12).snapped).toBe(false);
    expect(snapPointToRuler({ x: 250, y: 400 }, horizontal, 12).snapped).toBe(false);
  });

  it('does not snap beyond the ends of the ruler', () => {
    expect(snapPointToRuler({ x: 1000, y: 200 }, horizontal, 12).snapped).toBe(false);
  });
});
