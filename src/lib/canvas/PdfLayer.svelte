<script lang="ts">
  import { renderPage } from '$lib/ipc';

  interface Props {
    pageIndex: number;
    scale: number;
  }

  let { pageIndex, scale }: Props = $props();

  let canvas: HTMLCanvasElement | undefined = $state();
  let error: string | null = $state(null);

  async function draw(index: number, s: number): Promise<void> {
    if (!canvas) return;
    error = null;
    try {
      const pngBytes = await renderPage(index, s);
      const blob = new Blob([pngBytes], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      try {
        const image = await loadImage(url);
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('2d canvas context unavailable');
        ctx.drawImage(image, 0, 0);
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('failed to decode page image'));
      img.src = url;
    });
  }

  $effect(() => {
    void draw(pageIndex, scale);
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
