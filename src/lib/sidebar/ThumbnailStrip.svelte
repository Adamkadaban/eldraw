<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import type { Page } from '$lib/types';
  import {
    bumpPageGeneration,
    DEFAULT_MAX_DIM,
    getThumbnail,
    pageGeneration,
    retainThumbnails,
    revokeThumbnails,
    subscribePageGeneration,
  } from '$lib/pdf/thumbnails';
  import { drawAnnotationOverlay, thumbnailPixelSize } from '$lib/pdf/thumbnailComposite';
  import { documentStore } from '$lib/store/document';
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

  let previewUrls = $state(new Map<number, string>());
  const compositedUrls = new Map<number, string>();
  const compositedGenerations = new Map<number, number>();
  const compositing = new Set<number>();
  const generationSubs = new Map<number, () => void>();
  let destroyed = false;
  let cacheKey: string | null = null;
  let observer: IntersectionObserver | null = null;
  const slotToKey = new WeakMap<Element, number>();

  function sourceKey(page: Page): number {
    return page.pdfSourceIndex ?? page.pageIndex;
  }

  function findPageBySource(key: number): Page | undefined {
    return pages.find((p) => p.type === 'pdf' && sourceKey(p) === key);
  }

  function setPreviewUrl(key: number, url: string) {
    const next = new Map(previewUrls);
    next.set(key, url);
    previewUrls = next;
  }

  function revokeComposited(key: number) {
    const url = compositedUrls.get(key);
    if (!url) return;
    URL.revokeObjectURL(url);
    compositedUrls.delete(key);
    compositedGenerations.delete(key);
  }

  function dropState() {
    if (cacheKey) revokeThumbnails(cacheKey);
    for (const url of compositedUrls.values()) URL.revokeObjectURL(url);
    compositedUrls.clear();
    compositedGenerations.clear();
    compositing.clear();
    for (const unsub of generationSubs.values()) unsub();
    generationSubs.clear();
    previewUrls = new Map();
  }

  function ensureGenerationSub(pdfId: string, key: number) {
    if (generationSubs.has(key)) return;
    const unsub = subscribePageGeneration(pdfId, key, () => {
      void composite(key);
    });
    generationSubs.set(key, unsub);
  }

  function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('thumbnail image load failed'));
      img.src = url;
    });
  }

  async function composite(key: number) {
    if (destroyed || !docKey || compositing.has(key)) return;
    const page = findPageBySource(key);
    if (!page || page.type !== 'pdf') return;
    const scopedKey = docKey;
    const startGeneration = pageGeneration(scopedKey, key);
    const objects = page.objects;
    const dims = thumbnailPixelSize(page, DEFAULT_MAX_DIM);
    if (dims.width < 1 || dims.height < 1) return;
    compositing.add(key);
    try {
      const rawUrl = await getThumbnail(scopedKey, key, DEFAULT_MAX_DIM);
      if (destroyed || scopedKey !== cacheKey) return;
      const img = await loadImage(rawUrl);
      if (destroyed || scopedKey !== cacheKey) return;
      const canvas = document.createElement('canvas');
      canvas.width = dims.width;
      canvas.height = dims.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, dims.width, dims.height);
      drawAnnotationOverlay(ctx, objects, dims.pxPerPt);
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/png');
      });
      if (!blob || destroyed || scopedKey !== cacheKey) return;
      const url = URL.createObjectURL(blob);
      revokeComposited(key);
      compositedUrls.set(key, url);
      compositedGenerations.set(key, startGeneration);
      setPreviewUrl(key, url);
      if (pageGeneration(scopedKey, key) !== startGeneration) {
        void composite(key);
      }
    } catch {
      // leave previous preview in place
    } finally {
      compositing.delete(key);
    }
  }

  function request(key: number) {
    if (!docKey || destroyed) return;
    ensureGenerationSub(docKey, key);
    const currentGen = pageGeneration(docKey, key);
    if (compositedGenerations.get(key) === currentGen && compositedUrls.has(key)) return;
    void composite(key);
  }

  function ensureObserver(): IntersectionObserver | null {
    if (observer || typeof IntersectionObserver === 'undefined') return observer;
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const key = slotToKey.get(entry.target);
          if (key !== undefined) request(key);
        }
      },
      { rootMargin: '200px' },
    );
    return observer;
  }

  function observe(el: Element, page: Page) {
    if (page.type !== 'pdf') return { destroy() {} };
    const key = sourceKey(page);
    const io = ensureObserver();
    if (!io) {
      request(key);
      return { destroy() {} };
    }
    slotToKey.set(el, key);
    io.observe(el);
    return {
      destroy() {
        io.unobserve(el);
        slotToKey.delete(el);
      },
    };
  }

  const unsubCommit = documentStore.onPageCommit((pageIndex) => {
    if (!docKey) return;
    const page = pages[pageIndex];
    if (!page || page.type !== 'pdf') return;
    bumpPageGeneration(docKey, sourceKey(page));
  });

  $effect(() => {
    const key = docKey;
    untrack(() => {
      if (key !== cacheKey) {
        dropState();
        cacheKey = key;
      }
    });
  });

  $effect(() => {
    const activeKeys = new Set<number>();
    for (const page of pages) {
      if (page.type === 'pdf') activeKeys.add(sourceKey(page));
    }
    untrack(() => {
      if (!cacheKey) return;
      let changed = false;
      const next = new Map(previewUrls);
      for (const key of next.keys()) {
        if (!activeKeys.has(key)) {
          next.delete(key);
          revokeComposited(key);
          compositing.delete(key);
          const unsub = generationSubs.get(key);
          if (unsub) {
            unsub();
            generationSubs.delete(key);
          }
          changed = true;
        }
      }
      if (changed) previewUrls = next;
      retainThumbnails(cacheKey, activeKeys);
    });
  });

  onDestroy(() => {
    destroyed = true;
    unsubCommit();
    observer?.disconnect();
    observer = null;
    if (cacheKey) revokeThumbnails(cacheKey);
    for (const url of compositedUrls.values()) URL.revokeObjectURL(url);
    compositedUrls.clear();
    compositedGenerations.clear();
    for (const unsub of generationSubs.values()) unsub();
    generationSubs.clear();
    previewUrls.clear();
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
            use:observe={page}
            style="width: {size.width}px; height: {size.height}px;{url
              ? ` background-image: url('${url}');`
              : ''}"
            style:background-color={page.type === 'blank'
              ? (page.background ?? undefined)
              : undefined}
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
