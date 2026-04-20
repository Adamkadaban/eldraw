<script lang="ts">
  import type { GraphObject } from '$lib/types';
  import { parseExpression } from '$lib/graph/parser';
  import { plotFunction } from '$lib/graph/plotter';

  interface Props {
    graphs: GraphObject[];
    width: number;
    height: number;
    ptToPx: number;
  }

  let { graphs, width, height, ptToPx }: Props = $props();

  let canvas: HTMLCanvasElement;

  const AXIS_COLOR = '#444';
  const GRID_COLOR = '#d8d8d8';
  const FRAME_COLOR = '#888';
  const MAX_SAMPLES = 2048;

  function dashFor(d: 'solid' | 'dashed' | 'dotted', strokeWidth: number): number[] {
    if (d === 'dashed') return [strokeWidth * 4, strokeWidth * 3];
    if (d === 'dotted') return [strokeWidth, strokeWidth * 2];
    return [];
  }

  function drawGraph(ctx: CanvasRenderingContext2D, g: GraphObject) {
    const px = g.bounds.x * ptToPx;
    const py = g.bounds.y * ptToPx;
    const pw = g.bounds.w * ptToPx;
    const ph = g.bounds.h * ptToPx;
    if (pw < 2 || ph < 2) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, pw, ph);
    ctx.clip();

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(px, py, pw, ph);

    const [x0, x1] = g.xRange;
    const [y0, y1] = g.yRange;
    const xSpan = x1 - x0;
    const ySpan = y1 - y0;
    if (xSpan <= 0 || ySpan <= 0) {
      ctx.restore();
      return;
    }

    const xToPx = (x: number) => px + ((x - x0) / xSpan) * pw;
    const yToPx = (y: number) => py + (1 - (y - y0) / ySpan) * ph;

    if (g.showGrid && g.gridStep > 0) {
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const startX = Math.ceil(x0 / g.gridStep) * g.gridStep;
      for (let x = startX; x <= x1 + 1e-9; x += g.gridStep) {
        const sx = xToPx(x);
        ctx.moveTo(sx, py);
        ctx.lineTo(sx, py + ph);
      }
      const startY = Math.ceil(y0 / g.gridStep) * g.gridStep;
      for (let y = startY; y <= y1 + 1e-9; y += g.gridStep) {
        const sy = yToPx(y);
        ctx.moveTo(px, sy);
        ctx.lineTo(px + pw, sy);
      }
      ctx.stroke();
    }

    if (g.showAxes) {
      ctx.strokeStyle = AXIS_COLOR;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      if (y0 <= 0 && y1 >= 0) {
        const axisY = yToPx(0);
        ctx.moveTo(px, axisY);
        ctx.lineTo(px + pw, axisY);
      }
      if (x0 <= 0 && x1 >= 0) {
        const axisX = xToPx(0);
        ctx.moveTo(axisX, py);
        ctx.lineTo(axisX, py + ph);
      }
      ctx.stroke();
    }

    const samples = Math.min(MAX_SAMPLES, Math.max(64, Math.ceil(pw)));
    for (const fn of g.functions) {
      const result = parseExpression(fn.expr);
      if (!result.ok) continue;
      const segments = plotFunction(result.fn, {
        xRange: g.xRange,
        yRange: g.yRange,
        samples,
      });
      ctx.strokeStyle = fn.color;
      ctx.lineWidth = fn.width;
      ctx.setLineDash(dashFor(fn.dash, fn.width));
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
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

    ctx.strokeStyle = FRAME_COLOR;
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
  }

  function redraw() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const g of graphs) drawGraph(ctx, g);
  }

  $effect(() => {
    void graphs;
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
