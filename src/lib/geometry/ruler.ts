import { rotate, type Vec2 } from './transform';

export type RulerUnit = 'pt' | 'in' | 'cm';

export interface RulerState {
  from: Vec2;
  /** Rotation in degrees from horizontal, CCW. */
  rotation: number;
  /** Ruler length in PDF points. */
  length: number;
  unit: RulerUnit;
}

export interface RulerTick {
  along: number;
  isMajor: boolean;
  label: string | null;
  root: Vec2;
  tip: Vec2;
}

export interface RulerTickOptions {
  /** Minor tick spacing in the unit. Default unit-specific. */
  minor: number;
  /** Major (labelled) tick spacing in the unit. Default unit-specific. */
  major: number;
  /** Minor tick length in PDF points. Default 4. */
  minorLen: number;
  /** Major tick length in PDF points. Default 10. */
  majorLen: number;
}

export const PT_PER_INCH = 72;
export const PT_PER_CM = 72 / 2.54;

export function ptPerUnit(unit: RulerUnit): number {
  if (unit === 'in') return PT_PER_INCH;
  if (unit === 'cm') return PT_PER_CM;
  return 1;
}

function defaultOptsFor(unit: RulerUnit): RulerTickOptions {
  if (unit === 'in') return { minor: 1 / 16, major: 1, minorLen: 4, majorLen: 10 };
  if (unit === 'cm') return { minor: 1, major: 10, minorLen: 4, majorLen: 10 };
  return { minor: 10, major: 50, minorLen: 4, majorLen: 10 };
}

/**
 * Evenly-spaced ruler ticks along the long edge. Returns root/tip positions in
 * PDF-space coordinates after applying the ruler's rotation around `from`.
 */
export function rulerTicks(state: RulerState, opts: Partial<RulerTickOptions> = {}): RulerTick[] {
  const base = defaultOptsFor(state.unit);
  const o = { ...base, ...opts };
  const ptPerUnitValue = ptPerUnit(state.unit);
  const totalUnits = state.length / ptPerUnitValue;
  const ticks: RulerTick[] = [];
  const majorStep = Math.round(o.major / o.minor);
  const count = Math.floor(totalUnits / o.minor);
  for (let i = 0; i <= count; i += 1) {
    const along = i * o.minor * ptPerUnitValue;
    const isMajor = majorStep > 0 && i % majorStep === 0;
    const len = isMajor ? o.majorLen : o.minorLen;
    const root = rotate({ x: state.from.x + along, y: state.from.y }, state.rotation, state.from);
    const tip = rotate(
      { x: state.from.x + along, y: state.from.y + len },
      state.rotation,
      state.from,
    );
    ticks.push({
      along,
      isMajor,
      label: isMajor ? formatMajorLabel(i * o.minor, state.unit) : null,
      root,
      tip,
    });
  }
  return ticks;
}

function formatMajorLabel(valueInUnit: number, unit: RulerUnit): string {
  if (unit === 'pt') return String(Math.round(valueInUnit));
  return `${Math.round(valueInUnit)}`;
}

/** End point of the ruler in PDF-space after rotation. */
export function rulerEnd(state: RulerState): Vec2 {
  return rotate({ x: state.from.x + state.length, y: state.from.y }, state.rotation, state.from);
}

export interface RulerEdge {
  a: Vec2;
  b: Vec2;
}

/** Long edge (segment) of the ruler in PDF-space. */
export function rulerEdge(state: RulerState): RulerEdge {
  return { a: state.from, b: rulerEnd(state) };
}

/** Orthogonal projection of `p` onto the infinite line through `a`–`b`. */
export function projectOntoLine(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { x: a.x, y: a.y };
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/** Shortest distance from `p` to the *segment* a–b. */
export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) {
    const ex = p.x - a.x;
    const ey = p.y - a.y;
    return Math.sqrt(ex * ex + ey * ey);
  }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  const ex = p.x - cx;
  const ey = p.y - cy;
  return Math.sqrt(ex * ex + ey * ey);
}

export interface RulerSnapResult {
  point: Vec2;
  snapped: boolean;
}

/**
 * Snap a point to the ruler's long edge when within `thresholdPt` of the
 * segment. Snapping projects onto the infinite line through the edge so ink
 * continues straight even past the ruler's ends; the proximity test uses the
 * finite segment so snapping only triggers while the pen is "touching" the
 * physical straightedge.
 */
export function snapPointToRuler(p: Vec2, state: RulerState, thresholdPt: number): RulerSnapResult {
  const { a, b } = rulerEdge(state);
  const dist = distanceToSegment(p, a, b);
  if (dist > thresholdPt) return { point: { x: p.x, y: p.y }, snapped: false };
  return { point: projectOntoLine(p, a, b), snapped: true };
}

/**
 * Snap a sequence of stroke points to the ruler edge pointwise, preserving
 * any extra per-point fields (pressure, t, …).
 */
export function snapStrokeToRuler<T extends Vec2>(
  points: readonly T[],
  state: RulerState,
  thresholdPt: number,
): T[] {
  return points.map((pt) => {
    const res = snapPointToRuler(pt, state, thresholdPt);
    if (!res.snapped) return { ...pt };
    return { ...pt, x: res.point.x, y: res.point.y };
  });
}
