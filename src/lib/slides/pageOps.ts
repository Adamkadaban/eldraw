import type { Page, Slide } from '$lib/types';

export const SLIDE_PAGE_SIZE = {
  widescreen: { width: 960, height: 540 },
  letter: { width: 612, height: 792 },
} as const;

export function slidePage(
  pageIndex: number,
  slide: Slide,
  width: number,
  height: number,
  insertedAfterPdfPage: number | null,
): Page {
  return {
    pageIndex,
    type: 'slide',
    insertedAfterPdfPage,
    width,
    height,
    slide: structuredClone(slide),
    objects: [],
  };
}
