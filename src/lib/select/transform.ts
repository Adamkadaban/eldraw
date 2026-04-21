import type { AnyObject, Point, StrokeStyle } from '$lib/types';

export interface Vec2 {
  x: number;
  y: number;
}

export interface Affine {
  translate?: Vec2;
  /** Uniform or non-uniform scale about `pivot`. */
  scale?: { sx: number; sy: number; pivot: Vec2 };
  /** Rotation in radians about `pivot`. */
  rotate?: { angle: number; pivot: Vec2 };
}

function applyAffine(p: Vec2, t: Affine): Vec2 {
  let x = p.x;
  let y = p.y;
  if (t.scale) {
    x = t.scale.pivot.x + (x - t.scale.pivot.x) * t.scale.sx;
    y = t.scale.pivot.y + (y - t.scale.pivot.y) * t.scale.sy;
  }
  if (t.rotate) {
    const dx = x - t.rotate.pivot.x;
    const dy = y - t.rotate.pivot.y;
    const c = Math.cos(t.rotate.angle);
    const s = Math.sin(t.rotate.angle);
    x = t.rotate.pivot.x + dx * c - dy * s;
    y = t.rotate.pivot.y + dx * s + dy * c;
  }
  if (t.translate) {
    x += t.translate.x;
    y += t.translate.y;
  }
  return { x, y };
}

function scaleWidth(style: StrokeStyle, factor: number): StrokeStyle {
  if (factor === 1) return style;
  const width = Math.max(0.25, Math.min(64, style.width * factor));
  return { ...style, width };
}

function scaleFactorFor(t: Affine): number {
  if (!t.scale) return 1;
  return Math.sqrt(Math.abs(t.scale.sx * t.scale.sy));
}

export interface TransformOptions {
  /**
   * When true, stroke / line widths scale with the transform. The default
   * is false so nudges and pure translations never touch width.
   */
  scaleStrokeWidth?: boolean;
}

/**
 * Return a new object with the transform applied to its intrinsic geometry.
 * For axis-aligned objects (shape, graph, numberline) rotation only moves
 * the object's anchor around the pivot; width/height are preserved so the
 * object stays axis-aligned. A future rotation-aware shape type can replace
 * this path without touching callers.
 */
export function transformObject(obj: AnyObject, t: Affine, opts: TransformOptions = {}): AnyObject {
  const factor = scaleFactorFor(t);
  const shouldScaleWidth = opts.scaleStrokeWidth === true && factor !== 1;

  switch (obj.type) {
    case 'stroke': {
      const points: Point[] = obj.points.map((p) => {
        const q = applyAffine({ x: p.x, y: p.y }, t);
        return { ...p, x: q.x, y: q.y };
      });
      return {
        ...obj,
        points,
        style: shouldScaleWidth ? scaleWidth(obj.style, factor) : obj.style,
      };
    }
    case 'line': {
      const from = applyAffine(obj.from, t);
      const to = applyAffine(obj.to, t);
      return {
        ...obj,
        from,
        to,
        style: shouldScaleWidth ? scaleWidth(obj.style, factor) : obj.style,
      };
    }
    case 'shape': {
      const corners = [
        { x: obj.bounds.x, y: obj.bounds.y },
        { x: obj.bounds.x + obj.bounds.w, y: obj.bounds.y + obj.bounds.h },
      ].map((p) => applyAffine(p, t));
      const x = Math.min(corners[0].x, corners[1].x);
      const y = Math.min(corners[0].y, corners[1].y);
      const w = Math.abs(corners[1].x - corners[0].x);
      const h = Math.abs(corners[1].y - corners[0].y);
      return {
        ...obj,
        bounds: { x, y, w, h },
        style: shouldScaleWidth ? scaleWidth(obj.style, factor) : obj.style,
      };
    }
    case 'numberline': {
      const from = applyAffine(obj.from, t);
      const length = obj.length * (t.scale?.sx ?? 1);
      return {
        ...obj,
        from,
        length,
        style: shouldScaleWidth ? scaleWidth(obj.style, factor) : obj.style,
      };
    }
    case 'graph': {
      const corners = [
        { x: obj.bounds.x, y: obj.bounds.y },
        { x: obj.bounds.x + obj.bounds.w, y: obj.bounds.y + obj.bounds.h },
      ].map((p) => applyAffine(p, t));
      const x = Math.min(corners[0].x, corners[1].x);
      const y = Math.min(corners[0].y, corners[1].y);
      const w = Math.abs(corners[1].x - corners[0].x);
      const h = Math.abs(corners[1].y - corners[0].y);
      return { ...obj, bounds: { x, y, w, h } };
    }
    case 'text': {
      const at = applyAffine(obj.at, t);
      const nextFontSize =
        shouldScaleWidth || (t.scale && (t.scale.sx !== 1 || t.scale.sy !== 1))
          ? Math.max(4, Math.min(256, obj.fontSize * factor))
          : obj.fontSize;
      return { ...obj, at, fontSize: nextFontSize };
    }
    case 'angleMark': {
      const vertex = applyAffine(obj.vertex, t);
      const rayA = applyAffine(obj.rayA, t);
      const rayB = applyAffine(obj.rayB, t);
      const width = shouldScaleWidth ? Math.max(0.25, Math.min(64, obj.width * factor)) : obj.width;
      return { ...obj, vertex, rayA, rayB, width };
    }
  }
}

export function translateObject(obj: AnyObject, dx: number, dy: number): AnyObject {
  return transformObject(obj, { translate: { x: dx, y: dy } });
}

export function applyStyleToObject(
  obj: AnyObject,
  patch: { color?: string; width?: number; dash?: StrokeStyle['dash'] },
): AnyObject {
  switch (obj.type) {
    case 'stroke':
    case 'line':
    case 'shape':
    case 'numberline': {
      const style: StrokeStyle = {
        ...obj.style,
        ...(patch.color !== undefined ? { color: patch.color } : {}),
        ...(patch.width !== undefined ? { width: patch.width } : {}),
        ...(patch.dash !== undefined ? { dash: patch.dash } : {}),
      };
      return { ...obj, style };
    }
    case 'text':
      return patch.color !== undefined ? { ...obj, color: patch.color } : obj;
    case 'graph': {
      if (patch.color === undefined && patch.width === undefined && patch.dash === undefined) {
        return obj;
      }
      return {
        ...obj,
        functions: obj.functions.map((f) => ({
          ...f,
          ...(patch.color !== undefined ? { color: patch.color } : {}),
          ...(patch.width !== undefined ? { width: patch.width } : {}),
          ...(patch.dash !== undefined ? { dash: patch.dash } : {}),
        })),
      };
    }
    case 'angleMark': {
      return {
        ...obj,
        ...(patch.color !== undefined ? { color: patch.color } : {}),
        ...(patch.width !== undefined ? { width: patch.width } : {}),
      };
    }
  }
}

export function supportsColor(obj: AnyObject): boolean {
  switch (obj.type) {
    case 'stroke':
    case 'line':
    case 'shape':
    case 'numberline':
    case 'text':
    case 'graph':
    case 'angleMark':
      return true;
  }
}

export function supportsWidth(obj: AnyObject): boolean {
  return obj.type !== 'text';
}

export function supportsDash(obj: AnyObject): boolean {
  return obj.type === 'line' || obj.type === 'shape' || obj.type === 'graph';
}
