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

  it('bounds mapping elements and drops every invalid pair index', () => {
    const input = {
      layout: 'content',
      blocks: [
        {
          id: 'mapping',
          kind: 'mapping',
          leftLabel: 'Domain',
          rightLabel: 'Range',
          left: Array.from({ length: 100_000 }, (_, index) => index),
          right: Array.from({ length: 100_000 }, (_, index) => `R${index}`),
          pairs: [
            { from: 0, to: 0 },
            { from: 99, to: 99 },
            { from: -1, to: 0 },
            { from: 100, to: 0 },
            { from: 0, to: 100 },
            { from: 0.5, to: 0 },
            { from: 0, to: 1.5 },
            { from: '0', to: 0 },
            { from: NaN, to: 0 },
            { from: 0, to: NaN },
            { from: Infinity, to: 0 },
            null,
          ],
          height: Infinity,
        },
      ],
    };
    expect(() => sanitizeSlide(input)).not.toThrow();
    const slide = sanitizeSlide(input);
    expect(slide?.blocks[0]).toMatchObject({
      kind: 'mapping',
      leftLabel: 'Domain',
      rightLabel: 'Range',
      pairs: [
        { from: 0, to: 0 },
        { from: 99, to: 99 },
      ],
      height: 260,
    });
    if (slide?.blocks[0]?.kind !== 'mapping') throw new Error('Expected mapping block');
    expect(slide.blocks[0].left).toHaveLength(100);
    expect(slide.blocks[0].right).toHaveLength(100);
    expect(slide.blocks[0].left.every((value) => typeof value === 'string')).toBe(true);
  });

  it('sanitizes diagram nodes, edges, coordinates, ids, and oversized arrays', () => {
    const input = {
      layout: 'content',
      blocks: [
        {
          id: 'diagram',
          kind: 'diagram',
          nodes: [
            { id: 'a', text: 1, x: -4, y: 3, w: 0, h: Infinity, shape: 'box' },
            { id: 'a', text: 'Duplicate', x: 0.4, y: 0.5, shape: 'plain' },
            { id: 'b', text: 'B', x: NaN, y: Infinity, shape: 'circle' },
            { id: '', text: 'Generated', x: 0.2, y: 0.3 },
            ...Array.from({ length: 196 }, (_, index) => ({
              id: `extra-${index}`,
              text: 'Extra',
              x: 0.5,
              y: 0.5,
            })),
          ],
          edges: [
            { from: 'a', to: 'a' },
            { from: 'a', to: 'missing' },
            { from: 'missing', to: 'b' },
            null,
            ...Array.from({ length: 600 }, () => ({ from: 'a', to: 'b' })),
          ],
          height: Infinity,
        },
      ],
    };
    expect(() => sanitizeSlide(input)).not.toThrow();
    const slide = sanitizeSlide(input);
    if (slide?.blocks[0]?.kind !== 'diagram') throw new Error('Expected diagram block');
    const diagram = slide.blocks[0];
    expect(diagram.nodes).toHaveLength(100);
    expect(new Set(diagram.nodes.map((node) => node.id)).size).toBe(100);
    expect(diagram.nodes[0]).toMatchObject({ id: 'a', text: '', x: 0, y: 1, w: 0.01 });
    expect(diagram.nodes[0]).not.toHaveProperty('h');
    expect(diagram.nodes[2]).toMatchObject({ id: 'b', x: 0.5, y: 0.5 });
    expect(diagram.nodes[2]).not.toHaveProperty('shape');
    expect(diagram.edges).toHaveLength(496);
    expect(diagram.edges.every((edge) => edge.from === 'a' && edge.to === 'b')).toBe(true);
    expect(diagram.height).toBe(260);
  });

  it('repairs number lines and bounds tick and mark counts', () => {
    const input = {
      layout: 'content',
      blocks: [
        {
          id: 'numberline',
          kind: 'numberline',
          min: 10,
          max: -10,
          tickStep: 0,
          labelStep: NaN,
          height: Infinity,
          marks: [
            { value: -999, kind: 'open' },
            { value: 999, kind: 'closed' },
            { value: 0, kind: 'invalid' },
            { value: NaN, kind: 'open' },
            ...Array.from({ length: 250 }, () => ({ value: 1, kind: 'arrow-right' })),
          ],
        },
        {
          id: 'tiny-step',
          kind: 'numberline',
          min: 0,
          max: 1_000_000,
          tickStep: 1e-12,
          labelStep: -4,
          marks: [],
          height: 100,
        },
      ],
    };
    expect(() => sanitizeSlide(input)).not.toThrow();
    const slide = sanitizeSlide(input);
    if (slide?.blocks[0]?.kind !== 'numberline') throw new Error('Expected number-line block');
    expect(slide.blocks[0]).toMatchObject({
      min: -10,
      max: 10,
      tickStep: 0.02,
      labelStep: 5,
      height: 160,
    });
    expect(slide.blocks[0].marks).toHaveLength(198);
    expect(slide.blocks[0].marks.slice(0, 2)).toEqual([
      { value: -10, kind: 'open' },
      { value: 10, kind: 'closed' },
    ]);
    if (slide?.blocks[1]?.kind !== 'numberline') throw new Error('Expected number-line block');
    expect(slide.blocks[1].tickStep).toBe(1_000);
    expect(slide.blocks[1].labelStep).toBe(1_000);
  });

  it('restricts list markers and table header orientation', () => {
    const slide = sanitizeSlide({
      layout: 'content',
      blocks: [
        {
          id: 'list',
          kind: 'list',
          marker: 'invalid',
          markerByLevel: ['decimal', 'invalid', 'roman', 'alpha', 'none'],
          items: [],
        },
        {
          id: 'table',
          kind: 'table',
          header: ['A'],
          rows: [['B']],
          headerOrientation: 'diagonal',
        },
      ],
    });
    expect(slide?.blocks[0]).toMatchObject({
      marker: 'bullet',
      markerByLevel: ['decimal', 'bullet', 'roman', 'alpha'],
    });
    expect(slide?.blocks[1]).toMatchObject({ headerOrientation: 'row' });
  });

  it('never throws across malformed nested values', () => {
    const hostile: unknown[] = [
      { blocks: null },
      { blocks: [null, [], 1, 'x'] },
      { blocks: [{ kind: 'table', header: null, rows: [null, {}] }] },
      { blocks: [{ kind: 'graph', graph: { functions: [null, 4, []] } }] },
      { blocks: [{ kind: 'diagram', nodes: [null, 4, []], edges: [null, {}] }] },
      { blocks: [{ kind: 'numberline', marks: [null, {}, []] }] },
      Object.create(null),
    ];
    for (const input of hostile) expect(() => sanitizeSlide(input)).not.toThrow();
  });
});
