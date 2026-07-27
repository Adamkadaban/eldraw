import { describe, expect, it } from 'vitest';
import { sanitizeSlide } from '$lib/slides/deck';

describe('sanitizeSlide trust boundary', () => {
  it.each([null, undefined, 42, [], 'slide', true])('rejects non-object input: %j', (input) => {
    expect(() => sanitizeSlide(input)).not.toThrow();
    expect(sanitizeSlide(input)).toBeNull();
  });

  it('coerces layouts, clamps columns and drops unknown block kinds', () => {
    expect(
      sanitizeSlide({
        layout: 'unknown',
        title: 'Heading',
        columnCount: -5,
        blocks: [{ id: 'bad', kind: 'video' }],
      }),
    ).toEqual({ layout: 'content', title: 'Heading', columnCount: 1, blocks: [] });
    expect(sanitizeSlide({ layout: 'grid', columnCount: 999, blocks: [] })?.columnCount).toBe(6);
  });

  it('generates unique block ids for missing and duplicate ids', () => {
    const slide = sanitizeSlide({
      layout: 'content',
      blocks: [
        { id: 'same', kind: 'text', text: 'One' },
        { id: 'same', kind: 'text', text: 'Two' },
        { kind: 'callout', text: 'Three', tone: 'tip' },
      ],
      aside: [{ id: 'same', kind: 'callout', text: 'Four', tone: 'note' }],
    });
    const ids = [...(slide?.blocks ?? []), ...(slide?.aside ?? [])].map((block) => block.id);
    expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('clamps list levels and normalizes ragged table rows', () => {
    const slide = sanitizeSlide({
      layout: 'content',
      blocks: [
        {
          id: 'list',
          kind: 'list',
          marker: 'bullet',
          items: [
            { text: 'Low', level: -10 },
            { text: 'High', level: 20 },
          ],
        },
        {
          id: 'table',
          kind: 'table',
          header: ['A'],
          rows: [['1', '2', '3'], ['4'], 'not-a-row', [5, null]],
        },
      ],
    });
    expect(slide?.blocks[0]).toMatchObject({
      items: [
        { text: 'Low', level: 0 },
        { text: 'High', level: 3 },
      ],
    });
    expect(slide?.blocks[1]).toMatchObject({
      header: ['A', '', ''],
      rows: [
        ['1', '2', '3'],
        ['4', '', ''],
        ['', '', ''],
      ],
    });
  });

  it('drops unsafe colors everywhere they can reach CSS', () => {
    const slide = sanitizeSlide({
      layout: 'content',
      theme: {
        background: 'red; background:url(x)',
        accent: '#123456',
        titleColor: '#abcdef',
        fontFamily: 'Inter; background:url(x)',
      },
      blocks: [
        {
          id: 'text',
          kind: 'text',
          text: 'Unsafe',
          color: 'red; background:url(x)',
        },
        {
          id: 'math',
          kind: 'math',
          latex: 'x',
          display: true,
          color: '#ABCDEF',
        },
        {
          id: 'graph',
          kind: 'graph',
          height: 200,
          graph: {
            functions: [
              {
                id: 'fn',
                expr: 'x',
                kind: 'explicit',
                color: 'red; background:url(x)',
                width: 2,
                dash: 'solid',
                domain: null,
              },
            ],
          },
        },
      ],
    });
    expect(slide?.theme).toEqual({ accent: '#123456', titleColor: '#abcdef' });
    expect(slide?.blocks[0]).not.toHaveProperty('color');
    expect(slide?.blocks[1]).toHaveProperty('color', '#ABCDEF');
    expect(slide?.blocks[2]).toMatchObject({
      graph: { functions: [{ color: '#2563eb' }] },
    });
  });

  it.each([
    'javascript:alert(1)',
    'https://example.com/image.png',
    'data:text/html,<script>alert(1)</script>',
  ])('rejects unsafe image source %s', (src) => {
    const slide = sanitizeSlide({
      layout: 'content',
      blocks: [{ id: 'image', kind: 'image', src, alt: '', height: 200 }],
    });
    expect(slide?.blocks).toEqual([]);
  });

  it('accepts supported base64 image data URLs', () => {
    const slide = sanitizeSlide({
      layout: 'content',
      blocks: [
        {
          id: 'image',
          kind: 'image',
          src: 'data:image/webp;base64,AAAA',
          alt: 'Description',
          height: 200,
        },
      ],
    });
    expect(slide?.blocks).toHaveLength(1);
  });

  it('replaces NaN and Infinity and clamps finite numeric fields', () => {
    const slide = sanitizeSlide({
      layout: 'content',
      theme: { bodySize: Infinity },
      blocks: [
        { id: 'text', kind: 'text', text: 'Text', fontSize: NaN, marginTop: Infinity },
        { id: 'space', kind: 'spacer', height: Infinity },
        {
          id: 'graph',
          kind: 'graph',
          height: -10,
          graph: {
            xRange: [NaN, Infinity],
            yRange: [-5, 5],
            gridStep: Infinity,
            functions: [
              {
                id: 'fn',
                expr: 'x',
                color: '#123456',
                width: Infinity,
                domain: null,
              },
            ],
          },
        },
      ],
    });
    expect(slide?.theme).toBeUndefined();
    expect(slide?.blocks[0]).not.toHaveProperty('fontSize');
    expect(slide?.blocks[0]).not.toHaveProperty('marginTop');
    expect(slide?.blocks[1]).toHaveProperty('height', 120);
    expect(slide?.blocks[2]).toMatchObject({
      height: 1,
      graph: {
        xRange: [-10, 10],
        yRange: [-5, 5],
        gridStep: 1,
        functions: [{ width: 2 }],
      },
    });
  });

  it('never throws across malformed nested values', () => {
    const hostile: unknown[] = [
      { blocks: null },
      { blocks: [null, [], 1, 'x'] },
      { blocks: [{ kind: 'table', header: null, rows: [null, {}] }] },
      { blocks: [{ kind: 'graph', graph: { functions: [null, 4, []] } }] },
      Object.create(null),
    ];
    for (const input of hostile) expect(() => sanitizeSlide(input)).not.toThrow();
  });
});
