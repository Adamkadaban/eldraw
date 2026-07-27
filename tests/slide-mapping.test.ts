import { describe, expect, it } from 'vitest';
import { layoutSlide, measureBlock } from '$lib/slides/layout';
import {
  mappingGeometry,
  MAX_MAPPING_ITEMS,
  type MappingGeometry,
} from '$lib/slides/render/mappingGeometry';
import { defaultSlideTheme } from '$lib/slides/theme';
import type { Slide, SlideMappingBlock } from '$lib/types';

function mapping(overrides: Partial<SlideMappingBlock> = {}): SlideMappingBlock {
  return {
    id: 'mapping',
    kind: 'mapping',
    leftLabel: 'Domain',
    rightLabel: 'Range',
    left: ['1', '2', '3'],
    right: ['4', '5'],
    pairs: [
      { from: 0, to: 1 },
      { from: 2, to: 0 },
    ],
    height: 220,
    ...overrides,
  };
}

function geometryNumbers(geometry: MappingGeometry): number[] {
  return [
    geometry.leftOval.cx,
    geometry.leftOval.cy,
    geometry.leftOval.rx,
    geometry.leftOval.ry,
    geometry.rightOval.cx,
    geometry.rightOval.cy,
    geometry.rightOval.rx,
    geometry.rightOval.ry,
    ...geometry.leftItems.flatMap((item) => [item.x, item.y]),
    ...geometry.rightItems.flatMap((item) => [item.x, item.y]),
    ...geometry.arrows.flatMap((arrow) => [
      arrow.from.x,
      arrow.from.y,
      arrow.to.x,
      arrow.to.y,
      ...arrow.head.flatMap((point) => [point.x, point.y]),
    ]),
  ];
}

describe('mapping layout', () => {
  it('uses the declared height and full content width', () => {
    const block = mapping();
    const slide: Slide = { layout: 'blank', title: '', blocks: [block] };
    const result = layoutSlide(slide, defaultSlideTheme, 960, 540);
    expect(measureBlock(block, defaultSlideTheme, 400)).toBe(220);
    expect(result.blocks[0].box.h).toBe(220);
    expect(result.blocks[0].box.w).toBeCloseTo(960 * (1 - 0.065 * 2));
  });

  it('keeps both differently-sized ovals inside the block box', () => {
    const width = 600;
    const height = 240;
    const geometry = mappingGeometry(mapping(), width, height, defaultSlideTheme.bodySize);
    for (const oval of [geometry.leftOval, geometry.rightOval]) {
      expect(oval.cx - oval.rx).toBeGreaterThanOrEqual(0);
      expect(oval.cx + oval.rx).toBeLessThanOrEqual(width);
      expect(oval.cy - oval.ry).toBeGreaterThanOrEqual(0);
      expect(oval.cy + oval.ry).toBeLessThanOrEqual(height);
    }
    expect(geometry.leftOval.ry).toBeGreaterThan(geometry.rightOval.ry);
    expect(geometry.rightOval.cx - geometry.rightOval.rx).toBeGreaterThan(
      geometry.leftOval.cx + geometry.leftOval.rx,
    );
  });

  it('draws arrows only for valid integer pairs', () => {
    const geometry = mappingGeometry(
      mapping({
        pairs: [
          { from: 0, to: 0 },
          { from: -1, to: 0 },
          { from: 0, to: -1 },
          { from: 3, to: 0 },
          { from: 0, to: 2 },
          { from: 0.5, to: 1 },
        ],
      }),
      600,
      240,
      defaultSlideTheme.bodySize,
    );
    expect(geometry.arrows).toHaveLength(1);
    expect(geometry.arrows[0].from.y).toBe(geometry.leftItems[0].y);
    expect(geometry.arrows[0].to.y).toBe(geometry.rightItems[0].y);
  });

  it('handles empty and huge sets without NaN', () => {
    const empty = mappingGeometry(
      mapping({ left: [], right: [], pairs: [{ from: 0, to: 0 }] }),
      600,
      240,
      defaultSlideTheme.bodySize,
    );
    expect(empty.leftItems).toEqual([]);
    expect(empty.rightItems).toEqual([]);
    expect(empty.arrows).toEqual([]);

    const huge = mappingGeometry(
      mapping({
        left: Array.from({ length: 500 }, (_, index) => String(index)),
        right: Array.from({ length: 500 }, (_, index) => String(index)),
        pairs: [
          { from: MAX_MAPPING_ITEMS - 1, to: MAX_MAPPING_ITEMS - 1 },
          { from: MAX_MAPPING_ITEMS, to: MAX_MAPPING_ITEMS },
        ],
      }),
      600,
      240,
      defaultSlideTheme.bodySize,
    );
    expect(huge.leftItems.length).toBeLessThanOrEqual(MAX_MAPPING_ITEMS);
    expect(huge.rightItems.length).toBeLessThanOrEqual(MAX_MAPPING_ITEMS);
    expect(huge.leftItems.length).toBeLessThan(500);
    expect(huge.arrows).toEqual([]);

    const degenerate = mappingGeometry(mapping(), -600, Number.NaN, Number.NaN);
    for (const geometry of [empty, huge, degenerate]) {
      expect(geometryNumbers(geometry).every(Number.isFinite)).toBe(true);
    }
  });
});
