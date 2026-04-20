<script lang="ts">
  import { onMount } from 'svelte';
  import type { AnyObject, LineObject, NumberLineObject, ShapeObject } from '$lib/types';
  import { drawLine, drawNumberLine, drawShape } from './objectRenderer';

  interface Props {
    objects: AnyObject[];
    width: number;
    height: number;
    ptToPx: number;
  }

  let { objects, width, height, ptToPx }: Props = $props();

  let canvas: HTMLCanvasElement;

  function redraw() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const o of objects) {
      if (o.type === 'line') drawLine(ctx, o as LineObject, ptToPx);
      else if (o.type === 'shape') drawShape(ctx, o as ShapeObject, ptToPx);
      else if (o.type === 'numberline') drawNumberLine(ctx, o as NumberLineObject, ptToPx);
    }
  }

  onMount(redraw);

  $effect(() => {
    void objects;
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
  class="shape-layer"
  style="width: {width}px; height: {height}px;"
></canvas>

<style>
  .shape-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
</style>
