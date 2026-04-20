import { getStroke } from 'perfect-freehand';
import type { Point, StrokeObject } from '$lib/types';

export interface StrokeRenderOptions {
  ptToPx: number;
  simulatePressure?: boolean;
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

export function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: StrokeObject,
  opts: StrokeRenderOptions,
): void {
  if (stroke.points.length === 0) return;

  const { ptToPx } = opts;
  const widthPx = stroke.style.width * ptToPx;
  const input = inputToPx(stroke.points, ptToPx);

  const outline =
    stroke.style.dash === 'solid'
      ? getStroke(input, {
          size: widthPx * 2,
          thinning: 0.6,
          smoothing: 0.5,
          streamline: 0.5,
          simulatePressure: opts.simulatePressure ?? false,
          last: true,
        })
      : [];

  ctx.save();
  ctx.globalAlpha = stroke.style.opacity;

  if (stroke.style.dash === 'solid') {
    ctx.fillStyle = stroke.style.color;
    if (outline.length > 0) {
      const path = new Path2D(toSvgPath(outline));
      ctx.fill(path);
    }
  } else if (input.length > 1) {
    ctx.strokeStyle = stroke.style.color;
    ctx.lineWidth = Math.max(0.5, widthPx);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(dashPattern(stroke.style.dash, widthPx));
    ctx.beginPath();
    ctx.moveTo(input[0][0], input[0][1]);
    for (let i = 1; i < input.length; i++) {
      ctx.lineTo(input[i][0], input[i][1]);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (input.length === 1) {
    ctx.fillStyle = stroke.style.color;
    ctx.beginPath();
    ctx.arc(input[0][0], input[0][1], Math.max(0.5, widthPx / 2), 0, Math.PI * 2);
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
  drawStroke(ctx, temp, { ptToPx, simulatePressure: false });
}
