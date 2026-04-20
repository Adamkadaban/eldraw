<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import type { Page } from '$lib/types';
  import { renderPage } from '$lib/ipc';
  import { thumbnailSize } from './thumbnailSize';

  interface Props {
    pages: Page[];
    currentIndex: number;
    onpick: (index: number) => void;
    onmove?: (from: number, to: number) => void;
    onduplicate?: (index: number) => void;
    ondelete?: (index: number) => void;
    maxWidth?: number;
  }

  const {
    pages,
    currentIndex,
    onpick,
    onmove,
    onduplicate,
    ondelete,
    maxWidth = 140,
  }: Props = $props();

  const canDelete = $derived(pages.length > 1);

  /** Rendered thumbnail URLs keyed by pdfSourceIndex (the stable PDF page slot). */
  let previewUrls = $state(new Map<number, string>());
  const inflight = new Set<number>();

  function thumbnailScale(widthPt: number): number {
    if (!widthPt || widthPt <= 0) return 1;
    const target = Math.max(64, Math.min(maxWidth, 220));
    return target / widthPt;
  }

  async function ensureThumbnail(page: Page): Promise<void> {
    if (page.type !== 'pdf') return;
    const sourceIndex = page.pdfSourceIndex ?? page.pageIndex;
    if (previewUrls.has(sourceIndex) || inflight.has(sourceIndex)) return;
    inflight.add(sourceIndex);
    try {
      const bytes = await renderPage(sourceIndex, thumbnailScale(page.width));
      const blob = new Blob([bytes], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      previewUrls = new Map(previewUrls).set(sourceIndex, url);
    } catch {
      // Leave the slot blank on failure; main layer surfaces the error.
    } finally {
      inflight.delete(sourceIndex);
    }
  }

  $effect(() => {
    const snapshot = pages;
    untrack(() => {
      for (const p of snapshot) void ensureThumbnail(p);
    });
  });

  onDestroy(() => {
    for (const url of previewUrls.values()) URL.revokeObjectURL(url);
    previewUrls.clear();
  });

  function previewFor(page: Page): string | undefined {
    if (page.type !== 'pdf') return undefined;
    const key = page.pdfSourceIndex ?? page.pageIndex;
    return previewUrls.get(key);
  }
</script>

<aside class="strip" aria-label="Page thumbnails">
  <ul>
    {#each pages as page, i (page.pageIndex)}
      {@const size = thumbnailSize(page.width, page.height, maxWidth)}
      {@const url = previewFor(page)}
      <li class="row" class:active={i === currentIndex}>
        <button
          type="button"
          class="thumb"
          aria-label={`Go to page ${i + 1}`}
          aria-current={i === currentIndex ? 'page' : undefined}
          onclick={() => onpick(i)}
        >
          <span
            class="preview"
            class:blank={page.type === 'blank'}
            style="width: {size.width}px; height: {size.height}px; {url
              ? `background-image: url('${url}');`
              : ''}"
          ></span>
          <span class="label">{i + 1}</span>
        </button>
        <div class="actions" role="toolbar" aria-label={`Page ${i + 1} actions`}>
          <button
            type="button"
            class="action"
            aria-label={`Move page ${i + 1} up`}
            disabled={!onmove || i === 0}
            onclick={() => onmove?.(i, i - 1)}
          >
            ↑
          </button>
          <button
            type="button"
            class="action"
            aria-label={`Move page ${i + 1} down`}
            disabled={!onmove || i === pages.length - 1}
            onclick={() => onmove?.(i, i + 1)}
          >
            ↓
          </button>
          <button
            type="button"
            class="action"
            aria-label={`Duplicate page ${i + 1}`}
            disabled={!onduplicate}
            onclick={() => onduplicate?.(i)}
          >
            ⧉
          </button>
          <button
            type="button"
            class="action danger"
            aria-label={`Delete page ${i + 1}`}
            disabled={!ondelete || !canDelete}
            onclick={() => ondelete?.(i)}
          >
            ✕
          </button>
        </div>
      </li>
    {/each}
  </ul>
</aside>

<style>
  .strip {
    height: 100%;
    overflow-y: auto;
    background: #1a1a1a;
    border-left: 1px solid #111;
    padding: 8px;
    box-sizing: border-box;
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
  }
  .row {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    border: 2px solid transparent;
    border-radius: 4px;
    padding: 4px;
  }
  .row:hover,
  .row:focus-within {
    border-color: #444;
  }
  .row.active {
    border-color: #4a9eff;
  }
  .thumb {
    background: transparent;
    border: none;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 0;
  }
  .preview {
    display: block;
    background-color: #fff;
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
  }
  .preview.blank {
    background-color: #fafafa;
  }
  .label {
    font-size: 11px;
    color: #bbb;
  }
  .row.active .label {
    color: #4a9eff;
  }
  .actions {
    display: flex;
    gap: 2px;
    opacity: 0;
    transition: opacity 80ms;
  }
  .row:hover .actions,
  .row:focus-within .actions {
    opacity: 1;
  }
  .action {
    background: #2a2a2a;
    border: 1px solid #3a3a3a;
    color: #ddd;
    width: 22px;
    height: 20px;
    border-radius: 3px;
    font-size: 11px;
    cursor: pointer;
    padding: 0;
  }
  .action:hover:not(:disabled) {
    border-color: #666;
  }
  .action.danger:hover:not(:disabled) {
    border-color: #c44;
    color: #f88;
  }
  .action:disabled {
    opacity: 0.35;
    cursor: default;
  }
</style>
