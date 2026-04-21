<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { LineObject, Point, StrokeObject, StrokeStyle, ToolKind } from '$lib/types';
  import { toolStore } from '$lib/store/tool';
  import { strokeFromInput } from '$lib/tools/pen';
  import { drawLiveStroke } from './strokeRenderer';
  import { drawLine } from './objectRenderer';
  import { cursorForTool } from './cursors';
  import { log } from '$lib/log';
  import { snapPointToRuler, snapStrokeToRuler, type RulerState } from '$lib/geometry/ruler';
  import { createRafBatcher, type Batcher } from './inkBatch';
  import { createOneEuroFilter, stabilizationToConfig, type OneEuroFilter } from './stabilizer';
  import {
    buildStraightEdgeLine,
    buildStraightEdgeStroke,
    decideStraightEdgeCommit,
    straightEdgeEndpoint,
    DEFAULT_STRAIGHT_EDGE_SNAP_STEP,
  } from '$lib/tools/straightEdge';

  interface Props {
    width: number;
    height: number;
    ptToPx: number;
    rulerSnap?: RulerState | null;
    rulerSnapThresholdPx?: number;
    penStabilization?: number;
    highlighterStabilization?: number;
    straightEdgeSnapStep?: number;
    oncommit?: (stroke: StrokeObject) => void;
    oncommitline?: (line: LineObject) => void;
    onerase?: (samples: { x: number; y: number }[]) => void;
    ongraph?: (bounds: { x: number; y: number; w: number; h: number }) => void;
  }

  let {
    width,
    height,
    ptToPx,
    rulerSnap = null,
    rulerSnapThresholdPx = 12,
    penStabilization = 0,
    highlighterStabilization = 0,
    straightEdgeSnapStep = DEFAULT_STRAIGHT_EDGE_SNAP_STEP,
    oncommit,
    oncommitline,
    onerase,
    ongraph,
  }: Props = $props();

  const MIN_GRAPH_SIZE_PT = 8;
  const HAS_RAW_UPDATE = typeof window !== 'undefined' && 'onpointerrawupdate' in window;

  let graphStart: { x: number; y: number } | null = null;
  let graphEnd: { x: number; y: number } | null = null;

  let canvas: HTMLCanvasElement;
  let ctx2d: CanvasRenderingContext2D | null = null;
  let activePointerId: number | null = null;
  let startTime = 0;
  let points: Point[] = [];
  let predictedTail: Point[] = [];
  let shiftHeld = false;
  let altHeld = false;
  let currentTool: ToolKind = $state('pen');
  let currentStyle: StrokeStyle = {
    color: '#000',
    width: 2,
    dash: 'solid',
    opacity: 1,
  };

  type Sample = { point: Point; predicted: Point[] };
  let batcher: Batcher<Sample> | null = null;
  let stabilizer: OneEuroFilter | null = null;

  const debugEnabled =
    typeof window !== 'undefined' &&
    (new URLSearchParams(window.location.search).get('inkdebug') === '1' ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('eldrawInkDebug') === '1'));
  let debugInfo = $state({ hz: 0, frameMs: 0, coalesced: 0, predicted: 0 });
  let debugWindow: number[] = [];
  let debugLastFrameTs = 0;

  const unsubscribeTool = toolStore.subscribe((s) => {
    currentTool = s.tool;
    currentStyle = s.style;
    log('tool', `live-layer sees tool=${s.tool}`, s.style);
  });
  onDestroy(() => {
    unsubscribeTool();
    batcher?.cancel();
  });

  function ensureCtx(): CanvasRenderingContext2D | null {
    if (ctx2d) return ctx2d;
    if (!canvas) return null;
    // desynchronized: true is a meaningful latency win for inking because it
    // lets the browser bypass the compositor for this canvas. alpha: true so
    // we can sit on top of the static ink layer without an opaque background.
    ctx2d = canvas.getContext('2d', {
      alpha: true,
      desynchronized: true,
      willReadFrequently: false,
    });
    return ctx2d;
  }

  function clear() {
    const c = ensureCtx();
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
    predictedTail = [];
    graphStart = null;
    graphEnd = null;
    shiftHeld = false;
    altHeld = false;
    stabilizer = null;
    batcher?.cancel();
    clear();
  }

  function toPoint(e: PointerEvent): Point {
    return toPointWithRect(e, canvas.getBoundingClientRect());
  }

  function toPointWithRect(e: PointerEvent, rect: DOMRect): Point {
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const pressure = e.pressure > 0 ? e.pressure : 0.5;
    return {
      x: px / ptToPx,
      y: py / ptToPx,
      pressure,
      t: e.timeStamp - startTime,
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

  function stabilizationAmount(): number {
    if (currentTool === 'highlighter') return highlighterStabilization;
    if (currentTool === 'pen') return penStabilization;
    return 0;
  }

  function applyStabilizer(p: Point): Point {
    if (!stabilizer) return p;
    const out = stabilizer.filter({ x: p.x, y: p.y }, p.t);
    if (out.x === p.x && out.y === p.y) return p;
    return { ...p, x: out.x, y: out.y };
  }

  function straightEdgeActive(): boolean {
    if (!shiftHeld) return false;
    if (rulerSnap) return false;
    if (currentTool !== 'pen' && currentTool !== 'highlighter') return false;
    return points.length > 0;
  }

  function drawStraightPreview(c: CanvasRenderingContext2D) {
    const first = points[0];
    const last = points[points.length - 1];
    const to = straightEdgeEndpoint({
      start: { x: first.x, y: first.y },
      current: { x: last.x, y: last.y },
      snapStepDeg: straightEdgeSnapStep,
      bypassSnap: altHeld,
    });
    const preview: LineObject = {
      id: 'live-straight',
      createdAt: 0,
      type: 'line',
      style: currentStyle,
      from: { x: first.x, y: first.y },
      to,
      arrow: { start: false, end: false },
    };
    drawLine(c, preview, ptToPx);
  }

  function redrawLive() {
    const c = ensureCtx();
    if (!c) return;
    clear();
    if (currentTool === 'highlighter') {
      if (straightEdgeActive()) {
        c.globalCompositeOperation = 'multiply';
        drawStraightPreview(c);
      } else {
        c.globalCompositeOperation = 'multiply';
        const tail = points.concat(predictedTail);
        drawLiveStroke(c, tail, currentStyle, 'highlighter', ptToPx);
      }
    } else if (currentTool === 'pen') {
      c.globalCompositeOperation = 'source-over';
      if (straightEdgeActive()) {
        drawStraightPreview(c);
      } else {
        const tail = points.concat(predictedTail);
        drawLiveStroke(c, tail, currentStyle, 'pen', ptToPx);
      }
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

  function ensureBatcher(): Batcher<Sample> {
    if (batcher) return batcher;
    batcher = createRafBatcher<Sample>((samples) => {
      // Committed strokes live on InkLayer/HighlightLayer; we only redraw the
      // active stroke on this canvas. Reference: Excalidraw splits live vs
      // committed the same way (see packages/excalidraw/renderer).
      const t0 = performance.now();
      let latestPredicted: Point[] = [];
      for (const s of samples) {
        points.push(s.point);
        if (s.predicted.length > 0) latestPredicted = s.predicted;
      }
      predictedTail = latestPredicted;
      redrawLive();

      if (debugEnabled) {
        const now = performance.now();
        debugWindow.push(now);
        const cutoff = now - 1000;
        while (debugWindow.length > 0 && debugWindow[0] < cutoff) debugWindow.shift();
        debugInfo = {
          hz: debugWindow.length,
          frameMs: Math.round(now - t0),
          coalesced: samples.length,
          predicted: latestPredicted.length,
        };
        if (debugLastFrameTs !== 0) {
          // keep the most recent frame interval visible in the overlay
          debugInfo.frameMs = Math.round(now - debugLastFrameTs);
        }
        debugLastFrameTs = now;
      }
    });
    return batcher;
  }

  function coalescedPoints(e: PointerEvent, rect: DOMRect): Point[] {
    const native = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    if (!native || native.length === 0)
      return [applyStabilizer(maybeSnap(toPointWithRect(e, rect)))];
    const out: Point[] = [];
    for (const c of native) out.push(applyStabilizer(maybeSnap(toPointWithRect(c, rect))));
    return out;
  }

  function predictedPoints(e: PointerEvent, rect: DOMRect): Point[] {
    const native = typeof e.getPredictedEvents === 'function' ? e.getPredictedEvents() : [];
    if (!native || native.length === 0) return [];
    const out: Point[] = [];
    for (const c of native) out.push(maybeSnap(toPointWithRect(c, rect)));
    return out;
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
    startTime = e.timeStamp;
    predictedTail = [];
    shiftHeld = e.shiftKey;
    altHeld = e.altKey;

    if (currentTool === 'eraser') {
      const p = toPoint(e);
      onerase?.([{ x: p.x, y: p.y }]);
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

    stabilizer = createOneEuroFilter(stabilizationToConfig(stabilizationAmount()));
    points = [applyStabilizer(maybeSnap(toPoint(e)))];
    redrawLive();
    e.preventDefault();
  }

  function handleMoveLike(e: PointerEvent) {
    if (activePointerId !== e.pointerId) return;
    shiftHeld = e.shiftKey;
    altHeld = e.altKey;
    const rect = canvas.getBoundingClientRect();
    if (currentTool === 'eraser') {
      const coalesced = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
      const events = coalesced && coalesced.length > 0 ? coalesced : [e];
      const samples: { x: number; y: number }[] = [];
      for (const ev of events) {
        const p = toPointWithRect(ev, rect);
        samples.push({ x: p.x, y: p.y });
      }
      onerase?.(samples);
      return;
    }
    if (currentTool === 'graph') {
      const p = toPointWithRect(e, rect);
      graphEnd = { x: p.x, y: p.y };
      redrawLive();
      e.preventDefault();
      return;
    }
    if (currentTool !== 'pen' && currentTool !== 'highlighter') return;

    const cps = coalescedPoints(e, rect);
    const predicted = predictedPoints(e, rect);
    const b = ensureBatcher();
    // getCoalescedEvents can return 10+ samples for a single pointermove at
    // high stylus rates; we flatten them into the batcher so every sample is
    // smoothed and rendered, but we still only paint once per frame.
    for (let i = 0; i < cps.length; i++) {
      const isLast = i === cps.length - 1;
      b.push({ point: cps[i], predicted: isLast ? predicted : [] });
    }
    e.preventDefault();
  }

  function onPointerMove(e: PointerEvent) {
    // When pointerrawupdate is available we prefer it for sub-frame resolution.
    // Fall back to pointermove transparently on browsers that lack it.
    if (HAS_RAW_UPDATE && (currentTool === 'pen' || currentTool === 'highlighter')) return;
    handleMoveLike(e);
  }

  function onPointerRawUpdate(e: PointerEvent) {
    if (!HAS_RAW_UPDATE) return;
    // Raw updates are only consumed for pen/highlighter; eraser/graph/shape
    // and all other tools continue to use pointermove. Without this gate,
    // both listeners would fire for every motion event and double-handle
    // erase samples and graph rect updates.
    if (currentTool !== 'pen' && currentTool !== 'highlighter') return;
    handleMoveLike(e);
  }

  function finish(e: PointerEvent, commit: boolean) {
    if (activePointerId !== e.pointerId) return;
    shiftHeld = e.shiftKey;
    altHeld = e.altKey;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      // not captured; ignore
    }
    activePointerId = null;

    // Drain any samples still queued in the batcher before we commit so the
    // final stroke contains every input sample.
    batcher?.flushNow();
    predictedTail = [];

    if (commit && (currentTool === 'pen' || currentTool === 'highlighter') && points.length > 0) {
      const first = points[0];
      const last = points[points.length - 1];
      const decision = decideStraightEdgeCommit({
        shiftAtPointerUp: shiftHeld,
        altAtPointerUp: altHeld,
        rulerActive: rulerSnap !== null,
        tool: currentTool,
        first: { x: first.x, y: first.y },
        last: { x: last.x, y: last.y },
        style: currentStyle,
        snapStepDeg: straightEdgeSnapStep,
      });
      if (decision.kind === 'line') {
        const line = buildStraightEdgeLine(
          crypto.randomUUID(),
          Date.now(),
          decision.from,
          decision.to,
          currentStyle,
        );
        log('live', `commit straight-edge ${currentTool} tool`);
        oncommitline?.(line);
      } else if (decision.kind === 'stroke') {
        const stroke = buildStraightEdgeStroke(
          crypto.randomUUID(),
          Date.now(),
          decision.from,
          decision.to,
          currentStyle,
        );
        log('live', `commit straight-edge ${currentTool} tool`);
        oncommit?.(stroke);
      } else {
        const snapped = rulerSnap
          ? snapStrokeToRuler(points, rulerSnap, rulerSnapThresholdPx / ptToPx)
          : points;
        const stroke = strokeFromInput(snapped, currentStyle, currentTool);
        log('live', `commit ${currentTool} points=${snapped.length}`);
        oncommit?.(stroke);
      }
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
    shiftHeld = false;
    altHeld = false;
    stabilizer = null;
    clear();
  }

  function onPointerUp(e: PointerEvent) {
    finish(e, true);
  }

  function onPointerCancel(e: PointerEvent) {
    finish(e, false);
  }

  onMount(() => {
    clear();
    if (HAS_RAW_UPDATE && canvas) {
      canvas.addEventListener('pointerrawupdate', onPointerRawUpdate as (e: Event) => void);
    }
  });

  onDestroy(() => {
    if (HAS_RAW_UPDATE && canvas) {
      canvas.removeEventListener('pointerrawupdate', onPointerRawUpdate as (e: Event) => void);
    }
  });

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

{#if debugEnabled}
  <div class="ink-debug">
    <div>flush/s: {debugInfo.hz}</div>
    <div>frame: {debugInfo.frameMs}ms</div>
    <div>coalesced: {debugInfo.coalesced}</div>
    <div>predicted: {debugInfo.predicted}</div>
    <div>raw: {HAS_RAW_UPDATE ? 'on' : 'off'}</div>
  </div>
{/if}

<style>
  .live-layer {
    position: absolute;
    inset: 0;
    pointer-events: auto;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
  }
  .ink-debug {
    position: absolute;
    top: 4px;
    right: 4px;
    z-index: 100;
    padding: 4px 6px;
    font:
      10px/1.3 ui-monospace,
      monospace;
    color: #fff;
    background: rgba(0, 0, 0, 0.6);
    border-radius: 3px;
    pointer-events: none;
    white-space: nowrap;
  }
</style>
