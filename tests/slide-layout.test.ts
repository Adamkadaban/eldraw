import { describe, expect, it } from 'vitest';
import { layoutSlide, type LayoutBox, type SlideLayout } from '$lib/slides/layout';
import { defaultSlideTheme } from '$lib/slides/theme';
import type { Slide, SlideBlock, SlideLayoutKind } from '$lib/types';

function textBlock(id: string, text = 'A short teaching point'): SlideBlock {
  return { id, kind: 'text', text };
}

function slide(layout: SlideLayoutKind, blocks: SlideBlock[], columnCount?: number): Slide {
  return {
    layout,
    title: 'Linear functions',
    subtitle: 'Slope and intercept',
    blocks,
    columnCount,
  };
}

function overlaps(a: LayoutBox, b: LayoutBox): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function expectFinite(layout: SlideLayout): void {
  for (const box of [
    ...(layout.title ? [layout.title.box] : []),
    ...(layout.subtitle ? [layout.subtitle.box] : []),
    ...layout.blocks.map((placed) => placed.box),
    ...layout.asides.map((placed) => placed.box),
  ]) {
    for (const value of [box.x, box.y, box.w, box.h]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  }
}

function expectPairwiseNonOverlapping(boxes: LayoutBox[]): void {
  for (let first = 0; first < boxes.length; first += 1) {
    for (let second = first + 1; second < boxes.length; second += 1) {
      expect(overlaps(boxes[first], boxes[second])).toBe(false);
    }
  }
}

describe.each<SlideLayoutKind>(['title', 'content', 'columns', 'grid', 'blank'])(
  '%s slide layout',
  (kind) => {
    it('places ordinary blocks in finite boxes within page margins', () => {
      const result = layoutSlide(
        slide(kind, [textBlock('a'), textBlock('b'), textBlock('c')], 2),
        defaultSlideTheme,
        960,
        540,
      );
      expectFinite(result);
      expect(result.overflow).toBe(false);
      for (const { box } of result.blocks) {
        expect(box.x).toBeGreaterThanOrEqual(960 * 0.06);
        expect(box.x + box.w).toBeLessThanOrEqual(960 * 0.94);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.h).toBeLessThanOrEqual(540);
      }
      if (kind !== 'columns') {
        expectPairwiseNonOverlapping(result.blocks.map((placed) => placed.box));
      }
    });
  },
);

describe('columns layout', () => {
  it('splits evenly and balances equal-height blocks', () => {
    const result = layoutSlide(
      slide('columns', [textBlock('a'), textBlock('b'), textBlock('c'), textBlock('d')], 2),
      defaultSlideTheme,
      960,
      540,
    );
    const left = result.blocks.filter((placed) => placed.box.x === result.blocks[0].box.x);
    const right = result.blocks.filter((placed) => placed.box.x !== result.blocks[0].box.x);
    expect(left).toHaveLength(2);
    expect(right).toHaveLength(2);
    expect(left[0].box.w).toBeCloseTo(right[0].box.w);
    const leftBottom = Math.max(...left.map(({ box }) => box.y + box.h));
    const rightBottom = Math.max(...right.map(({ box }) => box.y + box.h));
    expect(leftBottom).toBeCloseTo(rightBottom);
    expectPairwiseNonOverlapping(result.blocks.map((placed) => placed.box));
  });
});

describe('grid layout', () => {
  it('tiles equal padded cells without overlap', () => {
    const result = layoutSlide(
      slide(
        'grid',
        Array.from({ length: 6 }, (_, index) => textBlock(String(index))),
        3,
      ),
      defaultSlideTheme,
      960,
      540,
    );
    expectPairwiseNonOverlapping(result.blocks.map((placed) => placed.box));
    const widths = new Set(result.blocks.map(({ box }) => box.w.toFixed(6)));
    const heights = new Set(result.blocks.map(({ box }) => box.h.toFixed(6)));
    expect(widths.size).toBe(1);
    expect(heights.size).toBe(1);
    expect(new Set(result.blocks.map(({ box }) => box.x.toFixed(6))).size).toBe(3);
    expect(new Set(result.blocks.map(({ box }) => box.y.toFixed(6))).size).toBe(2);
  });
});

describe('slide layout boundaries', () => {
  it('flags content that exceeds the available height', () => {
    const result = layoutSlide(
      slide(
        'content',
        Array.from({ length: 20 }, (_, index) =>
          textBlock(`long-${index}`, 'This is a long line '.repeat(12)),
        ),
      ),
      defaultSlideTheme,
      612,
      792,
    );
    expect(result.overflow).toBe(true);
  });

  it('scales horizontal margins with page width', () => {
    const portrait = layoutSlide(
      slide('blank', [textBlock('portrait')]),
      defaultSlideTheme,
      612,
      792,
    );
    const landscape = layoutSlide(
      slide('blank', [textBlock('landscape')]),
      defaultSlideTheme,
      960,
      540,
    );
    expect(portrait.blocks[0].box.x / 612).toBeCloseTo(landscape.blocks[0].box.x / 960);
    expect(portrait.blocks[0].box.x / 612).toBeCloseTo(0.065);
  });

  it.each([0, 99])('clamps columnCount %s safely', (columnCount) => {
    const result = layoutSlide(
      slide('columns', [textBlock('a'), textBlock('b')], columnCount),
      defaultSlideTheme,
      612,
      792,
    );
    expectFinite(result);
    expect(result.blocks).toHaveLength(2);
    const xPositions = new Set(result.blocks.map(({ box }) => box.x));
    expect(xPositions.size).toBe(columnCount === 0 ? 1 : 2);
  });

  it('handles empty slides and negative dimensions without NaN', () => {
    for (const kind of ['title', 'content', 'columns', 'grid', 'blank'] as const) {
      const empty = layoutSlide(slide(kind, [], 0), defaultSlideTheme, -612, -792);
      expectFinite(empty);
      expect(empty.blocks).toEqual([]);
    }
  });

  it('handles ragged tables and invalid weights without throwing', () => {
    const table: SlideBlock = {
      id: 'table',
      kind: 'table',
      header: ['A', 'B', 'C'],
      rows: [['one'], ['two', 'three']],
      columnWeights: [1, 0],
    };
    const result = layoutSlide(slide('content', [table]), defaultSlideTheme, 612, 792);
    expectFinite(result);
    expect(result.blocks[0].box.h).toBeGreaterThan(0);
  });
});
