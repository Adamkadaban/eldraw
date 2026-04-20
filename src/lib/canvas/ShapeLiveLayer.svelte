<script lang="ts">
  import { onDestroy } from 'svelte';
  import type {
    LineObject,
    NumberLineObject,
    ShapeObject,
    StrokeStyle,
    ToolKind,
  } from '$lib/types';
  import { toolStore } from '$lib/store/tool';
  import { currentStyle } from '$lib/store/sidebar';
  import { normalizeBounds } from '$lib/tools/shapes';
  import { drawLine, drawNumberLine, drawShape } from './objectRenderer';

  interface Props {
    width: number;
    height: number;
    ptToPx: number;
    oncommit?: (obj: LineObject | ShapeObject | NumberLineObject) => void;
  }

  let { width, height, ptToPx, oncommit }: Props = $props();

  type DragKind = 'line' | 'rect' | 'ellipse' | 'numberline';
  function isDragKind(t: ToolKind): t is DragKind {
    return t === 'line' || t === 'rect' || t === 'ellipse' || t === 'numberline';
  }

  let canvas: HTMLCanvasElement;
  let activePointerId: number | null = null;
  let start = { x: 0, y: 0 };
  let end = { x: 0, y: 0 };
  let currentTool: ToolKind = 'pen';
  let style: StrokeStyle = { color: '#000', width: 2, dash: 'solid', opacity: 1 };

  const unsubTool = toolStore.subscribe((s) => {
    currentTool = s.tool;
  });
  const unsubStyle = currentStyle.subscribe((s) => {
    style = s;
  });
  onDestroy(() => {
    unsubTool();
    unsubStyle();
  });

  const isActive = $derived(isDragKind(currentTool));

  function ctx(): CanvasRenderingContext2D | null {
    return canvas?.getContext('2d') ?? null;
  }

  function clear() {
    const c = ctx();
    if (!c) return;
    c.clearRect(0, 0, canvas.width, canvas.height);
  }

  function toPagePoint(e: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / ptToPx, y: (e.clientY - rect.top) / ptToPx };
  }

  function previewObject(): LineObject | ShapeObject | NumberLineObject | null {
    if (!isDragKind(currentTool)) return null;
    if (currentTool === 'line') {
      return {
        id: 'preview',
        createdAt: 0,
        type: 'line',
        style,
        from: { ...start },
        to: { ...end },
        arrow: { start: false, end: false },
      };
    }
    if (currentTool === 'numberline') {
      const length = end.x - start.x;
      return {
        id: 'preview',
        createdAt: 0,
        type: 'numberline',
        style,
        from: { x: Math.min(start.x, end.x), y: start.y },
        length: Math.abs(length),
        min: -5,
        max: 5,
        tickStep: 1,
        labelStep: 1,
        marks: [],
      };
    }
    return {
      id: 'preview',
      createdAt: 0,
      type: 'shape',
      kind: currentTool,
      style,
      fill: null,
      bounds: normalizeBounds(start, end),
    };
  }

  function redraw() {
    const c = ctx();
    if (!c) return;
    clear();
    const obj = previewObject();
    if (!obj) return;
    if (obj.type === 'line') drawLine(c, obj, ptToPx);
    else if (obj.type === 'shape') drawShape(c, obj, ptToPx);
    else drawNumberLine(c, obj, ptToPx);
  }

  function commit(): void {
    const obj = previewObject();
    if (!obj) return;
    const id = crypto.randomUUID();
    if (obj.type === 'shape' && (obj.bounds.w < 1 || obj.bounds.h < 1)) return;
    if (obj.type === 'line') {
      const dx = obj.to.x - obj.from.x;
      const dy = obj.to.y - obj.from.y;
      if (Math.hypot(dx, dy) < 1) return;
    }
    if (obj.type === 'numberline' && obj.length < 4) return;
    oncommit?.({ ...obj, id, createdAt: Date.now() });
  }

  function onPointerDown(e: PointerEvent) {
    if (!isActive) return;
    if (e.pointerType === 'touch') return;
    canvas.setPointerCapture(e.pointerId);
    activePointerId = e.pointerId;
    start = toPagePoint(e);
    end = { ...start };
    redraw();
    e.preventDefault();
  }

  function onPointerMove(e: PointerEvent) {
    if (activePointerId !== e.pointerId) return;
    end = toPagePoint(e);
    redraw();
    e.preventDefault();
  }

  function finish(e: PointerEvent, doCommit: boolean) {
    if (activePointerId !== e.pointerId) return;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      // not captured
    }
    activePointerId = null;
    if (doCommit) commit();
    clear();
  }

  function onPointerUp(e: PointerEvent) {
    finish(e, true);
  }

  function onPointerCancel(e: PointerEvent) {
    finish(e, false);
  }
</script>

<canvas
  bind:this={canvas}
  {width}
  {height}
  class="shape-live"
  class:inactive={!isActive}
  style="width: {width}px; height: {height}px;"
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerCancel}
></canvas>

<style>
  .shape-live {
    position: absolute;
    inset: 0;
    touch-action: none;
    cursor: crosshair;
  }
  .shape-live.inactive {
    pointer-events: none;
  }
</style>
