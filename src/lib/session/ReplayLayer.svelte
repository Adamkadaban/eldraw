<script lang="ts">
  import { onMount } from 'svelte';
  import type { AnyObject, StrokeObject } from '$lib/types';
  import { drawStroke, drawLiveStroke } from '$lib/canvas/strokeRenderer';
  import { drawLine, drawShape, drawNumberLine, drawAngleMark } from '$lib/canvas/objectRenderer';

  interface Props {
    width: number;
    height: number;
    ptToPx: number;
    objects: AnyObject[];
    activeStrokes: StrokeObject[];
  }

  let { width, height, ptToPx, objects, activeStrokes }: Props = $props();

  let canvas: HTMLCanvasElement;

  function redraw() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const o of objects) {
      switch (o.type) {
        case 'stroke':
          drawStroke(ctx, o, { ptToPx });
          break;
        case 'line':
          drawLine(ctx, o, ptToPx);
          break;
        case 'shape':
          drawShape(ctx, o, ptToPx);
          break;
        case 'numberline':
          drawNumberLine(ctx, o, ptToPx);
          break;
        case 'angleMark':
          drawAngleMark(ctx, o, ptToPx);
          break;
        default:
          break;
      }
    }
    for (const s of activeStrokes) {
      drawLiveStroke(ctx, s.points, s.style, s.tool, ptToPx, s.streamline);
    }
  }

  onMount(redraw);

  $effect(() => {
    void objects;
    void activeStrokes;
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
  class="replay-layer"
  style="width: {width}px; height: {height}px;"
></canvas>

<style>
  .replay-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 25;
  }
</style>
