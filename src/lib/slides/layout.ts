import type { Slide, SlideAlign, SlideBlock, SlideTheme } from '$lib/types';

export interface LayoutBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedBlock {
  block: SlideBlock;
  box: LayoutBox;
}

export interface SlideLayout {
  title: { text: string; box: LayoutBox; align: SlideAlign; fontSize: number } | null;
  subtitle: { text: string; box: LayoutBox; fontSize: number } | null;
  blocks: PlacedBlock[];
  asides: PlacedBlock[];
  overflow: boolean;
}

/**
 * Average Latin glyph width as a fraction of font size. Keeping this estimate
 * centralized makes the intentionally approximate wrapping math predictable.
 */
const AVERAGE_GLYPH_WIDTH_RATIO = 0.52;
const LINE_HEIGHT_RATIO = 1.35;
const HORIZONTAL_MARGIN_RATIO = 0.065;
const VERTICAL_MARGIN_RATIO = 0.08;
const MAX_COLUMNS = 6;

function finiteNonNegative(value: number, fallback = 0): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function safeFontSize(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && (value ?? 0) > 0 ? (value as number) : fallback;
}

function lineCount(text: string, fontSize: number, width: number): number {
  if (text.length === 0) return 1;
  const charsPerLine = Math.max(
    1,
    Math.floor(finiteNonNegative(width) / (fontSize * AVERAGE_GLYPH_WIDTH_RATIO)),
  );
  return text.split(/\r?\n/).reduce((total, line) => {
    return total + Math.max(1, Math.ceil(line.length / charsPerLine));
  }, 0);
}

function textHeight(text: string, fontSize: number, width: number): number {
  return lineCount(text, fontSize, width) * fontSize * LINE_HEIGHT_RATIO;
}

function clampedLevel(level: number): number {
  if (!Number.isFinite(level)) return 0;
  return Math.min(3, Math.max(0, Math.floor(level)));
}

function normalizedColumnWeights(block: Extract<SlideBlock, { kind: 'table' }>, count: number) {
  const weights = block.columnWeights;
  if (
    !weights ||
    weights.length !== count ||
    weights.some((weight) => !Number.isFinite(weight) || weight <= 0)
  ) {
    return Array.from({ length: count }, () => 1);
  }
  return weights;
}

function tableColumnCount(block: Extract<SlideBlock, { kind: 'table' }>): number {
  return Math.max(1, block.header.length, ...block.rows.map((row) => row.length));
}

export function measureBlock(block: SlideBlock, theme: SlideTheme, width: number): number {
  const availableWidth = finiteNonNegative(width);
  const bodySize = safeFontSize(theme.bodySize, 13);
  switch (block.kind) {
    case 'text': {
      const fontSize = safeFontSize(block.fontSize, bodySize);
      return textHeight(block.text, fontSize, availableWidth);
    }
    case 'list': {
      const fontSize = safeFontSize(block.fontSize, bodySize);
      return block.items.reduce((height, item) => {
        const indent = clampedLevel(item.level) * fontSize * 1.4;
        const itemWidth = Math.max(0, availableWidth - indent - fontSize * 1.5);
        return height + textHeight(item.text, fontSize, itemWidth);
      }, 0);
    }
    case 'definitions': {
      const fontSize = safeFontSize(block.fontSize, bodySize);
      return block.items.reduce((height, item) => {
        return height + textHeight(`${item.term}: ${item.text}`, fontSize, availableWidth);
      }, 0);
    }
    case 'table': {
      const fontSize = safeFontSize(block.fontSize, bodySize);
      const columns = tableColumnCount(block);
      const weights = normalizedColumnWeights(block, columns);
      const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
      const cellPadding = fontSize * 0.55;
      const rows = block.header.length > 0 ? [block.header, ...block.rows] : block.rows;
      const rowsHeight = rows.reduce((height, row) => {
        let rowHeight = fontSize * LINE_HEIGHT_RATIO + cellPadding * 2;
        for (let column = 0; column < columns; column += 1) {
          const columnWidth = (availableWidth * weights[column]) / totalWeight;
          const cellWidth = Math.max(0, columnWidth - cellPadding * 2);
          rowHeight = Math.max(
            rowHeight,
            textHeight(row[column] ?? '', fontSize, cellWidth) + cellPadding * 2,
          );
        }
        return height + rowHeight;
      }, 0);
      const captionHeight = block.caption
        ? textHeight(block.caption, fontSize, availableWidth) + fontSize * 0.45
        : 0;
      return captionHeight + rowsHeight;
    }
    case 'math': {
      const fontSize = safeFontSize(block.fontSize, bodySize);
      return fontSize * (block.display ? 1.9 : LINE_HEIGHT_RATIO);
    }
    case 'graph': {
      const graphHeight = finiteNonNegative(block.height);
      return (
        graphHeight +
        (block.caption ? textHeight(block.caption, bodySize, availableWidth) + bodySize * 0.45 : 0)
      );
    }
    case 'mapping':
      return finiteNonNegative(block.height);
    case 'callout': {
      const fontSize = safeFontSize(block.fontSize, bodySize);
      const padding = fontSize * 0.8;
      return (
        textHeight(block.text, fontSize, Math.max(0, availableWidth - padding * 2)) + padding * 2
      );
    }
    case 'image':
    case 'spacer':
      return finiteNonNegative(block.height);
  }
}

function blockGap(block: SlideBlock, bodySize: number): number {
  if (Number.isFinite(block.marginTop) && (block.marginTop ?? 0) >= 0) {
    return block.marginTop as number;
  }
  switch (block.kind) {
    case 'graph':
    case 'image':
    case 'mapping':
      return bodySize * 1.15;
    case 'table':
      return bodySize;
    case 'math':
    case 'callout':
      return bodySize * 0.8;
    case 'list':
    case 'definitions':
      return bodySize * 0.65;
    case 'text':
      return bodySize * 0.45;
    case 'spacer':
      return 0;
  }
}

function clampColumnCount(value: number | undefined): number {
  if (!Number.isFinite(value)) return 2;
  return Math.min(MAX_COLUMNS, Math.max(1, Math.floor(value as number)));
}

function makeBox(x: number, y: number, w: number, h: number): LayoutBox {
  return {
    x: finiteNonNegative(x),
    y: finiteNonNegative(y),
    w: finiteNonNegative(w),
    h: finiteNonNegative(h),
  };
}

function stackBlocks(
  blocks: SlideBlock[],
  theme: SlideTheme,
  x: number,
  startY: number,
  width: number,
): { blocks: PlacedBlock[]; bottom: number } {
  const placed: PlacedBlock[] = [];
  let y = startY;
  for (const block of blocks) {
    y += blockGap(block, theme.bodySize);
    const height = measureBlock(block, theme, width);
    placed.push({ block, box: makeBox(x, y, width, height) });
    y += height;
  }
  return { blocks: placed, bottom: y };
}

function placeAsides(
  slide: Slide,
  theme: SlideTheme,
  pageWidth: number,
  marginX: number,
  marginY: number,
): { blocks: PlacedBlock[]; bottom: number } {
  const asideWidth = Math.max(0, (pageWidth - marginX * 2) * 0.3);
  return stackBlocks(
    slide.aside ?? [],
    theme,
    Math.max(0, pageWidth - marginX - asideWidth),
    marginY,
    asideWidth,
  );
}

export function layoutSlide(
  slide: Slide,
  theme: SlideTheme,
  pageWidth: number,
  pageHeight: number,
): SlideLayout {
  const width = finiteNonNegative(pageWidth);
  const height = finiteNonNegative(pageHeight);
  const marginX = width * HORIZONTAL_MARGIN_RATIO;
  const marginY = Math.min(marginX, height * VERTICAL_MARGIN_RATIO);
  const innerWidth = Math.max(0, width - marginX * 2);
  const contentBottom = Math.max(0, height - marginY);
  const asideLayout = placeAsides(slide, theme, width, marginX, marginY);
  const hasAsides = asideLayout.blocks.length > 0;
  const titleWidth = hasAsides ? innerWidth * 0.64 : innerWidth;
  const headingSize = safeFontSize(theme.headingSize, 20);
  const titleSize = safeFontSize(theme.titleSize, 34);
  const bodySize = safeFontSize(theme.bodySize, 13);

  let title: SlideLayout['title'] = null;
  let subtitle: SlideLayout['subtitle'] = null;
  let contentTop = marginY;

  if (slide.layout === 'title') {
    const heroWidth = innerWidth * 0.82;
    const heroX = marginX + (innerWidth - heroWidth) / 2;
    const titleHeight = textHeight(slide.title, titleSize, heroWidth);
    const titleY = height * 0.2;
    title = {
      text: slide.title,
      box: makeBox(heroX, titleY, heroWidth, titleHeight),
      align: 'center',
      fontSize: titleSize,
    };
    if (slide.subtitle) {
      const subtitleSize = Math.max(bodySize, headingSize * 0.75);
      const subtitleY = titleY + titleHeight + subtitleSize * 0.8;
      subtitle = {
        text: slide.subtitle,
        box: makeBox(
          heroX,
          subtitleY,
          heroWidth,
          textHeight(slide.subtitle, subtitleSize, heroWidth),
        ),
        fontSize: subtitleSize,
      };
    }
    contentTop = Math.max(
      height * 0.52,
      (subtitle?.box.y ?? titleY) + (subtitle?.box.h ?? titleHeight),
    );
  } else if (slide.layout !== 'blank') {
    const titleHeight = textHeight(slide.title, headingSize, titleWidth);
    title = {
      text: slide.title,
      box: makeBox(marginX, marginY, titleWidth, titleHeight),
      align: 'left',
      fontSize: headingSize,
    };
    contentTop = marginY + titleHeight + headingSize * 0.9;
  }

  let placed: PlacedBlock[] = [];
  let flowBottom = contentTop;

  if (slide.layout === 'columns') {
    const columns = clampColumnCount(slide.columnCount);
    const gap = innerWidth * 0.035;
    const columnWidth = Math.max(0, (innerWidth - gap * (columns - 1)) / columns);
    const columnBottoms = Array.from({ length: columns }, () => contentTop);
    for (const block of slide.blocks) {
      let column = 0;
      for (let index = 1; index < columns; index += 1) {
        if (columnBottoms[index] < columnBottoms[column]) column = index;
      }
      const y = columnBottoms[column] + blockGap(block, bodySize);
      const blockHeight = measureBlock(block, theme, columnWidth);
      const x = marginX + column * (columnWidth + gap);
      placed.push({ block, box: makeBox(x, y, columnWidth, blockHeight) });
      columnBottoms[column] = y + blockHeight;
    }
    flowBottom = Math.max(contentTop, ...columnBottoms);
  } else if (slide.layout === 'grid') {
    const columns = clampColumnCount(slide.columnCount);
    const rows = Math.ceil(slide.blocks.length / columns);
    const gapX = innerWidth * 0.025;
    const availableHeight = Math.max(0, contentBottom - contentTop);
    const gapY = rows > 1 ? availableHeight * 0.035 : 0;
    const cellWidth = Math.max(0, (innerWidth - gapX * (columns - 1)) / columns);
    const cellHeight = rows > 0 ? Math.max(0, (availableHeight - gapY * (rows - 1)) / rows) : 0;
    const padX = cellWidth * 0.05;
    const padY = cellHeight * 0.06;
    for (let index = 0; index < slide.blocks.length; index += 1) {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const block = slide.blocks[index];
      placed.push({
        block,
        box: makeBox(
          marginX + column * (cellWidth + gapX) + padX,
          contentTop + row * (cellHeight + gapY) + padY,
          Math.max(0, cellWidth - padX * 2),
          Math.max(0, cellHeight - padY * 2),
        ),
      });
    }
    flowBottom = rows > 0 ? contentTop + rows * cellHeight + (rows - 1) * gapY : contentTop;
  } else {
    const stacked = stackBlocks(slide.blocks, theme, marginX, contentTop, innerWidth);
    placed = stacked.blocks;
    flowBottom = stacked.bottom;
  }

  const gridOverflow =
    slide.layout === 'grid' &&
    placed.some(({ block, box }) => measureBlock(block, theme, box.w) > box.h);
  const boundsOverflow = placed.some(
    ({ box }) =>
      box.x < marginX - 1e-6 ||
      box.x + box.w > width - marginX + 1e-6 ||
      box.y < 0 ||
      box.y + box.h > contentBottom + 1e-6,
  );
  const chromeOverflow =
    (title !== null && title.box.y + title.box.h > contentBottom) ||
    (subtitle !== null && subtitle.box.y + subtitle.box.h > contentBottom);

  return {
    title,
    subtitle,
    blocks: placed,
    asides: asideLayout.blocks,
    overflow:
      gridOverflow ||
      boundsOverflow ||
      chromeOverflow ||
      flowBottom > contentBottom + 1e-6 ||
      asideLayout.bottom > contentBottom + 1e-6,
  };
}
