import { describe, it, expect } from 'vitest';
import { planReload } from '$lib/pdf/reload';
import type { EldrawDocument, Page, PdfMeta, StrokeObject } from '$lib/types';

function stroke(id: string): StrokeObject {
  return {
    id,
    createdAt: 0,
    type: 'stroke',
    tool: 'pen',
    style: { color: '#000', width: 2, dash: 'solid', opacity: 1 },
    points: [],
  };
}

function pdfPage(i: number, objects: StrokeObject[] = []): Page {
  return {
    pageIndex: i,
    type: 'pdf',
    insertedAfterPdfPage: null,
    pdfSourceIndex: i,
    width: 612,
    height: 792,
    objects,
  };
}

function doc(pages: Page[], hash = 'h-old'): EldrawDocument {
  return {
    version: 1,
    pdfHash: hash,
    pdfPath: '/tmp/a.pdf',
    pages,
    palettes: [],
    prefs: {
      sidebarPinned: true,
      defaultTool: 'pen',
      toolDefaults: {
        pen: { color: '#000', width: 2, dash: 'solid', opacity: 1 },
        highlighter: { color: '#ff0', width: 14, dash: 'solid', opacity: 0.3 },
        line: { color: '#000', width: 2, dash: 'solid', opacity: 1 },
      },
    },
  };
}

function meta(pageCount: number, hash = 'h-new'): PdfMeta {
  return {
    path: '/tmp/a.pdf',
    hash,
    pageCount,
    pages: Array.from({ length: pageCount }, () => ({ width: 612, height: 792 })),
  };
}

describe('planReload', () => {
  it('keep with same page count preserves every object', () => {
    const before = doc([pdfPage(0, [stroke('s0')]), pdfPage(1, [stroke('s1'), stroke('s2')])]);
    const { doc: next, warning } = planReload(before, meta(2), 'keep');
    expect(warning).toBeNull();
    expect(next.pages.map((p) => p.objects.map((o) => o.id))).toEqual([['s0'], ['s1', 's2']]);
    expect(next.pdfHash).toBe('h-new');
  });

  it('keep with smaller page count truncates and emits warning', () => {
    const before = doc([
      pdfPage(0, [stroke('s0')]),
      pdfPage(1, [stroke('s1')]),
      pdfPage(2, [stroke('s2')]),
    ]);
    const { doc: next, warning } = planReload(before, meta(2), 'keep');
    expect(next.pages).toHaveLength(2);
    expect(next.pages[0].objects.map((o) => o.id)).toEqual(['s0']);
    expect(next.pages[1].objects.map((o) => o.id)).toEqual(['s1']);
    expect(warning).toMatch(/2 pages/);
    expect(warning).toMatch(/truncated 1/);
  });

  it('keep with larger page count appends empty pages without warning', () => {
    const before = doc([pdfPage(0, [stroke('s0')])]);
    const { doc: next, warning } = planReload(before, meta(3), 'keep');
    expect(warning).toBeNull();
    expect(next.pages).toHaveLength(3);
    expect(next.pages[0].objects.map((o) => o.id)).toEqual(['s0']);
    expect(next.pages[1].objects).toEqual([]);
    expect(next.pages[2].objects).toEqual([]);
  });

  it('discard clears every page and rebuilds from meta', () => {
    const before = doc([pdfPage(0, [stroke('s0')]), pdfPage(1, [stroke('s1')])]);
    const { doc: next, warning } = planReload(before, meta(3), 'discard');
    expect(warning).toBeNull();
    expect(next.pages).toHaveLength(3);
    expect(next.pages.every((p) => p.objects.length === 0)).toBe(true);
    expect(next.pdfHash).toBe('h-new');
  });
});
