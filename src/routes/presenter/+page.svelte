<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { CanvasStack, GraphLayer, PdfLayer, TextLayer } from '$lib/canvas';
  import { onPresenterSync, closePresenterWindow } from '$lib/ipc/presenter';
  import { setWindowFullscreenChromeless } from '$lib/app/windowFullscreen';
  // Teardown deliberately leaves fullscreen/decorations to Rust's
  // `close_presenter_window`: restoring decorations from JS before close
  // causes a decorated-window flash.
  import { presenterMirror, presenterMirrorStore } from '$lib/store/presenterMirror';
  import { pdfPageIndexAt } from '$lib/store/document';
  import type { AnyObject, GraphObject, StrokeObject, TextObject } from '$lib/types';
  import type { UnlistenFn } from '@tauri-apps/api/event';

  let unlisten: UnlistenFn | null = null;
  let windowWidth = $state(typeof window !== 'undefined' ? window.innerWidth : 0);
  let windowHeight = $state(typeof window !== 'undefined' ? window.innerHeight : 0);

  const mirror = $derived($presenterMirrorStore);
  const doc = $derived(mirror.document);
  const pages = $derived(doc?.pages ?? []);
  const pageIndex = $derived(Math.min(mirror.pageIndex, Math.max(0, pages.length - 1)));
  const currentPage = $derived(pages[pageIndex] ?? null);
  const pdfPageIndex = $derived(doc ? pdfPageIndexAt(doc.pages, pageIndex) : null);
  const pageObjects = $derived<AnyObject[]>(currentPage?.objects ?? []);
  const pageStrokes = $derived<StrokeObject[]>(
    pageObjects.filter((o): o is StrokeObject => o.type === 'stroke'),
  );
  const pageGraphs = $derived<GraphObject[]>(
    pageObjects.filter((o): o is GraphObject => o.type === 'graph'),
  );
  const pageTextObjects = $derived<TextObject[]>(
    pageObjects.filter((o): o is TextObject => o.type === 'text'),
  );

  const canvasSize = $derived.by(() => {
    if (!currentPage) return null;
    const windowW = windowWidth || currentPage.width;
    const windowH = windowHeight || currentPage.height;
    const fit = Math.min(windowW / currentPage.width, windowH / currentPage.height);
    const scale = Number.isFinite(fit) && fit > 0 ? fit : 1;
    return {
      width: Math.round(currentPage.width * scale),
      height: Math.round(currentPage.height * scale),
      ptToPx: scale,
    };
  });

  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      void closePresenterWindow();
    }
  }

  function onResize(): void {
    windowWidth = window.innerWidth;
    windowHeight = window.innerHeight;
  }

  onMount(async () => {
    await setWindowFullscreenChromeless(true);
    unlisten = await onPresenterSync((payload) => presenterMirror.apply(payload));
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    onResize();
  });

  onDestroy(() => {
    unlisten?.();
    presenterMirror.reset();
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    }
  });
</script>

<main class="presenter">
  {#if canvasSize && currentPage}
    {@const size = canvasSize}
    <div class="page-frame" style="width: {size.width}px; height: {size.height}px;">
      {#if currentPage.type === 'pdf' && pdfPageIndex !== null}
        <div class="pdf-slot">
          <PdfLayer pageIndex={pdfPageIndex} scale={size.ptToPx} />
        </div>
      {:else if currentPage.type === 'blank'}
        <div
          class="blank-slot"
          style="width: {size.width}px; height: {size.height}px;"
          style:background-color={currentPage.background ?? '#fff'}
        ></div>
      {/if}
      <div class="stack-slot">
        <CanvasStack
          strokes={pageStrokes}
          objects={pageObjects}
          width={size.width}
          height={size.height}
          ptToPx={size.ptToPx}
        >
          {#snippet overlay()}
            <GraphLayer
              graphs={pageGraphs}
              width={size.width}
              height={size.height}
              ptToPx={size.ptToPx}
            />
          {/snippet}
        </CanvasStack>
      </div>
      <div class="text-slot">
        <TextLayer objects={pageTextObjects} ptToPx={size.ptToPx} interactive={false} />
      </div>
    </div>
  {:else}
    <div class="empty"><p>Waiting for primary window…</p></div>
  {/if}
</main>

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    height: 100%;
    background: #000;
    color: #eee;
    font-family: Inter, system-ui, sans-serif;
    overflow: hidden;
    cursor: none;
  }
  .presenter {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #000;
  }
  .page-frame {
    position: relative;
    background: #fff;
    box-shadow: 0 0 0 1px #000;
  }
  .pdf-slot,
  .stack-slot,
  .text-slot {
    position: absolute;
    inset: 0;
  }
  .stack-slot,
  .text-slot {
    pointer-events: none;
  }
  .blank-slot {
    position: absolute;
    inset: 0;
    box-sizing: border-box;
  }
  .empty {
    color: #888;
    font-size: 14px;
  }
</style>
