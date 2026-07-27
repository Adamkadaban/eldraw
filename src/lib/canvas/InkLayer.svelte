<script lang="ts">
  import { isAppendOnly } from '$lib/canvas/layerDiff';
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
  let prevStrokes: StrokeObject[] = [];
  let prevWidth = 0;
  let prevHeight = 0;
  let prevPtToPx = 0;

  function fullRedraw() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';
    for (const s of strokes) {
      if (s.tool === 'pen') drawStroke(ctx, s, { ptToPx });
    }
    prevStrokes = strokes;
    prevWidth = width;
    prevHeight = height;
    prevPtToPx = ptToPx;
  }

  function incrementalDraw() {
    if (!canvas) return;
    if (width !== prevWidth || height !== prevHeight || ptToPx !== prevPtToPx) {
      fullRedraw();
      return;
    }
    if (strokes === prevStrokes) return;
    if (isAppendOnly(prevStrokes, strokes)) {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.globalCompositeOperation = 'source-over';
      for (let i = prevStrokes.length; i < strokes.length; i++) {
        const s = strokes[i];
        if (s.tool === 'pen') drawStroke(ctx, s, { ptToPx });
      }
      prevStrokes = strokes;
      return;
    }
    fullRedraw();
  }

  onMount(fullRedraw);

  $effect(() => {
    void strokes;
    void width;
    void height;
    void ptToPx;
    incrementalDraw();
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
