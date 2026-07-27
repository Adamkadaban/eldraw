import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import SlideLayer from '$lib/slides/render/SlideLayer.svelte';
import { defaultSlideTheme } from '$lib/slides/theme';
import type { Slide } from '$lib/types';

describe('slide inline math rendering', () => {
  it('renders math safely in title, subtitle, captions, and definition terms', () => {
    const slide: Slide = {
      layout: 'title',
      title: 'Difference of Squares $a^2-b^2$ <script>',
      subtitle: 'Factor as $(a+b)(a-b)$',
      blocks: [
        {
          id: 'definitions',
          kind: 'definitions',
          items: [{ term: '$f(x)$', text: 'A function' }],
        },
        {
          id: 'table',
          kind: 'table',
          caption: 'Values of $f(x)$',
          header: ['x', 'f(x)'],
          rows: [['1', '2']],
        },
        {
          id: 'graph',
          kind: 'graph',
          caption: 'Graph of $y=x^2$',
          height: 80,
          graph: {
            xRange: [-2, 2],
            yRange: [0, 4],
            gridStep: 1,
            showAxes: true,
            showGrid: true,
            functions: [],
          },
        },
        {
          id: 'mapping',
          kind: 'mapping',
          caption: 'Relation $x \\mapsto x^2$',
          leftLabel: 'Domain',
          rightLabel: 'Range',
          left: ['1'],
          right: ['1'],
          pairs: [{ from: 0, to: 0 }],
          height: 100,
        },
      ],
    };
    const { body } = render(SlideLayer, {
      props: {
        slide,
        theme: defaultSlideTheme,
        width: 960,
        height: 540,
        ptToPx: 1,
      },
    });

    expect(body).toMatch(/class="slide-title\b/);
    expect(body).toMatch(/class="slide-subtitle\b/);
    expect(body).toMatch(/class="mapping-caption\b/);
    expect(body).toMatch(/<strong>[\s\S]*?class="katex"/);
    expect(body.match(/class="katex"/g)?.length).toBeGreaterThanOrEqual(6);
    expect(body).toContain('&lt;script&gt;');
    expect(body).not.toContain('<script>');
  });
});
