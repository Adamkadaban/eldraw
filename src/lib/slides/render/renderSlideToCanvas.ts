import type {
  Slide,
  SlideDiagramBlock,
  SlideMappingBlock,
  SlideNumberLineBlock,
  SlideTheme,
} from '$lib/types';
import { layoutSlide, type LayoutBox } from '../layout';
import { resolveTheme } from '../theme';
import { diagramGeometry } from './diagramGeometry';
import { mappingGeometry } from './mappingGeometry';
import { slideNumberLineGeometry } from './numberLineGeometry';

function drawMappingPlaceholder(
  ctx: CanvasRenderingContext2D,
  block: SlideMappingBlock,
  box: LayoutBox,
  theme: SlideTheme,
  scale: number,
): void {
  const geometry = mappingGeometry(block, box.w, box.h, theme.bodySize);
  const offsetX = box.x * scale;
  const offsetY = box.y * scale;

  ctx.save();
  ctx.lineWidth = Math.max(0.75, scale);
  for (const [oval, color, opacity] of [
    [geometry.leftOval, theme.accent, 0.15],
    [geometry.rightOval, theme.textColor, 0.07],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(
      offsetX + oval.cx * scale,
      offsetY + oval.cy * scale,
      oval.rx * scale,
      oval.ry * scale,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = color;
    ctx.globalAlpha = opacity;
    ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  ctx.strokeStyle = theme.textColor;
  ctx.globalAlpha = 0.45;
  for (const arrow of geometry.arrows.slice(0, 8)) {
    ctx.beginPath();
    ctx.moveTo(offsetX + arrow.from.x * scale, offsetY + arrow.from.y * scale);
    ctx.lineTo(offsetX + arrow.to.x * scale, offsetY + arrow.to.y * scale);
    ctx.stroke();
  }
  ctx.restore();
}

function drawDiagramPlaceholder(
  ctx: CanvasRenderingContext2D,
  block: SlideDiagramBlock,
  box: LayoutBox,
  theme: SlideTheme,
  scale: number,
): void {
  const geometry = diagramGeometry(block, box.w, box.h, theme.bodySize);
  const offsetX = box.x * scale;
  const offsetY = box.y * scale;
  ctx.save();
  ctx.strokeStyle = theme.textColor;
  ctx.lineWidth = Math.max(0.75, scale);
  ctx.globalAlpha = 0.35;
  for (const edge of geometry.edges.slice(0, 12)) {
    ctx.beginPath();
    ctx.moveTo(offsetX + edge.from.x * scale, offsetY + edge.from.y * scale);
    ctx.lineTo(offsetX + edge.to.x * scale, offsetY + edge.to.y * scale);
    ctx.stroke();
  }
  ctx.fillStyle = theme.accent;
  ctx.globalAlpha = 0.13;
  for (const node of geometry.nodes.filter((item) => item.shape === 'box').slice(0, 12)) {
    ctx.fillRect(
      offsetX + (node.x - node.w / 2) * scale,
      offsetY + (node.y - node.h / 2) * scale,
      node.w * scale,
      node.h * scale,
    );
  }
  ctx.restore();
}

function drawNumberLinePlaceholder(
  ctx: CanvasRenderingContext2D,
  block: SlideNumberLineBlock,
  box: LayoutBox,
  theme: SlideTheme,
  scale: number,
): void {
  const geometry = slideNumberLineGeometry(block, box.w, box.h, theme);
  if (!geometry.valid) return;
  const offsetX = box.x * scale;
  const offsetY = box.y * scale;
  ctx.save();
  ctx.strokeStyle = theme.textColor;
  ctx.lineWidth = Math.max(0.75, scale);
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.moveTo(offsetX + geometry.x0 * scale, offsetY + geometry.y * scale);
  ctx.lineTo(offsetX + geometry.x1 * scale, offsetY + geometry.y * scale);
  for (const tick of geometry.ticks.slice(0, 24)) {
    const x = offsetX + tick.x * scale;
    const y = offsetY + geometry.y * scale;
    ctx.moveTo(x, y - 3 * scale);
    ctx.lineTo(x, y + 3 * scale);
  }
  ctx.stroke();
  ctx.restore();
}

export function renderSlideBackground(
  ctx: CanvasRenderingContext2D,
  slide: Slide,
  theme: SlideTheme,
  width: number,
  height: number,
  ptToPx: number,
): void {
  const scale = Number.isFinite(ptToPx) && ptToPx > 0 ? ptToPx : 1;
  const pageWidth = Math.max(0, width / scale);
  const pageHeight = Math.max(0, height / scale);
  const safeTheme = resolveTheme(theme, slide.theme);
  const layout = layoutSlide(slide, safeTheme, pageWidth, pageHeight);

  ctx.save();
  ctx.fillStyle = safeTheme.background;
  ctx.fillRect(0, 0, Math.max(0, width), Math.max(0, height));

  if (layout.title) {
    const title = layout.title.box;
    ctx.fillStyle = safeTheme.accent;
    ctx.globalAlpha = slide.layout === 'title' ? 0.12 : 0.85;
    const barHeight = slide.layout === 'title' ? title.h * scale : Math.max(2, 2 * scale);
    const barY = slide.layout === 'title' ? title.y * scale : (title.y + title.h) * scale;
    ctx.fillRect(title.x * scale, barY, title.w * scale, barHeight);
    ctx.globalAlpha = 1;
  }

  for (const { block, box } of [...layout.blocks, ...layout.asides]) {
    if (block.kind === 'spacer') continue;
    const x = box.x * scale;
    const y = box.y * scale;
    const w = box.w * scale;
    const h = box.h * scale;
    if (block.kind === 'mapping') {
      drawMappingPlaceholder(ctx, block, box, safeTheme, scale);
      continue;
    }
    if (block.kind === 'diagram') {
      drawDiagramPlaceholder(ctx, block, box, safeTheme, scale);
      continue;
    }
    if (block.kind === 'numberline') {
      drawNumberLinePlaceholder(ctx, block, box, safeTheme, scale);
      continue;
    }
    ctx.fillStyle = block.kind === 'callout' ? safeTheme.accent : safeTheme.textColor;
    ctx.globalAlpha = block.kind === 'callout' ? 0.14 : 0.18;
    if (block.kind === 'graph' || block.kind === 'image' || block.kind === 'table') {
      ctx.fillRect(x, y, w, h);
    } else {
      const lineHeight = Math.max(1, Math.min(h, safeTheme.bodySize * scale * 0.35));
      const lines = Math.max(1, Math.min(4, Math.ceil(h / Math.max(1, lineHeight * 3))));
      for (let line = 0; line < lines; line += 1) {
        const lineWidth = w * (line === lines - 1 ? 0.68 : 0.92);
        ctx.fillRect(x, y + line * lineHeight * 2.4, lineWidth, lineHeight);
      }
    }
  }
  ctx.restore();
}
