import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PARAMETER,
  clampParameter,
  mergeParameters,
  parametersForGraph,
} from '$lib/graph/parameters';
import type { GraphObject, GraphParameter } from '$lib/types';

function parameter(name: string, overrides: Partial<GraphParameter> = {}): GraphParameter {
  return {
    name,
    value: 2,
    min: -10,
    max: 10,
    step: 0.25,
    ...overrides,
  };
}

function graph(functions: GraphObject['functions'], parameters?: GraphParameter[]): GraphObject {
  return {
    id: 'graph-1',
    createdAt: 0,
    type: 'graph',
    bounds: { x: 0, y: 0, w: 200, h: 100 },
    xRange: [-10, 10],
    yRange: [-10, 10],
    gridStep: 1,
    showAxes: true,
    showGrid: true,
    functions,
    parameters,
  };
}

describe('mergeParameters', () => {
  it('preserves surviving settings, adds defaults, and drops removed names', () => {
    const existing = [parameter('a'), parameter('removed', { value: 4 })];
    expect(mergeParameters(existing, ['a', 'b'])).toEqual([
      parameter('a'),
      { name: 'b', ...DEFAULT_PARAMETER },
    ]);
  });

  it('does not mutate the input array or its objects', () => {
    const existing = Object.freeze([
      Object.freeze(parameter('a', { showChip: true })),
      Object.freeze(parameter('b')),
    ]);
    const snapshot = JSON.stringify(existing);
    const merged = mergeParameters(existing, ['b', 'a']);

    expect(JSON.stringify(existing)).toBe(snapshot);
    expect(merged).toEqual([parameter('b'), parameter('a', { showChip: true })]);
    expect(merged[0]).not.toBe(existing[1]);
    expect(merged[1]).not.toBe(existing[0]);
  });
});

describe('parametersForGraph', () => {
  it('unions parameters across functions and preserves shared values', () => {
    const value = graph(
      [
        {
          id: 'f1',
          expr: 'a*sin(x)',
          kind: 'explicit',
          color: '#000000',
          width: 2,
          dash: 'solid',
          domain: null,
        },
        {
          id: 'f2',
          expr: 'a*cos(x) + b',
          kind: 'explicit',
          color: '#000000',
          width: 2,
          dash: 'solid',
          domain: null,
        },
      ],
      [parameter('a', { value: 3 })],
    );

    expect(parametersForGraph(value)).toEqual([
      parameter('a', { value: 3 }),
      { name: 'b', ...DEFAULT_PARAMETER },
    ]);
  });
});

describe('clampParameter', () => {
  it('repairs non-finite fields without throwing', () => {
    expect(() =>
      clampParameter(
        parameter('a', {
          value: Number.NaN,
          min: Number.NEGATIVE_INFINITY,
          max: Number.POSITIVE_INFINITY,
          step: Number.NaN,
        }),
      ),
    ).not.toThrow();
    expect(
      clampParameter(
        parameter('a', {
          value: Number.NaN,
          min: Number.NEGATIVE_INFINITY,
          max: Number.POSITIVE_INFINITY,
          step: Number.NaN,
        }),
      ),
    ).toEqual({ name: 'a', ...DEFAULT_PARAMETER });
  });

  it('orders bounds, forces a positive step, and clamps the value', () => {
    expect(clampParameter(parameter('a', { min: 5, max: -2, step: 0, value: 20 }))).toEqual({
      name: 'a',
      min: -2,
      max: 5,
      step: 0.1,
      value: 5,
    });
    expect(clampParameter(parameter('b', { step: -1, value: -20 }))).toEqual({
      name: 'b',
      min: -10,
      max: 10,
      step: 0.1,
      value: -10,
    });
  });
});
