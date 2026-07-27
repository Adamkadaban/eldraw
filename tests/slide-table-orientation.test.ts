import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import SlideLayer from '$lib/slides/render/SlideLayer.svelte';
import { defaultSlideTheme } from '$lib/slides/theme';
import type { Slide, SlideTableBlock } from '$lib/types';

function renderTable(table: SlideTableBlock): string {
  const slide: Slide = { layout: 'blank', title: '', blocks: [table] };
  return render(SlideLayer, {
    props: { slide, theme: defaultSlideTheme, width: 612, height: 792, ptToPx: 1 },
  }).body;
}

function headerCellCount(html: string): number {
  return html.match(/class="[^"]*\bheader-cell\b[^"]*"/g)?.length ?? 0;
}

describe('slide table header orientation', () => {
  it('uses the header array as a top header row by default', () => {
    const html = renderTable({
      id: 'row-header',
      kind: 'table',
      header: ['Input', 'Output'],
      rows: [['1'], ['2', '4']],
    });
    expect(headerCellCount(html)).toBe(2);
    expect(html.match(/class="cell\b/g)).toHaveLength(6);
  });

  it('emphasizes the first cell of each ragged row for column headers', () => {
    const html = renderTable({
      id: 'column-header',
      kind: 'table',
      header: [],
      headerOrientation: 'column',
      rows: [
        ['Input', '1', '2'],
        ['Output', '3'],
      ],
    });
    expect(headerCellCount(html)).toBe(2);
    expect(html.match(/class="cell\b/g)).toHaveLength(6);
  });

  it('renders an empty row header without emphasizing data cells', () => {
    const html = renderTable({
      id: 'empty-header',
      kind: 'table',
      header: [],
      headerOrientation: 'row',
      rows: [['1', '2']],
    });
    expect(headerCellCount(html)).toBe(0);
    expect(html.match(/class="cell\b/g)).toHaveLength(2);
  });
});
