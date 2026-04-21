/**
 * Canvas rendering of axes/grid/labels for a graph object. Split out from
 * `GraphLayer.svelte` so the settings preview can reuse the exact same
 * styling rules.
 *
 * Inputs are pure data (`GraphTheme` + rectangle + ranges). The function
 * mutates the supplied 2D context but restores its state on exit.
 */

import { generateTicks, formatTick, cappedStep, niceStep } from './axes';
import type { GraphTheme } from './theme';

export interface GraphRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DrawFrameOptions {
  rect: GraphRect;
  xRange: [number, number];
  yRange: [number, number];
  theme: GraphTheme;
  /** Explicit grid step in graph units. `null`/`0` ⇒ derive from range. */
  gridStep?: number | null;
  showAxes: boolean;
  showGrid: boolean;
}

const TARGET_MAJOR_TICKS = 8;
const MAX_GRID_LINES_PER_AXIS = 200;
const LABEL_PAD = 3;
const ARROW_LEN = 8;
const ARROW_HALF = 3.5;

export function snapLine(v: number, width: number): number {
  const integral = Math.round(width);
  if (Math.abs(width - integral) < 0.05 && integral % 2 === 1) {
    return Math.round(v) + 0.5;
  }
  return Math.round(v);
}

function withAlpha(ctx: CanvasRenderingContext2D, a: number, body: () => void): void {
  if (a >= 1) {
    body();
    return;
  }
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * a;
  body();
  ctx.globalAlpha = prev;
}

function axisLabelFontFamily(theme: GraphTheme): string {
  if (theme.axisLabelStyle === 'italic-serif') {
    return '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
  }
  return theme.labelFontFamily;
}

function axisLabelFont(theme: GraphTheme): string {
  const size = Math.max(10, theme.labelFontSize + 1);
  return `italic ${size}px ${axisLabelFontFamily(theme)}`;
}

function tickLabelFont(theme: GraphTheme): string {
  return `${theme.labelFontSize}px ${theme.labelFontFamily}`;
}

export interface StepPair {
  majorXStep: number;
  majorYStep: number;
  minorXStep: number;
  minorYStep: number;
  drawMinorX: boolean;
  drawMinorY: boolean;
}

export function computeSteps(
  xRange: [number, number],
  yRange: [number, number],
  theme: GraphTheme,
  gridStep?: number | null,
): StepPair {
  const xSpan = xRange[1] - xRange[0];
  const ySpan = yRange[1] - yRange[0];
  const user =
    Number.isFinite(gridStep ?? NaN) && (gridStep ?? 0) > 0 ? (gridStep as number) : null;
  const majorXStep = cappedStep(
    xSpan,
    user ?? niceStep(xSpan, TARGET_MAJOR_TICKS),
    MAX_GRID_LINES_PER_AXIS,
  );
  const majorYStep = cappedStep(
    ySpan,
    user ?? niceStep(ySpan, TARGET_MAJOR_TICKS),
    MAX_GRID_LINES_PER_AXIS,
  );
  const subs = Math.max(1, Math.floor(theme.gridMinor.subdivisions || 1));
  const minorXStep = majorXStep / subs;
  const minorYStep = majorYStep / subs;
  const drawMinorX =
    theme.gridMinor.enabled && minorXStep > 0 && xSpan / minorXStep <= MAX_GRID_LINES_PER_AXIS;
  const drawMinorY =
    theme.gridMinor.enabled && minorYStep > 0 && ySpan / minorYStep <= MAX_GRID_LINES_PER_AXIS;
  return { majorXStep, majorYStep, minorXStep, minorYStep, drawMinorX, drawMinorY };
}

export function drawGraphFrame(ctx: CanvasRenderingContext2D, opts: DrawFrameOptions): void {
  const { rect, xRange, yRange, theme, gridStep, showAxes, showGrid } = opts;
  const { x: px, y: py, w: pw, h: ph } = rect;
  if (pw < 2 || ph < 2) return;

  const [x0, x1] = xRange;
  const [y0, y1] = yRange;
  const xSpan = x1 - x0;
  const ySpan = y1 - y0;
  if (xSpan <= 0 || ySpan <= 0) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py, pw, ph);
  ctx.clip();

  if (theme.backgroundEnabled) {
    ctx.fillStyle = theme.background;
    ctx.fillRect(px, py, pw, ph);
  }

  const xToPx = (x: number) => px + ((x - x0) / xSpan) * pw;
  const yToPx = (y: number) => py + (1 - (y - y0) / ySpan) * ph;

  const steps = computeSteps(xRange, yRange, theme, gridStep);
  const { majorXStep, majorYStep, minorXStep, minorYStep, drawMinorX, drawMinorY } = steps;

  if (showGrid && theme.gridMinor.enabled && (drawMinorX || drawMinorY)) {
    const minor = theme.gridMinor;
    withAlpha(ctx, minor.opacity, () => {
      ctx.lineWidth = minor.width;
      ctx.strokeStyle = minor.color;
      ctx.beginPath();
      if (drawMinorX) {
        for (const x of generateTicks(x0, x1, minorXStep)) {
          const sx = snapLine(xToPx(x), minor.width);
          ctx.moveTo(sx, py);
          ctx.lineTo(sx, py + ph);
        }
      }
      if (drawMinorY) {
        for (const y of generateTicks(y0, y1, minorYStep)) {
          const sy = snapLine(yToPx(y), minor.width);
          ctx.moveTo(px, sy);
          ctx.lineTo(px + pw, sy);
        }
      }
      ctx.stroke();
    });
  }

  if (showGrid && theme.gridMajor.enabled) {
    const major = theme.gridMajor;
    withAlpha(ctx, major.opacity, () => {
      ctx.lineWidth = major.width;
      ctx.strokeStyle = major.color;
      ctx.beginPath();
      for (const x of generateTicks(x0, x1, majorXStep)) {
        const sx = snapLine(xToPx(x), major.width);
        ctx.moveTo(sx, py);
        ctx.lineTo(sx, py + ph);
      }
      for (const y of generateTicks(y0, y1, majorYStep)) {
        const sy = snapLine(yToPx(y), major.width);
        ctx.moveTo(px, sy);
        ctx.lineTo(px + pw, sy);
      }
      ctx.stroke();
    });
  }

  const xAxisVisible = y0 <= 0 && y1 >= 0;
  const yAxisVisible = x0 <= 0 && x1 >= 0;

  if (showAxes) {
    ctx.strokeStyle = theme.axisColor;
    ctx.lineWidth = theme.axisWidth;
    ctx.beginPath();
    if (xAxisVisible) {
      const axisY = snapLine(yToPx(0), theme.axisWidth);
      ctx.moveTo(px, axisY);
      ctx.lineTo(px + pw, axisY);
    }
    if (yAxisVisible) {
      const axisX = snapLine(xToPx(0), theme.axisWidth);
      ctx.moveTo(axisX, py);
      ctx.lineTo(axisX, py + ph);
    }
    ctx.stroke();

    if (theme.axisArrowheads) {
      ctx.fillStyle = theme.axisColor;
      if (xAxisVisible) {
        const axisY = yToPx(0);
        drawArrowhead(ctx, px + pw, axisY, 1, 0);
        drawArrowhead(ctx, px, axisY, -1, 0);
      }
      if (yAxisVisible) {
        const axisX = xToPx(0);
        drawArrowhead(ctx, axisX, py, 0, -1);
        drawArrowhead(ctx, axisX, py + ph, 0, 1);
      }
    }

    if (theme.tickLength > 0) {
      ctx.strokeStyle = theme.axisColor;
      ctx.lineWidth = theme.axisWidth;
      ctx.beginPath();
      const half = theme.tickLength / 2;
      if (xAxisVisible) {
        const axisY = yToPx(0);
        for (const x of generateTicks(x0, x1, majorXStep)) {
          if (yAxisVisible && Math.abs(x) < majorXStep * 1e-6) continue;
          const sx = snapLine(xToPx(x), theme.axisWidth);
          ctx.moveTo(sx, axisY - half);
          ctx.lineTo(sx, axisY + half);
        }
      }
      if (yAxisVisible) {
        const axisX = xToPx(0);
        for (const y of generateTicks(y0, y1, majorYStep)) {
          if (xAxisVisible && Math.abs(y) < majorYStep * 1e-6) continue;
          const sy = snapLine(yToPx(y), theme.axisWidth);
          ctx.moveTo(axisX - half, sy);
          ctx.lineTo(axisX + half, sy);
        }
      }
      ctx.stroke();
    }

    drawTickAndAxisLabels(ctx, {
      rect,
      xRange,
      yRange,
      theme,
      steps,
      xAxisVisible,
      yAxisVisible,
      xToPx,
      yToPx,
    });
  }

  ctx.restore();

  if (theme.frameEnabled) {
    ctx.strokeStyle = theme.frameColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
  }
}

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dirX: number,
  dirY: number,
): void {
  const tipX = x;
  const tipY = y;
  const baseX = tipX - dirX * ARROW_LEN;
  const baseY = tipY - dirY * ARROW_LEN;
  // Perpendicular vector (rotate direction 90°).
  const perpX = -dirY;
  const perpY = dirX;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(baseX + perpX * ARROW_HALF, baseY + perpY * ARROW_HALF);
  ctx.lineTo(baseX - perpX * ARROW_HALF, baseY - perpY * ARROW_HALF);
  ctx.closePath();
  ctx.fill();
}

interface LabelContext {
  rect: GraphRect;
  xRange: [number, number];
  yRange: [number, number];
  theme: GraphTheme;
  steps: StepPair;
  xAxisVisible: boolean;
  yAxisVisible: boolean;
  xToPx: (x: number) => number;
  yToPx: (y: number) => number;
}

function drawTickAndAxisLabels(ctx: CanvasRenderingContext2D, lc: LabelContext): void {
  const { rect, xRange, yRange, theme, steps, xAxisVisible, yAxisVisible, xToPx, yToPx } = lc;
  const { x: px, y: py, w: pw, h: ph } = rect;
  const { majorXStep, majorYStep } = steps;
  const [x0, x1] = xRange;
  const [y0, y1] = yRange;

  ctx.fillStyle = theme.labelColor;
  ctx.font = tickLabelFont(theme);

  if (xAxisVisible) {
    const axisY = yToPx(0);
    const nearBottom = py + ph - axisY < LABEL_PAD + theme.labelFontSize + 2;
    const tickLabelY = nearBottom
      ? Math.max(axisY - LABEL_PAD - Math.max(0, theme.tickLength / 2), py + LABEL_PAD)
      : Math.min(
          axisY + LABEL_PAD + Math.max(0, theme.tickLength / 2),
          py + ph - LABEL_PAD - theme.labelFontSize,
        );
    ctx.textAlign = 'center';
    ctx.textBaseline = nearBottom ? 'bottom' : 'top';
    for (const x of generateTicks(x0, x1, majorXStep)) {
      if (yAxisVisible && Math.abs(x) < majorXStep * 1e-6) continue;
      ctx.fillText(formatTick(x, majorXStep), xToPx(x), tickLabelY);
    }
  }

  if (yAxisVisible) {
    const axisX = xToPx(0);
    const nearLeft = axisX - px < LABEL_PAD + 16;
    const tickLabelX = nearLeft
      ? Math.min(axisX + LABEL_PAD + Math.max(0, theme.tickLength / 2), px + pw - LABEL_PAD)
      : Math.max(axisX - LABEL_PAD - Math.max(0, theme.tickLength / 2), px + LABEL_PAD);
    ctx.textAlign = nearLeft ? 'left' : 'right';
    ctx.textBaseline = 'middle';
    for (const y of generateTicks(y0, y1, majorYStep)) {
      if (xAxisVisible && Math.abs(y) < majorYStep * 1e-6) continue;
      ctx.fillText(formatTick(y, majorYStep), tickLabelX, yToPx(y));
    }
  }

  if (theme.axisLabelStyle !== 'none') {
    ctx.font = axisLabelFont(theme);
    ctx.fillStyle = theme.labelColor;
    if (xAxisVisible) {
      const axisY = yToPx(0);
      const nearTop = axisY - py < LABEL_PAD + 14;
      const xLabelY = nearTop
        ? Math.min(axisY + LABEL_PAD, py + ph - LABEL_PAD)
        : Math.max(axisY - LABEL_PAD, py + LABEL_PAD);
      ctx.textAlign = 'right';
      ctx.textBaseline = nearTop ? 'top' : 'alphabetic';
      ctx.fillText('x', px + pw - LABEL_PAD - (theme.axisArrowheads ? ARROW_LEN : 0), xLabelY);
    }
    if (yAxisVisible) {
      const axisX = xToPx(0);
      const nearRight = px + pw - axisX < LABEL_PAD + 16;
      const yLabelX = nearRight
        ? Math.max(axisX - LABEL_PAD, px + LABEL_PAD)
        : Math.min(axisX + LABEL_PAD, px + pw - LABEL_PAD);
      ctx.textAlign = nearRight ? 'right' : 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('y', yLabelX, py + LABEL_PAD + (theme.axisArrowheads ? ARROW_LEN : 0));
    }
  }

  if (xAxisVisible && yAxisVisible && theme.originLabel !== 'none') {
    ctx.font = tickLabelFont(theme);
    ctx.fillStyle = theme.labelColor;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    const label = theme.originLabel === 'coords' ? '(0, 0)' : 'O';
    ctx.fillText(label, xToPx(0) - LABEL_PAD, yToPx(0) + LABEL_PAD);
  }
}
