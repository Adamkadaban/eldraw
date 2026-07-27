import { describe, expect, it } from 'vitest';
import { CURVE_PALETTE, nextCurveColor } from '$lib/graph/curvePalette';
import { createGraphFunction, createGraphObject } from '$lib/graph/graphObject';

describe('curve palette', () => {
  it('is all strict hex colors', () => {
    for (const color of CURVE_PALETTE) expect(color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('has no duplicate entries', () => {
    expect(new Set(CURVE_PALETTE).size).toBe(CURVE_PALETTE.length);
  });
});

describe('nextCurveColor', () => {
  it('starts at the first palette entry', () => {
    expect(nextCurveColor([])).toBe(CURVE_PALETTE[0]);
  });

  it('skips colors already in use', () => {
    expect(nextCurveColor([CURVE_PALETTE[0]])).toBe(CURVE_PALETTE[1]);
    expect(nextCurveColor([CURVE_PALETTE[0], CURVE_PALETTE[1]])).toBe(CURVE_PALETTE[2]);
  });

  it('fills a gap left by a deleted curve', () => {
    const existing = [CURVE_PALETTE[0], CURVE_PALETTE[2]];
    expect(nextCurveColor(existing)).toBe(CURVE_PALETTE[1]);
  });

  it('ignores case when matching used colors', () => {
    expect(nextCurveColor([CURVE_PALETTE[0].toUpperCase()])).toBe(CURVE_PALETTE[1]);
  });

  it('cycles once every palette entry is taken', () => {
    const all = [...CURVE_PALETTE];
    expect(CURVE_PALETTE).toContain(nextCurveColor(all));
  });

  it('never returns an empty or invalid color', () => {
    for (let i = 0; i <= CURVE_PALETTE.length + 3; i += 1) {
      const used = CURVE_PALETTE.slice(0, i);
      expect(nextCurveColor(used)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('graph defaults use the palette', () => {
  it('gives a new graph the first palette color', () => {
    const graph = createGraphObject({ x: 0, y: 0, w: 100, h: 100 });
    expect(graph.functions[0].color).toBe(CURVE_PALETTE[0]);
  });

  it('gives each added curve a distinct color', () => {
    const graph = createGraphObject({ x: 0, y: 0, w: 100, h: 100 });
    const functions = [...graph.functions];
    for (let i = 0; i < 4; i += 1) functions.push(createGraphFunction(functions));
    const colors = functions.map((fn) => fn.color);
    expect(new Set(colors).size).toBe(colors.length);
  });
});
