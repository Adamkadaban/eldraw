import type { AnyObject } from '$lib/types';
import { hitTestObjectsFromCandidates } from '$lib/tools/eraser';
import { queryPoint, type SpatialIndex } from '$lib/tools/spatialIndex';

export interface ErasePoint {
  x: number;
  y: number;
}

/**
 * Pure rAF-flush body for the eraser. Given a batch of pointer samples and a
 * spatial index, return the deduped set of object ids that the eraser covers
 * across the whole batch. Extracted as a free function so it can be tested
 * without a DOM.
 */
export function collectEraseIds(
  samples: readonly ErasePoint[],
  radius: number,
  index: SpatialIndex,
): string[] {
  if (samples.length === 0) return [];
  const ids = new Set<string>();
  for (const s of samples) {
    const candidates = queryPoint(index, s.x, s.y, radius);
    if (candidates.length === 0) continue;
    const hits = hitTestObjectsFromCandidates(candidates, s, radius);
    for (const id of hits) ids.add(id);
  }
  return [...ids];
}

/**
 * Build the flush handler used by `createRafBatcher`. Kept separate so callers
 * can inject the current `SpatialIndex` + `removeObjects` binding reactively.
 */
export function makeEraseFlush(
  getIndex: () => SpatialIndex | null,
  radius: number,
  remove: (ids: string[]) => void,
  onStats?: (hits: number) => void,
): (samples: ErasePoint[]) => void {
  return (samples) => {
    const index = getIndex();
    if (!index) return;
    const ids = collectEraseIds(samples, radius, index);
    if (ids.length === 0) return;
    remove(ids);
    onStats?.(ids.length);
  };
}

// Re-exported for callers that want to pre-filter without the full pipeline.
export type { AnyObject };
