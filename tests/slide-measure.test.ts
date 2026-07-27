import { describe, expect, it } from 'vitest';
import { measureBlock } from '$lib/slides/layout';
import { defaultSlideTheme } from '$lib/slides/theme';
import type { SlideBlock } from '$lib/types';

describe('measureBlock', () => {
  it('increases text height when the available width narrows', () => {
    const block: SlideBlock = {
      id: 'text',
      kind: 'text',
      text: 'A deliberately long explanation of the distributive property and its consequences.',
    };
    expect(measureBlock(block, defaultSlideTheme, 120)).toBeGreaterThan(
      measureBlock(block, defaultSlideTheme, 480),
    );
  });

  it('measures declared graph, image, and spacer heights', () => {
    const graph: SlideBlock = {
      id: 'graph',
      kind: 'graph',
      height: 180,
      graph: {
        xRange: [-10, 10],
        yRange: [-10, 10],
        gridStep: 1,
        showAxes: true,
        showGrid: true,
        functions: [],
      },
    };
    const image: SlideBlock = {
      id: 'image',
      kind: 'image',
      src: 'data:image/png;base64,AA==',
      alt: '',
      height: 90,
    };
    const spacer: SlideBlock = { id: 'space', kind: 'spacer', height: 72 };
    expect(measureBlock(graph, defaultSlideTheme, 300)).toBe(180);
    expect(measureBlock(image, defaultSlideTheme, 300)).toBe(90);
    expect(measureBlock(spacer, defaultSlideTheme, 300)).toBe(72);
  });

  it('measures tables per row and tolerates ragged rows and bad weights', () => {
    const table: SlideBlock = {
      id: 'table',
      kind: 'table',
      header: ['Expression', 'Value', 'Notes'],
      rows: [['x + 1'], ['x squared', '4', 'a longer note that wraps']],
      columnWeights: [1, -1],
    };
    const measured = measureBlock(table, defaultSlideTheme, 240);
    expect(Number.isFinite(measured)).toBe(true);
    expect(measured).toBeGreaterThan(defaultSlideTheme.bodySize * 3);
  });

  it('clamps list indentation levels and handles degenerate widths', () => {
    const list: SlideBlock = {
      id: 'list',
      kind: 'list',
      marker: 'bullet',
      items: [
        { text: 'negative level', level: -100 },
        { text: 'huge level', level: 99 },
        { text: 'non-finite level', level: Number.NaN },
      ],
    };
    for (const width of [0, -20, Number.NaN]) {
      const measured = measureBlock(list, defaultSlideTheme, width);
      expect(Number.isFinite(measured)).toBe(true);
      expect(measured).toBeGreaterThan(0);
    }
  });
});
