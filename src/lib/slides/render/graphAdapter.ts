import { isSafeHexColor } from '$lib/color';
import { resolveTheme as resolveGraphTheme, type GraphTheme } from '$lib/graph/theme';
import type { GraphFunction, GraphObject, SlideGraphSpec, SlideTheme } from '$lib/types';
import type { LayoutBox } from '../layout';

function safeRange(value: [number, number], fallback: [number, number]): [number, number] {
  return Number.isFinite(value[0]) && Number.isFinite(value[1]) && value[1] > value[0]
    ? value
    : fallback;
}

function safeFunction(fn: GraphFunction, theme: SlideTheme): GraphFunction {
  return {
    ...fn,
    color: isSafeHexColor(fn.color) ? fn.color : theme.accent,
    width: Number.isFinite(fn.width) && fn.width > 0 ? Math.min(fn.width, 20) : 2,
    dash: fn.dash === 'dashed' || fn.dash === 'dotted' ? fn.dash : 'solid',
    domain:
      fn.domain &&
      Number.isFinite(fn.domain[0]) &&
      Number.isFinite(fn.domain[1]) &&
      fn.domain[1] > fn.domain[0]
        ? fn.domain
        : null,
  };
}

/** Adapt a slide graph into the existing GraphLayer data contract. */
export function graphObjectForSlide(
  spec: SlideGraphSpec,
  box: LayoutBox,
  theme: SlideTheme,
): GraphObject {
  return {
    id: 'slide-graph',
    createdAt: 0,
    type: 'graph',
    bounds: { x: 0, y: 0, w: Math.max(0, box.w), h: Math.max(0, box.h) },
    xRange: safeRange(spec.xRange, [-10, 10]),
    yRange: safeRange(spec.yRange, [-10, 10]),
    gridStep: Number.isFinite(spec.gridStep) && spec.gridStep > 0 ? spec.gridStep : 0,
    showAxes: spec.showAxes === true,
    showGrid: spec.showGrid === true,
    functions: spec.functions.map((fn) => safeFunction(fn, theme)),
  };
}

export function graphThemeForSlide(theme: SlideTheme, ptToPx: number): GraphTheme {
  const graphTheme = resolveGraphTheme({ graphTheme: 'classic' });
  return {
    ...graphTheme,
    background: theme.background,
    frameColor: theme.accent,
    axisColor: theme.textColor,
    labelColor: theme.textColor,
    labelFontFamily: theme.fontFamily,
    labelFontSize: Math.max(7, theme.bodySize * ptToPx * 0.75),
    gridMajor: { ...graphTheme.gridMajor, color: theme.accent, opacity: 0.25 },
    gridMinor: { ...graphTheme.gridMinor, color: theme.accent, opacity: 0.1 },
  };
}
