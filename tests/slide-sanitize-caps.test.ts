import { describe, expect, it } from 'vitest';
import { sanitizeSlide } from '$lib/slides/deck';

/**
 * Slide data is loaded from untrusted sidecar JSON and every surviving element
 * becomes DOM nodes and layout work, so oversized collections must be trimmed
 * at the trust boundary rather than freezing the app on open.
 */
function slideWith(block: unknown) {
  return sanitizeSlide({ layout: 'content', title: 'T', blocks: [block] });
}

describe('sanitizeSlide collection caps', () => {
  it('caps list items', () => {
    const items = Array.from({ length: 20_000 }, () => ({ text: 'x', level: 0 }));
    const slide = slideWith({ id: 'a', kind: 'list', marker: 'bullet', items });
    const block = slide?.blocks[0];
    expect(block?.kind).toBe('list');
    expect(block?.kind === 'list' && block.items.length).toBeLessThanOrEqual(500);
  });

  it('caps definition items', () => {
    const items = Array.from({ length: 20_000 }, () => ({ term: 't', text: 'd' }));
    const block = slideWith({ id: 'a', kind: 'definitions', items })?.blocks[0];
    expect(block?.kind === 'definitions' && block.items.length).toBeLessThanOrEqual(200);
  });

  it('caps table rows and columns', () => {
    const rows = Array.from({ length: 5_000 }, () => Array.from({ length: 400 }, () => 'cell'));
    const header = Array.from({ length: 400 }, () => 'h');
    const block = slideWith({ id: 'a', kind: 'table', header, rows })?.blocks[0];
    expect(block?.kind).toBe('table');
    if (block?.kind !== 'table') return;
    expect(block.rows.length).toBeLessThanOrEqual(500);
    expect(block.header.length).toBeLessThanOrEqual(100);
    for (const row of block.rows) expect(row.length).toBeLessThanOrEqual(100);
  });

  it('caps graph functions', () => {
    const functions = Array.from({ length: 2_000 }, (_unused, i) => ({
      id: `f${i}`,
      expr: 'x',
      kind: 'explicit',
      color: '#000000',
      width: 2,
      dash: 'solid',
      domain: null,
    }));
    const block = slideWith({
      id: 'a',
      kind: 'graph',
      height: 200,
      graph: {
        xRange: [-10, 10],
        yRange: [-10, 10],
        gridStep: 1,
        showAxes: true,
        showGrid: true,
        functions,
      },
    })?.blocks[0];
    expect(block?.kind === 'graph' && block.graph.functions.length).toBeLessThanOrEqual(50);
  });

  it('caps top-level blocks', () => {
    const blocks = Array.from({ length: 20_000 }, (_unused, i) => ({
      id: `b${i}`,
      kind: 'text',
      text: 'x',
    }));
    const slide = sanitizeSlide({ layout: 'content', title: 'T', blocks });
    expect(slide?.blocks.length).toBeLessThanOrEqual(200);
  });

  it('caps asides', () => {
    const aside = Array.from({ length: 2_000 }, (_unused, i) => ({
      id: `c${i}`,
      kind: 'callout',
      text: 'x',
      tone: 'tip',
    }));
    const slide = sanitizeSlide({ layout: 'content', title: 'T', blocks: [], aside });
    expect((slide?.aside ?? []).length).toBeLessThanOrEqual(10);
  });

  it('completes quickly on a hostile document', () => {
    const start = Date.now();
    sanitizeSlide({
      layout: 'content',
      title: 'T',
      blocks: Array.from({ length: 5_000 }, (_unused, i) => ({
        id: `b${i}`,
        kind: 'list',
        marker: 'bullet',
        items: Array.from({ length: 100 }, () => ({ text: 'x', level: 0 })),
      })),
    });
    expect(Date.now() - start).toBeLessThan(5_000);
  });
});
