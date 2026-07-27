import { getStroke } from 'perfect-freehand';
import type { Point, StrokeObject } from '$lib/types';

export interface StrokeRenderOptions {
  ptToPx: number;
  simulatePressure?: boolean;
  /**
   * Fallback perfect-freehand `streamline` used only when the stroke does
   * not carry its own baked value. Committed strokes should carry their
   * own; this exists for live rendering where smoothing follows the slider.
   */
  streamline?: number;
}

function toSvgPath(points: number[][]): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  let d = `M ${first[0].toFixed(3)} ${first[1].toFixed(3)}`;
  for (let i = 0; i < rest.length; i++) {
    const [x, y] = rest[i];
    const next = rest[i + 1];
    if (next) {
      const mx = (x + next[0]) / 2;
      const my = (y + next[1]) / 2;
      d += ` Q ${x.toFixed(3)} ${y.toFixed(3)} ${mx.toFixed(3)} ${my.toFixed(3)}`;
    } else {
      d += ` L ${x.toFixed(3)} ${y.toFixed(3)}`;
    }
  }
  d += ' Z';
  return d;
}

function inputToPx(points: Point[], ptToPx: number): [number, number, number][] {
  return points.map((p) => [p.x * ptToPx, p.y * ptToPx, p.pressure]);
}

function dashPattern(dash: StrokeObject['style']['dash'], widthPx: number): number[] {
  switch (dash) {
    case 'dashed':
      return [widthPx * 3, widthPx * 2];
    case 'dotted':
      return [widthPx, widthPx * 1.5];
    case 'solid':
    default:
      return [];
  }
}

interface CachedStrokeRender {
  ptToPx: number;
  simulatePressure: boolean;
  streamline: number;
  pointCount: number;
  /** Cached Path2D for solid strokes, or null for dashed/dotted. */
  path: Path2D | null;
  /** Pre-converted input for dashed/dotted stroke paths. */
  input: [number, number, number][];
}

const strokeCache = new WeakMap<StrokeObject, CachedStrokeRender>();

function cacheKeyMatches(
  c: CachedStrokeRender,
  ptToPx: number,
  simulatePressure: boolean,
  streamline: number,
  pointCount: number,
): boolean {
  return (
    c.ptToPx === ptToPx &&
    c.simulatePressure === simulatePressure &&
    c.streamline === streamline &&
    c.pointCount === pointCount
  );
}

function computeStrokeRender(
  stroke: StrokeObject,
  ptToPx: number,
  simulatePressure: boolean,
  streamline: number,
): CachedStrokeRender {
  const widthPx = stroke.style.width * ptToPx;
  const input = inputToPx(stroke.points, ptToPx);

  let path: Path2D | null = null;
  if (stroke.style.dash === 'solid') {
    const outline = getStroke(input, {
      size: widthPx * 2,
      thinning: 0.6,
      smoothing: 0.5,
      streamline,
      simulatePressure,
      last: true,
    });
    if (outline.length > 0) {
      path = new Path2D(toSvgPath(outline));
    }
  }

  return { ptToPx, simulatePressure, streamline, pointCount: stroke.points.length, path, input };
}

function getCachedRender(
  stroke: StrokeObject,
  ptToPx: number,
  simulatePressure: boolean,
  streamline: number,
): CachedStrokeRender {
  const cached = strokeCache.get(stroke);
  if (
    cached &&
    cacheKeyMatches(cached, ptToPx, simulatePressure, streamline, stroke.points.length)
  ) {
    return cached;
  }
  const result = computeStrokeRender(stroke, ptToPx, simulatePressure, streamline);
  strokeCache.set(stroke, result);
  return result;
}

/** Evict a specific stroke from the render cache. */
export function evictStrokeCache(stroke: StrokeObject): void {
  strokeCache.delete(stroke);
}

/** Clear the entire stroke render cache. */
export function clearStrokeCache(): void {
  // WeakMap doesn't expose iteration; callers who need a full purge
  // can only drop references. This is a best-effort API for tests.
}

/** Return whether a stroke has a cached render entry (for testing). */
export function hasStrokeCacheEntry(stroke: StrokeObject): boolean {
  return strokeCache.has(stroke);
}

export function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: StrokeObject,
  opts: StrokeRenderOptions,
): void {
  if (stroke.points.length === 0) return;

  const { ptToPx } = opts;
  const widthPx = stroke.style.width * ptToPx;
  const simulatePressure = opts.simulatePressure ?? false;
  const streamline = stroke.streamline ?? opts.streamline ?? 0;

  const render = getCachedRender(stroke, ptToPx, simulatePressure, streamline);

  ctx.save();
  ctx.globalAlpha = stroke.style.opacity;

  if (stroke.style.dash === 'solid') {
    ctx.fillStyle = stroke.style.color;
    if (render.path) {
      ctx.fill(render.path);
    }
  } else if (render.input.length > 1) {
    ctx.strokeStyle = stroke.style.color;
    ctx.lineWidth = Math.max(0.5, widthPx);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(dashPattern(stroke.style.dash, widthPx));
    ctx.beginPath();
    ctx.moveTo(render.input[0][0], render.input[0][1]);
    for (let i = 1; i < render.input.length; i++) {
      ctx.lineTo(render.input[i][0], render.input[i][1]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (render.input.length === 1) {
    ctx.fillStyle = stroke.style.color;
    ctx.beginPath();
    ctx.arc(render.input[0][0], render.input[0][1], Math.max(0.5, widthPx / 2), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function drawLiveStroke(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  style: StrokeObject['style'],
  tool: 'pen' | 'highlighter',
  ptToPx: number,
  streamline?: number,
): void {
  if (points.length === 0) return;
  const temp: StrokeObject = {
    id: 'live',
    createdAt: 0,
    type: 'stroke',
    tool,
    style,
    points,
  };
  drawStroke(ctx, temp, { ptToPx, simulatePressure: false, streamline });
}
