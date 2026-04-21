<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { Point, StrokeStyle } from '$lib/types';
  import {
    createTempStroke,
    fadeOpacity,
    pruneStrokes,
    type TempInkStroke,
  } from '$lib/tools/tempInk';
  import { drawLiveStroke } from './strokeRenderer';

  interface Props {
    width: number;
    height: number;
    ptToPx: number;
    active: boolean;
    style: StrokeStyle;
    fadeMs: number;
    streamline?: number;
  }

  let { width, height, ptToPx, active, style, fadeMs, streamline }: Props = $props();

  let canvas: HTMLCanvasElement;
  let strokes: TempInkStroke[] = [];
  let liveStyle: StrokeStyle = { color: '#000', width: 2, dash: 'solid', opacity: 1 };
  let livePoints: Point[] = [];
  let activePointerId: number | null = null;
  let startTime = 0;
  let rafId: number | null = null;

  function ctx(): CanvasRenderingContext2D | null {
    return canvas?.getContext('2d') ?? null;
  }

  function clear() {
    const c = ctx();
    if (!c || !canvas) return;
    c.clearRect(0, 0, canvas.width, canvas.height);
  }

  function frame() {
    const c = ctx();
    if (!c || !canvas) return;
    const now = performance.now();
    strokes = pruneStrokes(strokes, now);
    clear();

    c.save();
    for (const s of strokes) {
      const a = fadeOpacity(s, now);
      if (a <= 0) continue;
      c.globalAlpha = a * s.style.opacity;
      drawLiveStroke(c, s.points, { ...s.style, opacity: 1 }, 'pen', ptToPx, streamline);
    }
    c.restore();

    if (livePoints.length > 0) {
      c.save();
      c.globalAlpha = liveStyle.opacity;
      drawLiveStroke(c, livePoints, { ...liveStyle, opacity: 1 }, 'pen', ptToPx, streamline);
      c.restore();
    }

    if (strokes.length === 0 && livePoints.length === 0) {
      rafId = null;
      return;
    }
    rafId = requestAnimationFrame(frame);
  }

  function ensureRaf() {
    if (rafId === null) rafId = requestAnimationFrame(frame);
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

  function onPointerDown(e: PointerEvent) {
    if (!active) return;
    if (e.pointerType === 'touch') return;
    canvas.setPointerCapture(e.pointerId);
    activePointerId = e.pointerId;
    startTime = performance.now();
    liveStyle = { ...style };
    livePoints = [toPoint(e)];
    ensureRaf();
    e.preventDefault();
  }

  function onPointerMove(e: PointerEvent) {
    if (!active || activePointerId !== e.pointerId) return;
    livePoints.push(toPoint(e));
    ensureRaf();
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

    if (commit && livePoints.length > 0) {
      const stroke = createTempStroke(livePoints, liveStyle, fadeMs, performance.now());
      strokes = [...strokes, stroke];
    }
    livePoints = [];
    ensureRaf();
  }

  function onPointerUp(e: PointerEvent) {
    finish(e, true);
  }

  function onPointerCancel(e: PointerEvent) {
    finish(e, false);
  }

  $effect(() => {
    if (!active) {
      livePoints = [];
      activePointerId = null;
      ensureRaf();
    }
  });

  $effect(() => {
    void width;
    void height;
    void ptToPx;
    if (canvas) ensureRaf();
  });

  onMount(clear);

  onDestroy(() => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    strokes = [];
    livePoints = [];
  });
</script>

<canvas
  bind:this={canvas}
  {width}
  {height}
  class="temp-ink-layer"
  class:active
  style="width: {width}px; height: {height}px;"
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerCancel}
></canvas>

<style>
  .temp-ink-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
    touch-action: none;
  }
  .temp-ink-layer.active {
    pointer-events: auto;
    cursor: crosshair;
  }
</style>
