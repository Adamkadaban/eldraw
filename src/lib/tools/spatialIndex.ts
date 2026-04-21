import type { AnyObject } from '$lib/types';
import { estimateTextBounds } from '$lib/text/hitTest';

export interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface SpatialIndex {
  readonly cellSize: number;
  readonly objects: readonly AnyObject[];
  readonly bounds: ReadonlyMap<string, AABB>;
  readonly cells: ReadonlyMap<string, AnyObject[]>;
}

/**
 * Axis-aligned bounding box in PDF points for any object type.
 *
 * For strokes we inflate by half-thickness scaled by peak pressure, matching
 * the eraser hit-test; for angle marks we enclose the two ray segments plus
 * stroke half-width; for text we use the estimated text bounds.
 */
export function objectAabb(obj: AnyObject): AABB {
  switch (obj.type) {
    case 'stroke': {
      const baseHalf = obj.style.width / 2;
      if (obj.points.length === 0) {
        return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
      }
      let maxPressure = 0;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of obj.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
        if (p.pressure > maxPressure) maxPressure = p.pressure;
      }
      const half = Math.max(baseHalf, baseHalf * 2 * maxPressure);
      return { minX: minX - half, minY: minY - half, maxX: maxX + half, maxY: maxY + half };
    }
    case 'line': {
      const half = obj.style.width / 2;
      const minX = Math.min(obj.from.x, obj.to.x) - half;
      const minY = Math.min(obj.from.y, obj.to.y) - half;
      const maxX = Math.max(obj.from.x, obj.to.x) + half;
      const maxY = Math.max(obj.from.y, obj.to.y) + half;
      return { minX, minY, maxX, maxY };
    }
    case 'shape': {
      const half = obj.style.width / 2;
      const { x, y, w, h } = obj.bounds;
      return { minX: x - half, minY: y - half, maxX: x + w + half, maxY: y + h + half };
    }
    case 'numberline': {
      const half = obj.style.width / 2 + 6;
      return {
        minX: obj.from.x - half,
        minY: obj.from.y - half,
        maxX: obj.from.x + obj.length + half,
        maxY: obj.from.y + half,
      };
    }
    case 'graph': {
      const { x, y, w, h } = obj.bounds;
      return { minX: x, minY: y, maxX: x + w, maxY: y + h };
    }
    case 'text': {
      const b = estimateTextBounds(obj);
      return { minX: b.x, minY: b.y, maxX: b.x + b.width, maxY: b.y + b.height };
    }
    case 'angleMark': {
      const half = obj.width / 2;
      const xs = [obj.vertex.x, obj.rayA.x, obj.rayB.x];
      const ys = [obj.vertex.y, obj.rayA.y, obj.rayB.y];
      return {
        minX: Math.min(...xs) - half,
        minY: Math.min(...ys) - half,
        maxX: Math.max(...xs) + half,
        maxY: Math.max(...ys) + half,
      };
    }
    default: {
      const _exhaustive: never = obj;
      void _exhaustive;
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }
  }
}

function cellKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

function cellRange(
  aabb: AABB,
  cellSize: number,
): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: Math.floor(aabb.minX / cellSize),
    y0: Math.floor(aabb.minY / cellSize),
    x1: Math.floor(aabb.maxX / cellSize),
    y1: Math.floor(aabb.maxY / cellSize),
  };
}

// Full rebuild on `pageObjects` change is the MVP. Incremental updates are
// a follow-up if profiling ever shows rebuild cost dominates a frame on a
// very large page.
export function createSpatialIndex(objects: readonly AnyObject[], cellSize = 64): SpatialIndex {
  if (cellSize <= 0) throw new Error('cellSize must be positive');
  const bounds = new Map<string, AABB>();
  const cells = new Map<string, AnyObject[]>();
  for (const obj of objects) {
    const b = objectAabb(obj);
    bounds.set(obj.id, b);
    const { x0, y0, x1, y1 } = cellRange(b, cellSize);
    for (let cy = y0; cy <= y1; cy += 1) {
      for (let cx = x0; cx <= x1; cx += 1) {
        const key = cellKey(cx, cy);
        const bucket = cells.get(key);
        if (bucket) bucket.push(obj);
        else cells.set(key, [obj]);
      }
    }
  }
  return { cellSize, objects, bounds, cells };
}

function aabbOverlaps(a: AABB, b: AABB): boolean {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

export function queryRect(
  index: SpatialIndex,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): AnyObject[] {
  const q: AABB = { minX, minY, maxX, maxY };
  const range = cellRange(q, index.cellSize);
  const seen = new Set<string>();
  const out: AnyObject[] = [];
  for (let cy = range.y0; cy <= range.y1; cy += 1) {
    for (let cx = range.x0; cx <= range.x1; cx += 1) {
      const bucket = index.cells.get(cellKey(cx, cy));
      if (!bucket) continue;
      for (const obj of bucket) {
        if (seen.has(obj.id)) continue;
        const b = index.bounds.get(obj.id);
        if (!b || !aabbOverlaps(b, q)) continue;
        seen.add(obj.id);
        out.push(obj);
      }
    }
  }
  return out;
}

export function queryPoint(index: SpatialIndex, x: number, y: number, radius = 0): AnyObject[] {
  return queryRect(index, x - radius, y - radius, x + radius, y + radius);
}
