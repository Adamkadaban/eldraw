import type { Slide, SlideTheme } from '$lib/types';
import { layoutSlide } from '../layout';
import { resolveTheme } from '../theme';

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
