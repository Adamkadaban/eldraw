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
  let prevStrokes: StrokeObject[] = [];
  let prevWidth = 0;
  let prevHeight = 0;
  let prevPtToPx = 0;

  function drawHighlightStroke(ctx: CanvasRenderingContext2D, s: StrokeObject) {
    if (s.tool !== 'highlighter') return;
    const faded: StrokeObject = {
      ...s,
      style: { ...s.style, opacity: Math.min(s.style.opacity, 0.3) },
    };
    drawStroke(ctx, faded, { ptToPx });
  }

  function fullRedraw() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'multiply';
    for (const s of strokes) drawHighlightStroke(ctx, s);
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
      ctx.globalCompositeOperation = 'multiply';
      for (let i = prevStrokes.length; i < strokes.length; i++) {
        drawHighlightStroke(ctx, strokes[i]);
      }
      prevStrokes = strokes;
      return;
    }
    fullRedraw();
  }

  function isAppendOnly(prev: StrokeObject[], next: StrokeObject[]): boolean {
    if (next.length < prev.length) return false;
    for (let i = 0; i < prev.length; i++) {
      if (prev[i] !== next[i]) return false;
    }
    return true;
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
