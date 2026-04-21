import type { AnyObject } from '$lib/types';
import { hitTestObject } from '$lib/tools/eraser';
import { queryPoint, queryRect, type SpatialIndex } from '$lib/tools/spatialIndex';
import { objectIntersectsPolygon, type Rect, type Vec2 } from './geometry';
import { objectAabb } from '$lib/tools/spatialIndex';

/**
 * Topmost object under the pointer, or null when nothing is hit. Iterates
 * spatial-index candidates and falls back to the full list when no index is
 * available (e.g., tests).
 */
export function pickTopAt(
  objects: readonly AnyObject[],
  index: SpatialIndex | null,
  at: Vec2,
  radius: number,
): AnyObject | null {
  const candidates = index ? queryPoint(index, at.x, at.y, radius) : objects;
  let best: AnyObject | null = null;
  let bestRank = -Infinity;
  const rankOf = new Map<string, number>();
  for (let i = 0; i < objects.length; i += 1) rankOf.set(objects[i].id, i);
  for (const obj of candidates) {
    if (!hitTestObject(obj, at, radius)) continue;
    const rank = rankOf.get(obj.id) ?? -1;
    if (rank > bestRank) {
      bestRank = rank;
      best = obj;
    }
  }
  return best;
}

export function pickInMarquee(
  objects: readonly AnyObject[],
  index: SpatialIndex | null,
  rect: Rect,
): AnyObject[] {
  const candidates = index
    ? queryRect(index, rect.x, rect.y, rect.x + rect.w, rect.y + rect.h)
    : objects;
  const seen = new Set<string>();
  const out: AnyObject[] = [];
  for (const obj of candidates) {
    if (seen.has(obj.id)) continue;
    const b = objectAabb(obj);
    if (
      b.maxX < rect.x ||
      b.minX > rect.x + rect.w ||
      b.maxY < rect.y ||
      b.minY > rect.y + rect.h
    ) {
      continue;
    }
    seen.add(obj.id);
    out.push(obj);
  }
  return out;
}

export function pickInLasso(
  objects: readonly AnyObject[],
  index: SpatialIndex | null,
  polygon: readonly Vec2[],
): AnyObject[] {
  if (polygon.length < 3) return [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of polygon) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const bbox: Rect = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  const candidates = index
    ? queryRect(index, bbox.x, bbox.y, bbox.x + bbox.w, bbox.y + bbox.h)
    : objects;
  const seen = new Set<string>();
  const out: AnyObject[] = [];
  for (const obj of candidates) {
    if (seen.has(obj.id)) continue;
    const b = objectAabb(obj);
    const aabb: Rect = { x: b.minX, y: b.minY, w: b.maxX - b.minX, h: b.maxY - b.minY };
    if (objectIntersectsPolygon(obj, polygon, aabb)) {
      seen.add(obj.id);
      out.push(obj);
    }
  }
  return out;
}
