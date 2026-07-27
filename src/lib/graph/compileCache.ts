/**
 * Keys and retention policy for compiled graph expressions.
 *
 * Compilation is cached per function so dragging a parameter re-samples
 * without re-parsing. The cache therefore has to be pruned when graphs or
 * functions go away, or it retains every expression ever compiled.
 */

export function graphFnCacheKey(graphId: string, fnId: string): string {
  return `${graphId}\u0000${fnId}`;
}

export interface CacheableGraph {
  id: string;
  functions: readonly { id: string }[];
}

/** Keys for every function currently present across the given graphs. */
export function liveCacheKeys(graphs: readonly CacheableGraph[]): Set<string> {
  const live = new Set<string>();
  for (const graph of graphs) {
    for (const fn of graph.functions) live.add(graphFnCacheKey(graph.id, fn.id));
  }
  return live;
}

/** Drop entries whose key is not in `live`. Returns the number removed. */
export function pruneCache(cache: Map<string, unknown>, live: ReadonlySet<string>): number {
  let removed = 0;
  for (const key of [...cache.keys()]) {
    if (live.has(key)) continue;
    cache.delete(key);
    removed += 1;
  }
  return removed;
}
