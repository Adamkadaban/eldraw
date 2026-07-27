import { numberLineValueToX } from '$lib/tools/shapes';
import type {
  NumberLineMarkKind,
  NumberLineObject,
  SlideNumberLineBlock,
  SlideTheme,
} from '$lib/types';

export interface NumberLineTick {
  value: number;
  x: number;
}

export interface NumberLineMarkGeometry extends NumberLineTick {
  kind: NumberLineMarkKind;
}

export interface SlideNumberLineGeometry {
  valid: boolean;
  x0: number;
  x1: number;
  y: number;
  ticks: NumberLineTick[];
  labels: NumberLineTick[];
  marks: NumberLineMarkGeometry[];
  captionY: number | null;
  arrowSize: number;
}

export const MAX_NUMBER_LINE_TICKS = 200;
export const MAX_NUMBER_LINE_LABELS = 80;

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function valuesForStep(min: number, max: number, requestedStep: number, maximum: number): number[] {
  if (!Number.isFinite(requestedStep) || requestedStep <= 0) return [];
  const span = max - min;
  const multiple = Math.max(1, Math.ceil(span / requestedStep / maximum));
  const step = requestedStep * multiple;
  const first = Math.ceil(min / step - 1e-10) * step;
  const values: number[] = [];
  for (let index = 0; index < maximum; index += 1) {
    const value = first + index * step;
    if (value > max + step * 1e-9) break;
    values.push(value);
  }
  return values;
}

/** Build slide number-line geometry through the annotation value-to-x mapping. */
export function slideNumberLineGeometry(
  block: SlideNumberLineBlock,
  width: number,
  height: number,
  theme: SlideTheme,
): SlideNumberLineGeometry {
  const w = Math.max(0, finite(width, 0));
  const h = Math.max(0, finite(height, 0));
  const bodySize = Math.max(1, finite(theme.bodySize, 13));
  const captionHeight = block.caption ? Math.min(h * 0.2, bodySize * 1.6) : 0;
  const xPadding = Math.min(w / 2, Math.max(bodySize * 1.8, w * 0.055));
  const x0 = xPadding;
  const x1 = Math.max(x0, w - xPadding);
  const y = captionHeight + Math.max(0, h - captionHeight) * 0.48;
  const min = finite(block.min, 0);
  const max = finite(block.max, 0);
  const valid = max > min && x1 > x0;
  if (!valid) {
    return {
      valid: false,
      x0,
      x1,
      y,
      ticks: [],
      labels: [],
      marks: [],
      captionY: block.caption ? captionHeight * 0.45 : null,
      arrowSize: Math.min(bodySize * 0.55, w * 0.018),
    };
  }

  const annotationLine: NumberLineObject = {
    id: 'slide-numberline',
    createdAt: 0,
    type: 'numberline',
    style: { color: theme.textColor, width: 1.5, dash: 'solid', opacity: 1 },
    from: { x: x0, y },
    length: x1 - x0,
    min,
    max,
    tickStep: block.tickStep,
    labelStep: block.labelStep,
    marks: block.marks,
  };
  const toTick = (value: number): NumberLineTick => ({
    value,
    x: numberLineValueToX(annotationLine, value),
  });
  const marks = block.marks
    .filter((mark) => Number.isFinite(mark.value) && mark.value >= min && mark.value <= max)
    .map((mark) => ({ ...toTick(mark.value), kind: mark.kind }));
  return {
    valid: true,
    x0,
    x1,
    y,
    ticks: valuesForStep(min, max, block.tickStep, MAX_NUMBER_LINE_TICKS).map(toTick),
    labels: valuesForStep(min, max, block.labelStep, MAX_NUMBER_LINE_LABELS).map(toTick),
    marks,
    captionY: block.caption ? captionHeight * 0.45 : null,
    arrowSize: Math.min(bodySize * 0.55, w * 0.018),
  };
}
