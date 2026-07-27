import { beforeEach, describe, expect, it } from 'vitest';
import { createDocumentStore } from '$lib/store/document';
import { createSlide } from '$lib/slides/deck';
import { SLIDE_PAGE_SIZE } from '$lib/slides/pageOps';
import type { EldrawDocument, Page, Slide } from '$lib/types';

function pdfPage(pageIndex: number): Page {
  return {
    pageIndex,
    type: 'pdf',
    insertedAfterPdfPage: null,
    pdfSourceIndex: pageIndex,
    width: 612,
    height: 792,
    objects: [],
  };
}

function doc(pages: Page[]): EldrawDocument {
  return {
    version: 1,
    pdfHash: 'hash',
    pdfPath: null,
    pages,
    palettes: [],
    prefs: {
      sidebarPinned: false,
      defaultTool: 'pen',
      toolDefaults: {
        pen: { color: '#000000', width: 2, dash: 'solid', opacity: 1 },
        highlighter: { color: '#ffff00', width: 8, dash: 'solid', opacity: 0.4 },
        line: { color: '#000000', width: 2, dash: 'solid', opacity: 1 },
      },
    },
  };
}

describe('slide pages in the document store', () => {
  let store: ReturnType<typeof createDocumentStore>;

  beforeEach(() => {
    store = createDocumentStore();
    store.load(doc([pdfPage(0), pdfPage(1)]));
  });

  function pages(): Page[] {
    let current: Page[] = [];
    store.subscribe((d) => (current = d?.pages ?? []))();
    return current;
  }

  it('inserts a slide page after the given index and reindexes', () => {
    const slide = createSlide('content', 'Heading');
    store.insertSlidePageAfter(0, slide, SLIDE_PAGE_SIZE.widescreen.width, 540);

    const result = pages();
    expect(result).toHaveLength(3);
    expect(result[1].type).toBe('slide');
    expect(result[1].slide?.title).toBe('Heading');
    expect(result.map((p) => p.pageIndex)).toEqual([0, 1, 2]);
  });

  it('gives the inserted slide the requested dimensions', () => {
    store.insertSlidePageAfter(0, createSlide('title'), 960, 540);
    expect(pages()[1]).toMatchObject({ width: 960, height: 540 });
  });

  it('does not alias the caller\u2019s slide object', () => {
    const slide = createSlide('content', 'Original');
    store.insertSlidePageAfter(0, slide, 960, 540);
    slide.title = 'Mutated';
    expect(pages()[1].slide?.title).toBe('Original');
  });

  it('replaces slide content with updateSlide', () => {
    store.insertSlidePageAfter(0, createSlide('content', 'Before'), 960, 540);
    store.updateSlide(1, createSlide('content', 'After'));
    expect(pages()[1].slide?.title).toBe('After');
  });

  it('ignores updateSlide on a page that is not a slide', () => {
    store.updateSlide(0, createSlide('content', 'Nope'));
    expect(pages()[0].type).toBe('pdf');
    expect(pages()[0].slide).toBeUndefined();
  });

  it('rejects an unusable slide rather than inserting a broken page', () => {
    store.insertSlidePageAfter(0, null as unknown as Slide, 960, 540);
    expect(pages()).toHaveLength(2);
  });
});

describe('slide sanitization at the load boundary', () => {
  function loadedPages(slide: unknown): Page[] {
    const store = createDocumentStore();
    const page = {
      pageIndex: 0,
      type: 'slide',
      insertedAfterPdfPage: null,
      width: 960,
      height: 540,
      slide,
      objects: [],
    } as unknown as Page;
    store.load(doc([page]));
    let current: Page[] = [];
    store.subscribe((d) => (current = d?.pages ?? []))();
    return current;
  }

  it('keeps a valid slide', () => {
    const result = loadedPages(createSlide('content', 'Fine'));
    expect(result[0].type).toBe('slide');
    expect(result[0].slide?.title).toBe('Fine');
  });

  it('degrades an unusable slide to a blank page instead of dropping it', () => {
    const result = loadedPages('not a slide');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('blank');
    expect(result[0].slide).toBeUndefined();
  });

  it('strips a hostile image source from a loaded slide', () => {
    const hostile = {
      layout: 'content',
      title: 'Hostile',
      blocks: [
        { id: 'a', kind: 'image', src: 'javascript:alert(1)', alt: '', height: 100 },
        { id: 'b', kind: 'text', text: 'safe' },
      ],
    };
    const blocks = loadedPages(hostile)[0].slide?.blocks ?? [];
    const images = blocks.filter((b) => b.kind === 'image');
    for (const image of images) {
      expect(image.kind === 'image' && image.src.startsWith('javascript:')).toBe(false);
    }
  });

  it('does not throw on malformed slide input', () => {
    for (const bad of [null, undefined, 42, [], { layout: 'nope' }, { blocks: 'x' }]) {
      expect(() => loadedPages(bad)).not.toThrow();
    }
  });
});
