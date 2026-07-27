import { describe, expect, it } from 'vitest';
import { measureBlock } from '$lib/slides/layout';
import {
  MAX_NUMBER_LINE_LABELS,
  MAX_NUMBER_LINE_TICKS,
  slideNumberLineGeometry,
} from '$lib/slides/render/numberLineGeometry';
import { defaultSlideTheme } from '$lib/slides/theme';
import type { SlideNumberLineBlock } from '$lib/types';

function numberLine(overrides: Partial<SlideNumberLineBlock> = {}): SlideNumberLineBlock {
  return {
    id: 'number-line',
    kind: 'numberline',
    min: 0,
    max: 10,
    tickStep: 2,
    labelStep: 5,
    marks: [
      { value: 2, kind: 'open' },
      { value: 4, kind: 'closed' },
      { value: 6, kind: 'arrow-left' },
      { value: 8, kind: 'arrow-right' },
    ],
    height: 120,
    ...overrides,
  };
}

describe('slide number-line geometry', () => {
  it('places ticks, labels, and every mark kind with shared value-to-x geometry', () => {
    const geometry = slideNumberLineGeometry(numberLine(), 600, 120, defaultSlideTheme);
    expect(geometry.valid).toBe(true);
    expect(geometry.ticks.map((tick) => tick.value)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(geometry.labels.map((label) => label.value)).toEqual([0, 5, 10]);
    expect(geometry.marks.map((mark) => mark.kind)).toEqual([
      'open',
      'closed',
      'arrow-left',
      'arrow-right',
    ]);
    expect(geometry.labels[1].x).toBeCloseTo((geometry.x0 + geometry.x1) / 2);
    expect(geometry.marks[0].x).toBeCloseTo(geometry.x0 + (geometry.x1 - geometry.x0) * 0.2);
  });

  it('guards invalid ranges and non-positive steps', () => {
    for (const block of [numberLine({ min: 5, max: 5 }), numberLine({ min: 10, max: 5 })]) {
      const geometry = slideNumberLineGeometry(block, 600, 120, defaultSlideTheme);
      expect(geometry.valid).toBe(false);
      expect(geometry.ticks).toEqual([]);
      expect(geometry.labels).toEqual([]);
      expect(geometry.marks).toEqual([]);
    }
    const noSteps = slideNumberLineGeometry(
      numberLine({ tickStep: 0, labelStep: -1 }),
      600,
      120,
      defaultSlideTheme,
    );
    expect(noSteps.valid).toBe(true);
    expect(noSteps.ticks).toEqual([]);
    expect(noSteps.labels).toEqual([]);
  });

  it('caps tiny steps and skips marks outside the range', () => {
    const geometry = slideNumberLineGeometry(
      numberLine({
        tickStep: 0.000001,
        labelStep: 0.000001,
        marks: [
          { value: -1, kind: 'open' },
          { value: 11, kind: 'closed' },
          { value: 5, kind: 'closed' },
        ],
      }),
      600,
      120,
      defaultSlideTheme,
    );
    expect(geometry.ticks.length).toBeLessThanOrEqual(MAX_NUMBER_LINE_TICKS);
    expect(geometry.labels.length).toBeLessThanOrEqual(MAX_NUMBER_LINE_LABELS);
    expect(geometry.marks).toHaveLength(1);
    expect(geometry.marks[0].value).toBe(5);
  });

  it('uses declared height and produces finite degenerate coordinates', () => {
    const block = numberLine();
    expect(measureBlock(block, defaultSlideTheme, 500)).toBe(120);
    const geometry = slideNumberLineGeometry(block, -1, Number.NaN, {
      ...defaultSlideTheme,
      bodySize: Number.NaN,
    });
    expect(
      [
        geometry.x0,
        geometry.x1,
        geometry.y,
        geometry.arrowSize,
        ...geometry.ticks.flatMap((tick) => [tick.value, tick.x]),
      ].every(Number.isFinite),
    ).toBe(true);
  });
});
