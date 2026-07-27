import type { SlideMappingBlock } from '$lib/types';

export interface MappingPoint {
  x: number;
  y: number;
}

export interface MappingOval {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface MappingItemPosition extends MappingPoint {
  index: number;
  text: string;
}

export interface MappingArrow {
  from: MappingPoint;
  to: MappingPoint;
  head: [MappingPoint, MappingPoint, MappingPoint];
}

export interface MappingGeometry {
  leftOval: MappingOval;
  rightOval: MappingOval;
  leftItems: MappingItemPosition[];
  rightItems: MappingItemPosition[];
  arrows: MappingArrow[];
  leftLabel: MappingPoint;
  rightLabel: MappingPoint;
  caption: MappingPoint | null;
}

export const MAX_MAPPING_ITEMS = 48;

function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function itemPositions(
  values: string[],
  oval: MappingOval,
  bodySize: number,
): MappingItemPosition[] {
  if (oval.ry <= 0) return [];
  const maximumByHeight = Math.max(1, Math.floor((oval.ry * 1.4) / (bodySize * 1.05)) + 1);
  const visible = values.slice(0, Math.min(MAX_MAPPING_ITEMS, maximumByHeight));
  if (visible.length === 0) return [];
  if (visible.length === 1) {
    return [{ index: 0, text: visible[0], x: oval.cx, y: oval.cy }];
  }
  const usableHeight = oval.ry * 1.4;
  const spacing = usableHeight / (visible.length - 1);
  return visible.map((text, index) => ({
    index,
    text,
    x: oval.cx,
    y: oval.cy - usableHeight / 2 + spacing * index,
  }));
}

function ovalHeight(itemCount: number, availableHeight: number, bodySize: number): number {
  const count = Math.min(MAX_MAPPING_ITEMS, Math.max(0, itemCount));
  const desired = Math.max(bodySize * 3, count * bodySize * 1.55 + bodySize);
  return Math.min(availableHeight, desired);
}

function arrowHead(from: MappingPoint, to: MappingPoint, size: number): MappingArrow['head'] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return [to, to, to];
  const ux = dx / length;
  const uy = dy / length;
  const px = -uy;
  const py = ux;
  const base = { x: to.x - ux * size, y: to.y - uy * size };
  return [
    to,
    { x: base.x + px * size * 0.45, y: base.y + py * size * 0.45 },
    { x: base.x - px * size * 0.45, y: base.y - py * size * 0.45 },
  ];
}

/** Compute bounded local coordinates for a mapping diagram. */
export function mappingGeometry(
  block: SlideMappingBlock,
  width: number,
  height: number,
  fontSize: number,
): MappingGeometry {
  const w = nonNegative(width);
  const h = nonNegative(height);
  const bodySize = nonNegative(fontSize) || 13;
  const captionHeight = block.caption ? Math.min(h * 0.16, bodySize * 1.5) : 0;
  const labelHeight = Math.min(Math.max(0, h - captionHeight), bodySize * 1.6);
  const diagramTop = captionHeight;
  const diagramHeight = Math.max(0, h - captionHeight - labelHeight);
  const ovalWidth = w / 3;
  const rx = ovalWidth * 0.42;
  const leftHeight = ovalHeight(block.left.length, diagramHeight, bodySize);
  const rightHeight = ovalHeight(block.right.length, diagramHeight, bodySize);
  const diagramCenterY = diagramTop + diagramHeight / 2;
  const leftOval: MappingOval = {
    cx: w / 6,
    cy: diagramCenterY,
    rx,
    ry: leftHeight / 2,
  };
  const rightOval: MappingOval = {
    cx: (w * 5) / 6,
    cy: diagramCenterY,
    rx,
    ry: rightHeight / 2,
  };
  const leftItems = itemPositions(block.left, leftOval, bodySize);
  const rightItems = itemPositions(block.right, rightOval, bodySize);
  const arrowSize = Math.min(bodySize * 0.45, w * 0.018);
  const arrows: MappingArrow[] = [];

  for (const pair of block.pairs) {
    if (
      !Number.isInteger(pair.from) ||
      !Number.isInteger(pair.to) ||
      pair.from < 0 ||
      pair.to < 0 ||
      pair.from >= leftItems.length ||
      pair.to >= rightItems.length
    ) {
      continue;
    }
    const source = leftItems[pair.from];
    const target = rightItems[pair.to];
    const from = { x: leftOval.cx + leftOval.rx * 0.72, y: source.y };
    const to = { x: rightOval.cx - rightOval.rx * 0.72, y: target.y };
    arrows.push({ from, to, head: arrowHead(from, to, arrowSize) });
  }

  const labelY = Math.min(h, diagramTop + diagramHeight + labelHeight * 0.55);
  return {
    leftOval,
    rightOval,
    leftItems,
    rightItems,
    arrows,
    leftLabel: { x: leftOval.cx, y: labelY },
    rightLabel: { x: rightOval.cx, y: labelY },
    caption: block.caption ? { x: w / 2, y: captionHeight * 0.45 } : null,
  };
}
