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
    /** Stable identifier for the loaded PDF; thumbnail cache is scoped to it. */
    docKey?: string | null;
  }

  const {
    pages,
    currentIndex,
    onpick,
    onmove,
    onduplicate,
    ondelete,
    maxWidth = 140,
    docKey = null,
  }: Props = $props();

  const canDelete = $derived(pages.length > 1);
  const MAX_CONCURRENT_RENDERS = 3;

  let previewUrls = $state(new Map<number, string>());
  const inflight = new Set<number>();
  const queue: Page[] = [];
  let activeRenders = 0;
  let destroyed = false;
  let cacheKey: string | null = null;

  function thumbnailScale(widthPt: number): number {
    if (!widthPt || widthPt <= 0) return 1;
    const target = Math.max(64, Math.min(maxWidth, 220));
    return target / widthPt;
  }

  function sourceKey(page: Page): number {
    return page.pdfSourceIndex ?? page.pageIndex;
  }

  function revokeAll() {
    for (const url of previewUrls.values()) URL.revokeObjectURL(url);
    previewUrls = new Map();
    inflight.clear();
    queue.length = 0;
    activeRenders = 0;
  }

  function pumpQueue() {
    while (!destroyed && activeRenders < MAX_CONCURRENT_RENDERS && queue.length > 0) {
      const page = queue.shift()!;
      void renderOne(page);
    }
  }

  async function renderOne(page: Page): Promise<void> {
    const key = sourceKey(page);
    activeRenders += 1;
    try {
      const bytes = await renderPage(key, thumbnailScale(page.width));
      if (destroyed) return;
      const blob = new Blob([bytes], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      if (destroyed) {
        URL.revokeObjectURL(url);
        return;
      }
      const next = new Map(previewUrls);
      const prior = next.get(key);
      if (prior) URL.revokeObjectURL(prior);
      next.set(key, url);
      previewUrls = next;
    } catch {
      // Leave the slot blank on failure; main layer surfaces the error.
    } finally {
      inflight.delete(key);
      activeRenders -= 1;
      pumpQueue();
    }
  }

  function enqueue(page: Page) {
    if (page.type !== 'pdf') return;
    const key = sourceKey(page);
    if (previewUrls.has(key) || inflight.has(key)) return;
    inflight.add(key);
    queue.push(page);
  }

  function pruneStaleKeys(snapshot: Page[]) {
    const live = new Set<number>();
    for (const p of snapshot) if (p.type === 'pdf') live.add(sourceKey(p));
    let changed = false;
    const next = new Map(previewUrls);
    for (const [key, url] of next) {
      if (!live.has(key)) {
        URL.revokeObjectURL(url);
        next.delete(key);
        changed = true;
      }
    }
    if (changed) previewUrls = next;
  }

  $effect(() => {
    const key = docKey;
    untrack(() => {
      if (key !== cacheKey) {
        revokeAll();
        cacheKey = key;
      }
    });
  });

  $effect(() => {
    const snapshot = pages;
    untrack(() => {
      pruneStaleKeys(snapshot);
      for (const p of snapshot) enqueue(p);
      pumpQueue();
    });
  });

  onDestroy(() => {
    destroyed = true;
    for (const url of previewUrls.values()) URL.revokeObjectURL(url);
    previewUrls.clear();
    inflight.clear();
    queue.length = 0;
  });

  function previewFor(page: Page): string | undefined {
    if (page.type !== 'pdf') return undefined;
    return previewUrls.get(sourceKey(page));
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
            style="width: {size.width}px; height: {size.height}px;{page.type === 'blank' &&
            page.background
              ? ` background-color: ${page.background};`
              : ''}{url ? ` background-image: url('${url}');` : ''}"
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
