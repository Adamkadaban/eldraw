import type { GraphFunction, GraphObject } from '$lib/types';
import { nextCurveColor } from './curvePalette';

function uid(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function createGraphObject(bounds: {
  x: number;
  y: number;
  w: number;
  h: number;
}): GraphObject {
  const starter: GraphFunction = {
    id: uid('fn'),
    expr: 'x',
    kind: 'explicit',
    color: nextCurveColor([]),
    width: 1.8,
    dash: 'solid',
    domain: null,
  };
  return {
    id: uid('graph'),
    createdAt: Date.now(),
    type: 'graph',
    bounds,
    xRange: [-10, 10],
    yRange: [-10, 10],
    gridStep: 0,
    showAxes: true,
    showGrid: true,
    functions: [starter],
  };
}

export function createGraphFunction(existing: readonly GraphFunction[] = []): GraphFunction {
  return {
    id: uid('fn'),
    expr: 'x',
    kind: 'explicit',
    color: nextCurveColor(existing.map((fn) => fn.color)),
    width: 1.8,
    dash: 'solid',
    domain: null,
  };
}
