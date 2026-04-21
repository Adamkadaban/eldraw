<script lang="ts">
  import type { GraphObject } from '$lib/types';
  import { parseExpression, parseExpressionXY } from '$lib/graph/parser';
  import { plotFunction } from '$lib/graph/plotter';
  import { marchingSquares, stitchSegments } from '$lib/graph/implicit';
  import { drawGraphFrame } from '$lib/graph/render';
  import { resolveTheme, type GraphTheme } from '$lib/graph/theme';
  import { settings } from '$lib/store/settings';

  interface Props {
    graphs: GraphObject[];
    width: number;
    height: number;
    ptToPx: number;
    /** Override the settings-derived theme (used by the preview in settings). */
    theme?: GraphTheme;
  }

  let { graphs, width, height, ptToPx, theme: themeOverride }: Props = $props();

  let canvas: HTMLCanvasElement;

  const MAX_SAMPLES = 2048;
  const IMPLICIT_MAX_RES = 256;

  const resolvedTheme = $derived(
    themeOverride ??
      resolveTheme({
        graphTheme: $settings.graphTheme,
        graphOverrides: $settings.graphOverrides,
      }),
  );

  function dashFor(d: 'solid' | 'dashed' | 'dotted', strokeWidth: number): number[] {
    if (d === 'dashed') return [strokeWidth * 4, strokeWidth * 3];
    if (d === 'dotted') return [strokeWidth, strokeWidth * 2];
    return [];
  }

  function drawGraph(ctx: CanvasRenderingContext2D, g: GraphObject, theme: GraphTheme) {
    const px = g.bounds.x * ptToPx;
    const py = g.bounds.y * ptToPx;
    const pw = g.bounds.w * ptToPx;
    const ph = g.bounds.h * ptToPx;
    if (pw < 2 || ph < 2) return;

    const [x0, x1] = g.xRange;
    const [y0, y1] = g.yRange;
    if (x1 - x0 <= 0 || y1 - y0 <= 0) return;

    drawGraphFrame(ctx, {
      rect: { x: px, y: py, w: pw, h: ph },
      xRange: g.xRange,
      yRange: g.yRange,
      theme,
      gridStep: g.gridStep,
      showAxes: g.showAxes,
      showGrid: g.showGrid,
    });

    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, pw, ph);
    ctx.clip();

    const xToPx = (x: number) => px + ((x - x0) / (x1 - x0)) * pw;
    const yToPx = (y: number) => py + (1 - (y - y0) / (y1 - y0)) * ph;

    const samples = Math.min(MAX_SAMPLES, Math.max(64, Math.ceil(pw)));
    const implicitRes = Math.min(IMPLICIT_MAX_RES, Math.max(32, Math.ceil(pw / 4)));
    for (const fn of g.functions) {
      ctx.strokeStyle = fn.color;
      ctx.lineWidth = fn.width;
      ctx.setLineDash(dashFor(fn.dash, fn.width));
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      if (fn.kind === 'implicit') {
        const r = parseExpressionXY(fn.expr);
        if (!r.ok) continue;
        const segs = marchingSquares(r.fn, {
          xRange: g.xRange,
          yRange: g.yRange,
          resolution: implicitRes,
        });
        const polylines = stitchSegments(segs);
        for (const line of polylines) {
          if (line.length < 2) continue;
          ctx.beginPath();
          ctx.moveTo(xToPx(line[0].x), yToPx(line[0].y));
          for (let i = 1; i < line.length; i += 1) {
            ctx.lineTo(xToPx(line[i].x), yToPx(line[i].y));
          }
          ctx.stroke();
        }
        ctx.setLineDash([]);
        continue;
      }

      const result = parseExpression(fn.expr);
      if (!result.ok) continue;
      const segments = plotFunction(result.fn, {
        xRange: g.xRange,
        yRange: g.yRange,
        samples,
      });
      for (const seg of segments) {
        if (seg.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(xToPx(seg[0].x), yToPx(seg[0].y));
        for (let i = 1; i < seg.length; i += 1) {
          ctx.lineTo(xToPx(seg[i].x), yToPx(seg[i].y));
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    ctx.restore();
  }

  function redraw() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const theme = resolvedTheme;
    for (const g of graphs) drawGraph(ctx, g, theme);
  }

  $effect(() => {
    void graphs;
    void width;
    void height;
    void ptToPx;
    void resolvedTheme;
    redraw();
  });
</script>

<canvas
  bind:this={canvas}
  {width}
  {height}
  class="graph-layer"
  style="width: {width}px; height: {height}px;"
></canvas>

<style>
  .graph-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
</style>
