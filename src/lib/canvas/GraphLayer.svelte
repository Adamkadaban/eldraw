<script lang="ts">
  import type { GraphFunction, GraphObject, GraphParameter } from '$lib/types';
  import {
    parseExpression,
    parseExpressionWithParams,
    parseExpressionXY,
    parseExpressionXYWithParams,
    type ParameterizedFn,
    type ParameterizedFnXY,
  } from '$lib/graph/parser';
  import { clampParameter } from '$lib/graph/parameters';
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
  const explicitCache = new Map<
    string,
    { expr: string; parameterNames: string; compiled: ParameterizedFn }
  >();
  const implicitCache = new Map<
    string,
    { expr: string; parameterNames: string; compiled: ParameterizedFnXY }
  >();

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

  function formatParameterValue(value: number): string {
    return Number(value.toPrecision(8)).toString();
  }

  function drawParameterChips(
    ctx: CanvasRenderingContext2D,
    parameters: readonly GraphParameter[],
    rect: { x: number; y: number; w: number; h: number },
    theme: GraphTheme,
  ): void {
    const visible = parameters.filter((parameter) => parameter.showChip);
    if (visible.length === 0) return;

    const paddingX = 6;
    const chipHeight = Math.max(18, theme.labelFontSize + 8);
    const gap = 4;
    let y = rect.y + 8;

    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    ctx.font = `${Math.max(10, theme.labelFontSize)}px ${theme.labelFontFamily}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    for (const parameter of visible) {
      if (y + chipHeight > rect.y + rect.h - 4) break;
      const label = `${parameter.name} = ${formatParameterValue(parameter.value)}`;
      const chipWidth = ctx.measureText(label).width + paddingX * 2;
      const x = rect.x + 8;

      ctx.globalAlpha = 0.92;
      ctx.fillStyle = theme.background;
      ctx.fillRect(x, y, chipWidth, chipHeight);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = theme.frameEnabled ? theme.frameColor : theme.axisColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, chipWidth - 1, chipHeight - 1);
      ctx.fillStyle = theme.labelColor;
      ctx.fillText(label, x + paddingX, y + chipHeight / 2);
      y += chipHeight + gap;
    }
    ctx.restore();
  }

  function parameterNamesKey(parameters: readonly GraphParameter[]): string {
    return parameters.map((parameter) => parameter.name).join('\u0000');
  }

  function parameterizedExplicit(
    graphId: string,
    fn: GraphFunction,
    parameters: readonly GraphParameter[],
  ): ParameterizedFn | null {
    const key = `${graphId}\u0000${fn.id}`;
    const names = parameterNamesKey(parameters);
    let cached = explicitCache.get(key);
    if (!cached || cached.expr !== fn.expr || cached.parameterNames !== names) {
      const result = parseExpressionWithParams(fn.expr, parameters);
      if (!result.ok) {
        explicitCache.delete(key);
        return null;
      }
      cached = { expr: fn.expr, parameterNames: names, compiled: result.compiled };
      explicitCache.set(key, cached);
    }
    for (const parameter of parameters) {
      cached.compiled.setParameter(parameter.name, parameter.value);
    }
    return cached.compiled;
  }

  function parameterizedImplicit(
    graphId: string,
    fn: GraphFunction,
    parameters: readonly GraphParameter[],
  ): ParameterizedFnXY | null {
    const key = `${graphId}\u0000${fn.id}`;
    const names = parameterNamesKey(parameters);
    let cached = implicitCache.get(key);
    if (!cached || cached.expr !== fn.expr || cached.parameterNames !== names) {
      const result = parseExpressionXYWithParams(fn.expr, parameters);
      if (!result.ok) {
        implicitCache.delete(key);
        return null;
      }
      cached = { expr: fn.expr, parameterNames: names, compiled: result.compiled };
      implicitCache.set(key, cached);
    }
    for (const parameter of parameters) {
      cached.compiled.setParameter(parameter.name, parameter.value);
    }
    return cached.compiled;
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
    const parameters = g.parameters?.length
      ? g.parameters.map((parameter) => clampParameter(parameter))
      : null;
    for (const fn of g.functions) {
      ctx.strokeStyle = fn.color;
      ctx.lineWidth = fn.width;
      ctx.setLineDash(dashFor(fn.dash, fn.width));
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      if (fn.kind === 'implicit') {
        const compiledFn = parameters
          ? parameterizedImplicit(g.id, fn, parameters)?.fn
          : (() => {
              const result = parseExpressionXY(fn.expr);
              return result.ok ? result.fn : null;
            })();
        if (!compiledFn) continue;
        const segs = marchingSquares(compiledFn, {
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

      const compiledFn = parameters
        ? parameterizedExplicit(g.id, fn, parameters)?.fn
        : (() => {
            const result = parseExpression(fn.expr);
            return result.ok ? result.fn : null;
          })();
      if (!compiledFn) continue;
      const segments = plotFunction(compiledFn, {
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
    if (parameters) {
      drawParameterChips(ctx, parameters, { x: px, y: py, w: pw, h: ph }, theme);
    }
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
