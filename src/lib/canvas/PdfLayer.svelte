<script lang="ts">
  import { renderPage } from '$lib/ipc';

  interface Props {
    pageIndex: number;
    scale: number;
    pageCount?: number;
    pdfId?: string;
  }

  let { pageIndex, scale, pageCount, pdfId }: Props = $props();

  let canvas: HTMLCanvasElement | undefined = $state();
  let error: string | null = $state(null);
  let latestRequestId = 0;

  async function draw(
    target: HTMLCanvasElement,
    index: number,
    s: number,
    requestId: number,
  ): Promise<void> {
    error = null;
    try {
      const page = await renderPage(index, s, pdfId);
      if (requestId !== latestRequestId) return;
      target.width = page.width;
      target.height = page.height;
      const ctx = target.getContext('2d');
      if (!ctx) throw new Error('2d canvas context unavailable');
      const imageData = new ImageData(page.rgba, page.width, page.height);
      ctx.putImageData(imageData, 0, 0);
      schedulePrefetch(index, s);
    } catch (err) {
      if (requestId !== latestRequestId) return;
      error = err instanceof Error ? err.message : String(err);
    }
  }

  function schedulePrefetch(index: number, s: number): void {
    if (pageCount === undefined) return;
    const neighbors: number[] = [];
    if (index + 1 < pageCount) neighbors.push(index + 1);
    if (index - 1 >= 0) neighbors.push(index - 1);
    if (neighbors.length === 0) return;

    const run = (): void => {
      for (const n of neighbors) {
        void renderPage(n, s, pdfId).catch(() => {
          /* fire-and-forget; cache warms on success */
        });
      }
    };
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      window.requestIdleCallback(run, { timeout: 500 });
    } else {
      setTimeout(run, 0);
    }
  }

  $effect(() => {
    const target = canvas;
    if (!target) return;
    const requestId = ++latestRequestId;
    void draw(target, pageIndex, scale, requestId);
  });
</script>

<div class="pdf-layer">
  <canvas bind:this={canvas} aria-label="Rendered PDF page"></canvas>
  {#if error}
    <div class="error" role="alert">{error}</div>
  {/if}
</div>

<style>
  .pdf-layer {
    position: relative;
    display: inline-block;
  }
  canvas {
    display: block;
    background: #fff;
  }
  .error {
    position: absolute;
    top: 8px;
    left: 8px;
    padding: 6px 10px;
    background: rgba(180, 30, 30, 0.9);
    color: #fff;
    font-size: 12px;
    border-radius: 4px;
    max-width: 80%;
  }
</style>
