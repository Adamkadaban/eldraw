import type { AnyObject, Page } from '$lib/types';
import { drawAngleMark, drawLine, drawNumberLine, drawShape } from '$lib/canvas/objectRenderer';
import { drawStroke } from '$lib/canvas/strokeRenderer';

/**
 * Render annotation objects onto `ctx` scaled to fit a thumbnail. `pxPerPt`
 * converts PDF user-space points to the target canvas pixels. Text and
 * graph objects render as minimal placeholders — full LaTeX/plotter output
 * is too expensive for a strip of thumbnails and the user only needs shape
 * cues at this size.
 */
export function drawAnnotationOverlay(
  ctx: CanvasRenderingContext2D,
  objects: readonly AnyObject[],
  pxPerPt: number,
): void {
  for (const obj of objects) drawObject(ctx, obj, pxPerPt);
}

function drawObject(ctx: CanvasRenderingContext2D, obj: AnyObject, pxPerPt: number): void {
  switch (obj.type) {
    case 'stroke':
      drawStroke(ctx, obj, { ptToPx: pxPerPt, simulatePressure: false });
      return;
    case 'line':
      drawLine(ctx, obj, pxPerPt);
      return;
    case 'shape':
      drawShape(ctx, obj, pxPerPt);
      return;
    case 'numberline':
      drawNumberLine(ctx, obj, pxPerPt);
      return;
    case 'angleMark':
      drawAngleMark(ctx, obj, pxPerPt);
      return;
    case 'graph':
      drawGraphPlaceholder(ctx, obj.bounds, pxPerPt);
      return;
    case 'text':
      drawTextPlaceholder(ctx, obj.at, obj.fontSize, obj.content, obj.color, pxPerPt);
      return;
  }
}

function drawGraphPlaceholder(
  ctx: CanvasRenderingContext2D,
  bounds: { x: number; y: number; w: number; h: number },
  pxPerPt: number,
): void {
  const x = bounds.x * pxPerPt;
  const y = bounds.y * pxPerPt;
  const w = bounds.w * pxPerPt;
  const h = bounds.h * pxPerPt;
  if (w < 1 || h < 1) return;
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));
  ctx.strokeStyle = '#bbb';
  ctx.beginPath();
  ctx.moveTo(x, y + h / 2);
  ctx.lineTo(x + w, y + h / 2);
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x + w / 2, y + h);
  ctx.stroke();
  ctx.restore();
}

function drawTextPlaceholder(
  ctx: CanvasRenderingContext2D,
  at: { x: number; y: number },
  fontSize: number,
  content: string,
  color: string,
  pxPerPt: number,
): void {
  const px = fontSize * pxPerPt;
  if (px < 4) return;
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${px}px system-ui, sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillText(content, at.x * pxPerPt, at.y * pxPerPt);
  ctx.restore();
}

/**
 * Target thumbnail pixel size for a page of `widthPt × heightPt` at the
 * given longest-side bound. Matches the sizing used by the Rust renderer
 * so the overlay aligns with the raw PDF thumbnail.
 */
export function thumbnailPixelSize(
  page: Pick<Page, 'width' | 'height'>,
  maxDim: number,
): { width: number; height: number; pxPerPt: number } {
  const longest = Math.max(page.width, page.height);
  if (longest <= 0) return { width: 0, height: 0, pxPerPt: 0 };
  const pxPerPt = maxDim / longest;
  return {
    width: Math.max(1, Math.round(page.width * pxPerPt)),
    height: Math.max(1, Math.round(page.height * pxPerPt)),
    pxPerPt,
  };
}
