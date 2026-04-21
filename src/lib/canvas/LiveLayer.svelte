<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { Point, StrokeObject, StrokeStyle, ToolKind } from '$lib/types';
  import { toolStore } from '$lib/store/tool';
  import { strokeFromInput } from '$lib/tools/pen';
  import { drawLiveStroke } from './strokeRenderer';
  import { cursorForTool } from './cursors';
  import { log } from '$lib/log';
  import { snapPointToRuler, snapStrokeToRuler, type RulerState } from '$lib/geometry/ruler';

  interface Props {
    width: number;
    height: number;
    ptToPx: number;
    rulerSnap?: RulerState | null;
    rulerSnapThresholdPx?: number;
    penStreamline?: number;
    highlighterStreamline?: number;
    oncommit?: (stroke: StrokeObject) => void;
    onerase?: (at: { x: number; y: number }) => void;
    ongraph?: (bounds: { x: number; y: number; w: number; h: number }) => void;
  }

  let {
    width,
    height,
    ptToPx,
    rulerSnap = null,
    rulerSnapThresholdPx = 12,
    penStreamline,
    highlighterStreamline,
    oncommit,
    onerase,
    ongraph,
  }: Props = $props();

  let graphStart: { x: number; y: number } | null = null;
  let graphEnd: { x: number; y: number } | null = null;
  const MIN_GRAPH_SIZE_PT = 8;

  let canvas: HTMLCanvasElement;
  let activePointerId: number | null = null;
  let startTime = 0;
  let points: Point[] = [];
  let currentTool: ToolKind = $state('pen');
  let currentStyle: StrokeStyle = {
    color: '#000',
    width: 2,
    dash: 'solid',
    opacity: 1,
  };

  const unsubscribeTool = toolStore.subscribe((s) => {
    currentTool = s.tool;
    currentStyle = s.style;
    log('tool', `live-layer sees tool=${s.tool}`, s.style);
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
    graphStart = null;
    graphEnd = null;
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

  function maybeSnap(p: Point): Point {
    if (!rulerSnap) return p;
    if (currentTool !== 'pen' && currentTool !== 'highlighter') return p;
    const thresholdPt = rulerSnapThresholdPx / ptToPx;
    const res = snapPointToRuler(p, rulerSnap, thresholdPt);
    if (!res.snapped) return p;
    return { ...p, x: res.point.x, y: res.point.y };
  }

  function redrawLive() {
    const c = ctx();
    if (!c) return;
    clear();
    if (currentTool === 'highlighter') {
      c.globalCompositeOperation = 'multiply';
      drawLiveStroke(c, points, currentStyle, 'highlighter', ptToPx, highlighterStreamline);
    } else if (currentTool === 'pen') {
      c.globalCompositeOperation = 'source-over';
      drawLiveStroke(c, points, currentStyle, 'pen', ptToPx, penStreamline);
    } else if (currentTool === 'graph' && graphStart && graphEnd) {
      drawGraphRect(c);
    }
  }

  function drawGraphRect(c: CanvasRenderingContext2D) {
    if (!graphStart || !graphEnd) return;
    const x = Math.min(graphStart.x, graphEnd.x) * ptToPx;
    const y = Math.min(graphStart.y, graphEnd.y) * ptToPx;
    const w = Math.abs(graphEnd.x - graphStart.x) * ptToPx;
    const h = Math.abs(graphEnd.y - graphStart.y) * ptToPx;
    c.globalCompositeOperation = 'source-over';
    c.strokeStyle = '#1e88e5';
    c.fillStyle = 'rgba(30, 136, 229, 0.08)';
    c.lineWidth = 1;
    c.setLineDash([6, 4]);
    c.fillRect(x, y, w, h);
    c.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));
    c.setLineDash([]);
  }

  function onPointerDown(e: PointerEvent) {
    log('live', `pointerdown tool=${currentTool} type=${e.pointerType} id=${e.pointerId}`);
    if (e.pointerType === 'touch') return;
    if (
      currentTool !== 'pen' &&
      currentTool !== 'highlighter' &&
      currentTool !== 'eraser' &&
      currentTool !== 'graph'
    ) {
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

    if (currentTool === 'graph') {
      const p = toPoint(e);
      graphStart = { x: p.x, y: p.y };
      graphEnd = { x: p.x, y: p.y };
      redrawLive();
      e.preventDefault();
      return;
    }

    points = [maybeSnap(toPoint(e))];
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
    if (currentTool === 'graph') {
      const p = toPoint(e);
      graphEnd = { x: p.x, y: p.y };
      redrawLive();
      e.preventDefault();
      return;
    }
    if (currentTool !== 'pen' && currentTool !== 'highlighter') return;
    points.push(maybeSnap(toPoint(e)));
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
      const finalPoints = rulerSnap
        ? snapStrokeToRuler(points, rulerSnap, rulerSnapThresholdPx / ptToPx)
        : points;
      const bakedStreamline = currentTool === 'highlighter' ? highlighterStreamline : penStreamline;
      const stroke = strokeFromInput(finalPoints, currentStyle, currentTool, bakedStreamline);
      log('live', `commit ${currentTool} stroke points=${points.length}`);
      oncommit?.(stroke);
    }
    if (commit && currentTool === 'graph' && graphStart && graphEnd) {
      const x = Math.min(graphStart.x, graphEnd.x);
      const y = Math.min(graphStart.y, graphEnd.y);
      const w = Math.abs(graphEnd.x - graphStart.x);
      const h = Math.abs(graphEnd.y - graphStart.y);
      if (w >= MIN_GRAPH_SIZE_PT && h >= MIN_GRAPH_SIZE_PT) {
        ongraph?.({ x, y, w, h });
      }
    }
    points = [];
    graphStart = null;
    graphEnd = null;
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
  style="width: {width}px; height: {height}px; cursor: {cursorForTool(currentTool)};"
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerCancel}
></canvas>

<style>
  .live-layer {
    position: absolute;
    inset: 0;
    pointer-events: auto;
    touch-action: none;
  }
</style>
