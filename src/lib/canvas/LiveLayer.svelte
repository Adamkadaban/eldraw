<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { Point, StrokeObject, StrokeStyle, ToolKind } from '$lib/types';
  import { toolStore } from '$lib/store/tool';
  import { strokeFromInput } from '$lib/tools/pen';
  import { drawLiveStroke } from './strokeRenderer';

  interface Props {
    width: number;
    height: number;
    ptToPx: number;
    oncommit?: (stroke: StrokeObject) => void;
    onerase?: (at: { x: number; y: number }) => void;
  }

  let { width, height, ptToPx, oncommit, onerase }: Props = $props();

  let canvas: HTMLCanvasElement;
  let activePointerId: number | null = null;
  let startTime = 0;
  let points: Point[] = [];
  let currentTool: ToolKind = 'pen';
  let currentStyle: StrokeStyle = {
    color: '#000',
    width: 2,
    dash: 'solid',
    opacity: 1,
  };

  const unsubscribeTool = toolStore.subscribe((s) => {
    currentTool = s.tool;
    currentStyle = s.style;
  });
  onDestroy(unsubscribeTool);

  function ctx(): CanvasRenderingContext2D | null {
    return canvas?.getContext('2d') ?? null;
  }

  function clear() {
    const c = ctx();
    if (!c) return;
    c.clearRect(0, 0, canvas.width, canvas.height);
  }

  export function clearLive() {
    if (activePointerId !== null) {
      try {
        canvas?.releasePointerCapture(activePointerId);
      } catch {
        // not captured; ignore
      }
    }
    activePointerId = null;
    points = [];
    clear();
  }

  function toPoint(e: PointerEvent): Point {
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const pressure = e.pressure > 0 ? e.pressure : 0.5;
    return {
      x: px / ptToPx,
      y: py / ptToPx,
      pressure,
      t: performance.now() - startTime,
    };
  }

  function redrawLive() {
    const c = ctx();
    if (!c) return;
    clear();
    if (currentTool === 'highlighter') {
      c.globalCompositeOperation = 'multiply';
      drawLiveStroke(c, points, currentStyle, 'highlighter', ptToPx);
    } else if (currentTool === 'pen') {
      c.globalCompositeOperation = 'source-over';
      drawLiveStroke(c, points, currentStyle, 'pen', ptToPx);
    }
  }

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType === 'touch') return;
    if (currentTool !== 'pen' && currentTool !== 'highlighter' && currentTool !== 'eraser') {
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    activePointerId = e.pointerId;
    startTime = performance.now();

    if (currentTool === 'eraser') {
      const p = toPoint(e);
      onerase?.({ x: p.x, y: p.y });
      return;
    }

    points = [toPoint(e)];
    redrawLive();
    e.preventDefault();
  }

  function onPointerMove(e: PointerEvent) {
    if (activePointerId !== e.pointerId) return;
    if (currentTool === 'eraser') {
      const p = toPoint(e);
      onerase?.({ x: p.x, y: p.y });
      return;
    }
    if (currentTool !== 'pen' && currentTool !== 'highlighter') return;
    points.push(toPoint(e));
    redrawLive();
    e.preventDefault();
  }

  function finish(e: PointerEvent, commit: boolean) {
    if (activePointerId !== e.pointerId) return;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      // not captured; ignore
    }
    activePointerId = null;

    if (commit && (currentTool === 'pen' || currentTool === 'highlighter') && points.length > 0) {
      const stroke = strokeFromInput(points, currentStyle, currentTool);
      oncommit?.(stroke);
    }
    points = [];
    clear();
  }

  function onPointerUp(e: PointerEvent) {
    finish(e, true);
  }

  function onPointerCancel(e: PointerEvent) {
    finish(e, false);
  }

  onMount(clear);

  $effect(() => {
    void width;
    void height;
    if (canvas) redrawLive();
  });
</script>

<canvas
  bind:this={canvas}
  {width}
  {height}
  class="live-layer"
  style="width: {width}px; height: {height}px;"
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerCancel}
></canvas>

<style>
  .live-layer {
    position: absolute;
    inset: 0;
    touch-action: none;
    cursor: crosshair;
  }
</style>
