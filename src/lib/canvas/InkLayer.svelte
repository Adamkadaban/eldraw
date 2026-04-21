<script lang="ts">
  import { onMount } from 'svelte';
  import type { StrokeObject } from '$lib/types';
  import { drawStroke } from './strokeRenderer';

  interface Props {
    strokes: StrokeObject[];
    width: number;
    height: number;
    ptToPx: number;
    streamline?: number;
  }

  let { strokes, width, height, ptToPx, streamline }: Props = $props();

  let canvas: HTMLCanvasElement;

  function redraw() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';
    for (const s of strokes) {
      if (s.tool === 'pen') drawStroke(ctx, s, { ptToPx, streamline });
    }
  }

  onMount(redraw);

  $effect(() => {
    void strokes;
    void width;
    void height;
    void ptToPx;
    void streamline;
    redraw();
  });
</script>

<canvas
  bind:this={canvas}
  {width}
  {height}
  class="ink-layer"
  style="width: {width}px; height: {height}px;"
></canvas>

<style>
  .ink-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
</style>
