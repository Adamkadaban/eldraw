import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { measureBlock } from '$lib/slides/layout';
import { diagramGeometry, type DiagramGeometry } from '$lib/slides/render/diagramGeometry';
import SlideLayer from '$lib/slides/render/SlideLayer.svelte';
import { defaultSlideTheme } from '$lib/slides/theme';
import type { Slide, SlideDiagramBlock } from '$lib/types';

function diagram(overrides: Partial<SlideDiagramBlock> = {}): SlideDiagramBlock {
  return {
    id: 'diagram',
    kind: 'diagram',
    height: 180,
    nodes: [
      { id: 'input', text: '$x$', x: 0.1, y: 0.5, shape: 'plain' },
      { id: 'machine', text: 'Multiply by $2$', x: 0.5, y: 0.5, shape: 'box' },
      { id: 'output', text: '$2x$', x: 0.9, y: 0.5, shape: 'plain' },
    ],
    edges: [
      { from: 'input', to: 'machine' },
      { from: 'machine', to: 'output', label: '$f$' },
    ],
    ...overrides,
  };
}

function geometryNumbers(geometry: DiagramGeometry): number[] {
  return [
    ...geometry.nodes.flatMap((node) => [node.x, node.y, node.w, node.h]),
    ...geometry.edges.flatMap((edge) => [
      edge.from.x,
      edge.from.y,
      edge.to.x,
      edge.to.y,
      edge.labelAt.x,
      edge.labelAt.y,
      ...edge.head.flatMap((point) => [point.x, point.y]),
    ]),
  ];
}

describe('slide diagram geometry', () => {
  it('clamps nodes and keeps their boxes inside the block', () => {
    const geometry = diagramGeometry(
      diagram({
        nodes: [
          { id: 'a', text: 'A', x: -20, y: Number.NaN, w: 0.3, h: 0.2 },
          { id: 'b', text: 'B', x: 20, y: 2, w: 4, h: -1 },
        ],
        edges: [{ from: 'a', to: 'b' }],
      }),
      500,
      200,
      defaultSlideTheme.bodySize,
    );
    for (const node of geometry.nodes) {
      expect(node.x - node.w / 2).toBeGreaterThanOrEqual(0);
      expect(node.x + node.w / 2).toBeLessThanOrEqual(500);
      expect(node.y - node.h / 2).toBeGreaterThanOrEqual(0);
      expect(node.y + node.h / 2).toBeLessThanOrEqual(200);
    }
    expect(geometryNumbers(geometry).every(Number.isFinite)).toBe(true);
  });

  it('skips unknown and self edges and resolves duplicate ids to the first node', () => {
    const geometry = diagramGeometry(
      diagram({
        nodes: [
          { id: 'a', text: 'first', x: 0.2, y: 0.5, w: 0.2, h: 0.2 },
          { id: 'a', text: 'duplicate', x: 0.8, y: 0.2, w: 0.2, h: 0.2 },
          { id: 'b', text: 'target', x: 0.8, y: 0.5, w: 0.2, h: 0.2 },
        ],
        edges: [
          { from: 'a', to: 'b' },
          { from: 'a', to: 'a' },
          { from: 'missing', to: 'b' },
        ],
      }),
      500,
      200,
      defaultSlideTheme.bodySize,
    );
    expect(geometry.edges).toHaveLength(1);
    expect(geometry.edges[0].from.x).toBeCloseTo(150);
    expect(geometry.edges[0].to.x).toBeCloseTo(350);
  });

  it('sizes omitted node dimensions and measures the declared block height', () => {
    const block = diagram();
    const geometry = diagramGeometry(block, 500, 180, defaultSlideTheme.bodySize);
    expect(geometry.nodes.every((node) => node.w > 0 && node.h > 0)).toBe(true);
    expect(measureBlock(block, defaultSlideTheme, 500)).toBe(180);
  });

  it('renders node text and edge labels through inline math', () => {
    const slide: Slide = { layout: 'blank', title: '', blocks: [diagram()] };
    const body = render(SlideLayer, {
      props: { slide, theme: defaultSlideTheme, width: 612, height: 792, ptToPx: 1 },
    }).body;
    expect(body).toMatch(/class="diagram-node\b/);
    expect(body).toMatch(/class="diagram-edge-label\b/);
    expect(body.match(/class="katex"/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it('does not produce NaN for degenerate dimensions', () => {
    const geometry = diagramGeometry(diagram(), -1, Number.NaN, Number.NaN);
    expect(geometryNumbers(geometry).every(Number.isFinite)).toBe(true);
  });
});
