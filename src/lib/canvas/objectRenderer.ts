import type {
  AngleMarkObject,
  LineObject,
  NumberLineObject,
  ShapeObject,
  StrokeStyle,
} from '$lib/types';
import { angleMarkArcParams } from '$lib/geometry/protractor';
import { numberLineValueToX } from '$lib/tools/shapes';

function dashPattern(dash: StrokeStyle['dash'], widthPx: number): number[] {
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

function applyStrokeStyle(
  ctx: CanvasRenderingContext2D,
  style: StrokeStyle,
  ptToPx: number,
): number {
  const widthPx = Math.max(0.5, style.width * ptToPx);
  ctx.lineWidth = widthPx;
  ctx.strokeStyle = style.color;
  ctx.globalAlpha = style.opacity;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash(dashPattern(style.dash, widthPx));
  return widthPx;
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  tipX: number,
  tipY: number,
  fromX: number,
  fromY: number,
  sizePx: number,
  color: string,
): void {
  const angle = Math.atan2(tipY - fromY, tipX - fromX);
  const wing = Math.PI / 6;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - sizePx * Math.cos(angle - wing), tipY - sizePx * Math.sin(angle - wing));
  ctx.lineTo(tipX - sizePx * Math.cos(angle + wing), tipY - sizePx * Math.sin(angle + wing));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.setLineDash([]);
  ctx.fill();
  ctx.restore();
}

export function drawLine(ctx: CanvasRenderingContext2D, line: LineObject, ptToPx: number): void {
  ctx.save();
  const widthPx = applyStrokeStyle(ctx, line.style, ptToPx);
  const ax = line.from.x * ptToPx;
  const ay = line.from.y * ptToPx;
  const bx = line.to.x * ptToPx;
  const by = line.to.y * ptToPx;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.setLineDash([]);
  const head = Math.max(6, widthPx * 4);
  if (line.arrow.end) drawArrowHead(ctx, bx, by, ax, ay, head, line.style.color);
  if (line.arrow.start) drawArrowHead(ctx, ax, ay, bx, by, head, line.style.color);
  ctx.restore();
}

export function drawShape(ctx: CanvasRenderingContext2D, shape: ShapeObject, ptToPx: number): void {
  ctx.save();
  applyStrokeStyle(ctx, shape.style, ptToPx);
  const x = shape.bounds.x * ptToPx;
  const y = shape.bounds.y * ptToPx;
  const w = shape.bounds.w * ptToPx;
  const h = shape.bounds.h * ptToPx;
  ctx.beginPath();
  if (shape.kind === 'rect') {
    ctx.rect(x, y, w, h);
  } else {
    ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
  }
  if (shape.fill !== null) {
    ctx.fillStyle = shape.fill;
    ctx.fill();
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

export function drawNumberLine(
  ctx: CanvasRenderingContext2D,
  nl: NumberLineObject,
  ptToPx: number,
): void {
  ctx.save();
  const widthPx = applyStrokeStyle(ctx, nl.style, ptToPx);
  const y = nl.from.y * ptToPx;
  const x0 = nl.from.x * ptToPx;
  const x1 = (nl.from.x + nl.length) * ptToPx;

  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();
  ctx.setLineDash([]);

  const head = Math.max(6, widthPx * 4);
  drawArrowHead(ctx, x1, y, x0, y, head, nl.style.color);
  drawArrowHead(ctx, x0, y, x1, y, head, nl.style.color);

  if (nl.tickStep > 0) {
    const tickHalf = Math.max(4, widthPx * 2);
    ctx.beginPath();
    const start = Math.ceil(nl.min / nl.tickStep) * nl.tickStep;
    for (let v = start; v <= nl.max + 1e-9; v += nl.tickStep) {
      const tx = numberLineValueToX(nl, v) * ptToPx;
      ctx.moveTo(tx, y - tickHalf);
      ctx.lineTo(tx, y + tickHalf);
    }
    ctx.stroke();
  }

  if (nl.labelStep > 0) {
    ctx.fillStyle = nl.style.color;
    const fontPx = Math.max(9, 10 * ptToPx);
    ctx.font = `${fontPx}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const start = Math.ceil(nl.min / nl.labelStep) * nl.labelStep;
    for (let v = start; v <= nl.max + 1e-9; v += nl.labelStep) {
      const tx = numberLineValueToX(nl, v) * ptToPx;
      const label = Number.isInteger(v) ? v.toFixed(0) : v.toFixed(2).replace(/\.?0+$/, '');
      ctx.fillText(label, tx, y + Math.max(6, widthPx * 2) + 2);
    }
  }

  for (const m of nl.marks) {
    const mx = numberLineValueToX(nl, m.value) * ptToPx;
    const r = Math.max(4, widthPx * 2.2);
    if (m.kind === 'closed') {
      ctx.beginPath();
      ctx.fillStyle = nl.style.color;
      ctx.arc(mx, y, r, 0, Math.PI * 2);
      ctx.fill();
    } else if (m.kind === 'open') {
      ctx.beginPath();
      ctx.fillStyle = '#ffffff';
      ctx.arc(mx, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = Math.max(1, widthPx * 0.8);
      ctx.strokeStyle = nl.style.color;
      ctx.stroke();
    } else if (m.kind === 'arrow-left') {
      ctx.lineWidth = widthPx;
      ctx.strokeStyle = nl.style.color;
      ctx.beginPath();
      ctx.moveTo(mx, y);
      ctx.lineTo(x0, y);
      ctx.stroke();
      drawArrowHead(ctx, x0, y, mx, y, Math.max(8, widthPx * 4), nl.style.color);
    } else if (m.kind === 'arrow-right') {
      ctx.lineWidth = widthPx;
      ctx.strokeStyle = nl.style.color;
      ctx.beginPath();
      ctx.moveTo(mx, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      drawArrowHead(ctx, x1, y, mx, y, Math.max(8, widthPx * 4), nl.style.color);
    }
  }

  ctx.restore();
}

export function drawAngleMark(
  ctx: CanvasRenderingContext2D,
  mark: AngleMarkObject,
  ptToPx: number,
): void {
  ctx.save();
  const widthPx = Math.max(0.5, mark.width * ptToPx);
  ctx.lineWidth = widthPx;
  ctx.strokeStyle = mark.color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash([]);

  const vx = mark.vertex.x * ptToPx;
  const vy = mark.vertex.y * ptToPx;
  const ax = mark.rayA.x * ptToPx;
  const ay = mark.rayA.y * ptToPx;
  const bx = mark.rayB.x * ptToPx;
  const by = mark.rayB.y * ptToPx;

  ctx.beginPath();
  ctx.moveTo(vx, vy);
  ctx.lineTo(ax, ay);
  ctx.moveTo(vx, vy);
  ctx.lineTo(bx, by);
  ctx.stroke();

  const arc = angleMarkArcParams(mark.vertex, mark.rayA, mark.rayB, mark.degrees);
  ctx.beginPath();
  ctx.arc(vx, vy, arc.radius * ptToPx, arc.startAngle, arc.endAngle, arc.anticlockwise);
  ctx.stroke();

  if (mark.showLabel) {
    const fontPx = Math.max(10, 12 * ptToPx);
    ctx.fillStyle = mark.color;
    ctx.font = `${fontPx}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const deg = Math.abs(mark.degrees);
    const rounded = Number.isInteger(deg) ? deg.toFixed(0) : deg.toFixed(1);
    ctx.fillText(`${rounded}°`, arc.labelAt.x * ptToPx, arc.labelAt.y * ptToPx);
  }

  ctx.restore();
}
