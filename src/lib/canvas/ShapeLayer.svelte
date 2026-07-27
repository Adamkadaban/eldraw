<script lang="ts">
  import { onMount } from 'svelte';
  import type { AnyObject } from '$lib/types';
  import { drawAngleMark, drawLine, drawNumberLine, drawShape } from './objectRenderer';

  interface Props {
    objects: AnyObject[];
    width: number;
    height: number;
    ptToPx: number;
  }

  let { objects, width, height, ptToPx }: Props = $props();

  let canvas: HTMLCanvasElement;
  let prevObjects: AnyObject[] = [];
  let prevWidth = 0;
  let prevHeight = 0;
  let prevPtToPx = 0;

  function drawObject(ctx: CanvasRenderingContext2D, o: AnyObject) {
    if (o.type === 'line') drawLine(ctx, o, ptToPx);
    else if (o.type === 'shape') drawShape(ctx, o, ptToPx);
    else if (o.type === 'numberline') drawNumberLine(ctx, o, ptToPx);
    else if (o.type === 'angleMark') drawAngleMark(ctx, o, ptToPx);
  }

  function fullRedraw() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const o of objects) drawObject(ctx, o);
    prevObjects = objects;
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
    if (objects === prevObjects) return;
    if (isAppendOnly(prevObjects, objects)) {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      for (let i = prevObjects.length; i < objects.length; i++) {
        drawObject(ctx, objects[i]);
      }
      prevObjects = objects;
      return;
    }
    fullRedraw();
  }

  function isAppendOnly(prev: AnyObject[], next: AnyObject[]): boolean {
    if (next.length < prev.length) return false;
    for (let i = 0; i < prev.length; i++) {
      if (prev[i] !== next[i]) return false;
    }
    return true;
  }

  onMount(fullRedraw);

  $effect(() => {
    void objects;
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
