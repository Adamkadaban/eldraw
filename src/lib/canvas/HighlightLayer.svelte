<script lang="ts">
  import { onMount } from 'svelte';
  import type { StrokeObject } from '$lib/types';
  import { drawStroke } from './strokeRenderer';

  interface Props {
    strokes: StrokeObject[];
    width: number;
    height: number;
    ptToPx: number;
  }

  let { strokes, width, height, ptToPx }: Props = $props();

  let canvas: HTMLCanvasElement;

  function redraw() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'multiply';
    for (const s of strokes) {
      if (s.tool !== 'highlighter') continue;
      const faded: StrokeObject = {
        ...s,
        style: { ...s.style, opacity: Math.min(s.style.opacity, 0.3) },
      };
      drawStroke(ctx, faded, { ptToPx });
    }
  }

  onMount(redraw);

  $effect(() => {
    void strokes;
    void width;
    void height;
    void ptToPx;
    redraw();
  });
</script>

<canvas
  bind:this={canvas}
  {width}
  {height}
  class="highlight-layer"
  style="width: {width}px; height: {height}px;"
></canvas>

<style>
  .highlight-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
</style>
