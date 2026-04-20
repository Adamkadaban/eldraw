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
