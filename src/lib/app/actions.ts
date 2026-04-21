import { get } from 'svelte/store';
import { viewport } from '$lib/store/viewport';
import { documentStore, currentDocument } from '$lib/store/document';
import { sampleCanvasBackground } from '$lib/canvas/bgSample';

/**
 * Shared action helpers used by both the global shortcut registry and the
 * command palette. Keeping them in one place prevents the two surfaces from
 * drifting apart.
 */

export function currentPage(): number {
  return viewport.snapshot().currentPageIndex;
}

export function currentPageCount(): number {
  return get(currentDocument)?.pages.length ?? 0;
}

export function toggleFullscreen(): void {
  if (typeof document === 'undefined') return;
  if (document.fullscreenElement) {
    void document.exitFullscreen();
  } else {
    void document.documentElement.requestFullscreen();
  }
}

export function sampleCurrentPageBackground(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const canvas = document.querySelector<HTMLCanvasElement>(
    '.pdf-slot canvas[aria-label="Rendered PDF page"]',
  );
  if (!canvas) return undefined;
  return sampleCanvasBackground(canvas) ?? undefined;
}

export function insertBlankAfterCurrent(): void {
  const doc = get(currentDocument);
  if (!doc) return;
  const idx = currentPage();
  const page = doc.pages[idx];
  if (!page) return;
  const background = page.type === 'pdf' ? sampleCurrentPageBackground() : page.background;
  documentStore.insertBlankPageAfter(idx, page.width, page.height, background);
}
