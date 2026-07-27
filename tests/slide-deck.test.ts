import { describe, expect, it } from 'vitest';
import {
  addBlock,
  createBlock,
  createSlide,
  moveBlock,
  removeBlock,
  setLayout,
  updateBlock,
} from '$lib/slides/deck';
import { SLIDE_PAGE_SIZE, slidePage } from '$lib/slides/pageOps';
import type { Slide } from '$lib/types';

function freezeDeep<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeDeep(child);
  }
  return value;
}

function sampleSlide(): Slide {
  const list = createBlock('list');
  list.items = [{ text: 'Nested', level: 1 }];
  return {
    ...createSlide('content', 'Original'),
    subtitle: 'Subtitle',
    blocks: [createBlock('text'), list],
    aside: [{ ...createBlock('callout'), text: 'Aside' }],
    theme: { accent: '#112233' },
  };
}

function expectInputUnchanged(before: Slide, after: Slide): void {
  expect(before.title).toBe('Original');
  expect(before.blocks).toHaveLength(2);
  expect(before.blocks[1]).toMatchObject({
    kind: 'list',
    items: [{ text: 'Nested', level: 1 }],
  });
  expect(after).not.toBe(before);
}

describe('slide deck operations', () => {
  it('creates sensible defaults for every block kind', () => {
    const kinds = [
      'text',
      'list',
      'definitions',
      'table',
      'math',
      'graph',
      'callout',
      'image',
      'mapping',
      'spacer',
    ] as const;
    const blocks = kinds.map(createBlock);
    expect(blocks.map((block) => block.kind)).toEqual(kinds);
    expect(new Set(blocks.map((block) => block.id)).size).toBe(kinds.length);
  });

  it('creates a mapping block with valid starter arrows', () => {
    const mapping = createBlock('mapping');
    expect(mapping).toMatchObject({
      leftLabel: 'Domain',
      rightLabel: 'Range',
      left: ['Input 1', 'Input 2'],
      right: ['Output 1', 'Output 2'],
      pairs: [
        { from: 0, to: 0 },
        { from: 1, to: 1 },
      ],
      height: 260,
    });
  });

  describe('slide pages', () => {
    it('exposes standard widescreen and letter dimensions', () => {
      expect(SLIDE_PAGE_SIZE).toEqual({
        widescreen: { width: 960, height: 540 },
        letter: { width: 612, height: 792 },
      });
    });

    it('creates a slide page with independently cloned slide data', () => {
      const slide = freezeDeep(sampleSlide());
      const page = slidePage(3, slide, 960, 540, 1);
      expect(page).toMatchObject({
        pageIndex: 3,
        type: 'slide',
        insertedAfterPdfPage: 1,
        width: 960,
        height: 540,
        objects: [],
      });
      expect(page.slide).toEqual(slide);
      expect(page.slide).not.toBe(slide);
      expect(page.slide?.blocks).not.toBe(slide.blocks);
    });
  });

  it('adds a cloned block without mutating or sharing with the input', () => {
    const slide = freezeDeep(sampleSlide());
    const added = createBlock('definitions');
    const next = addBlock(slide, added, 1);
    expectInputUnchanged(slide, next);
    expect(next.blocks[1]).toEqual(added);
    expect(next.blocks[1]).not.toBe(added);
    expect(next.blocks[0]).not.toBe(slide.blocks[0]);
    expect(next.aside).not.toBe(slide.aside);
  });

  it('clamps add indices and appends by default', () => {
    const slide = freezeDeep(sampleSlide());
    const first = addBlock(slide, createBlock('spacer'), -99);
    const last = addBlock(slide, createBlock('math'), 999);
    const appended = addBlock(slide, createBlock('table'));
    expect(first.blocks[0].kind).toBe('spacer');
    expect(last.blocks.at(-1)?.kind).toBe('math');
    expect(appended.blocks.at(-1)?.kind).toBe('table');
    expectInputUnchanged(slide, first);
  });

  it('updates a block immutably and preserves its id', () => {
    const slide = freezeDeep(sampleSlide());
    const target = slide.blocks[0];
    const next = updateBlock(slide, target.id, { text: 'Changed', bold: true });
    expectInputUnchanged(slide, next);
    expect(next.blocks[0]).toMatchObject({ id: target.id, text: 'Changed', bold: true });
    expect(next.blocks[1]).not.toBe(slide.blocks[1]);
  });

  it('updates mapping data without sharing nested arrays or pairs', () => {
    const mapping = createBlock('mapping');
    const slide = freezeDeep({ ...createSlide('content'), blocks: [mapping] });
    const next = updateBlock(slide, mapping.id, {
      left: ['Changed', ...mapping.left.slice(1)],
      pairs: [{ from: 0, to: 1 }],
    });
    expect(slide.blocks[0]).toEqual(mapping);
    expect(next.blocks[0]).toMatchObject({
      kind: 'mapping',
      left: ['Changed', 'Input 2'],
      pairs: [{ from: 0, to: 1 }],
    });
    if (next.blocks[0].kind !== 'mapping') throw new Error('Expected mapping block');
    expect(next.blocks[0].left).not.toBe(mapping.left);
    expect(next.blocks[0].pairs).not.toBe(mapping.pairs);
  });

  it('returns an independent clone when updating a missing id', () => {
    const slide = freezeDeep(sampleSlide());
    const next = updateBlock(slide, 'missing', { text: 'Nope' });
    expect(next).toEqual(slide);
    expect(next.blocks).not.toBe(slide.blocks);
  });

  it('removes a block without mutating the input', () => {
    const slide = freezeDeep(sampleSlide());
    const next = removeBlock(slide, slide.blocks[0].id);
    expectInputUnchanged(slide, next);
    expect(next.blocks).toHaveLength(1);
    expect(next.blocks[0]).not.toBe(slide.blocks[1]);
  });

  it('moves blocks and clamps the destination', () => {
    const slide = freezeDeep({
      ...sampleSlide(),
      blocks: [createBlock('text'), createBlock('list'), createBlock('math')],
    });
    const firstId = slide.blocks[0].id;
    const next = moveBlock(slide, 0, 99);
    expect(next.blocks.map((block) => block.id)).toEqual([
      slide.blocks[1].id,
      slide.blocks[2].id,
      firstId,
    ]);
    expect(slide.blocks[0].id).toBe(firstId);
  });

  it('handles out-of-range move sources as immutable no-ops', () => {
    const slide = freezeDeep(sampleSlide());
    for (const from of [-1, 99, 0.5]) {
      const next = moveBlock(slide, from, 1);
      expect(next).toEqual(slide);
      expect(next).not.toBe(slide);
      expect(next.blocks).not.toBe(slide.blocks);
    }
  });

  it('changes layout while preserving independently cloned blocks', () => {
    const slide = freezeDeep(sampleSlide());
    const next = setLayout(slide, 'columns');
    expect(next.layout).toBe('columns');
    expect(next.blocks).toEqual(slide.blocks);
    expect(next.blocks).not.toBe(slide.blocks);
    expect(next.blocks[1]).not.toBe(slide.blocks[1]);
    expectInputUnchanged(slide, next);
  });
});
