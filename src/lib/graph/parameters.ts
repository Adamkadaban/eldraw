import type { GraphObject, GraphParameter } from '$lib/types';
import { freeVariables } from './parser';

export const DEFAULT_PARAMETER: Omit<GraphParameter, 'name'> = {
  value: 1,
  min: -5,
  max: 5,
  step: 0.1,
};

export function mergeParameters(
  existing: readonly GraphParameter[] | undefined,
  names: readonly string[],
): GraphParameter[] {
  const byName = new Map<string, GraphParameter>();
  for (const parameter of existing ?? []) {
    if (!byName.has(parameter.name)) byName.set(parameter.name, parameter);
  }

  const seen = new Set<string>();
  const merged: GraphParameter[] = [];
  for (const name of names) {
    if (seen.has(name)) continue;
    seen.add(name);
    const parameter = byName.get(name);
    merged.push(parameter ? { ...parameter } : { name, ...DEFAULT_PARAMETER });
  }
  return merged;
}

export function parametersForGraph(graph: GraphObject): GraphParameter[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const fn of graph.functions) {
    const reserved = fn.kind === 'implicit' ? ['x', 'y'] : ['x'];
    for (const name of freeVariables(fn.expr, reserved)) {
      if (seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
  }
  return mergeParameters(graph.parameters, names).map(clampParameter);
}

export function clampParameter(parameter: GraphParameter): GraphParameter {
  let min = Number.isFinite(parameter.min) ? parameter.min : DEFAULT_PARAMETER.min;
  let max = Number.isFinite(parameter.max) ? parameter.max : DEFAULT_PARAMETER.max;
  if (min > max) [min, max] = [max, min];

  const step =
    Number.isFinite(parameter.step) && parameter.step > 0 ? parameter.step : DEFAULT_PARAMETER.step;
  const candidate = Number.isFinite(parameter.value) ? parameter.value : DEFAULT_PARAMETER.value;
  const value = Math.min(max, Math.max(min, candidate));

  return {
    name: parameter.name,
    value,
    min,
    max,
    step,
    ...(typeof parameter.showChip === 'boolean' ? { showChip: parameter.showChip } : {}),
  };
}
