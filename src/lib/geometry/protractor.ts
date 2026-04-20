import { rotate, type Vec2 } from './transform';

export interface ProtractorState {
  center: Vec2;
  radius: number;
  /** Rotation in degrees, CCW from the protractor's 0° axis to screen-right. */
  rotation: number;
  /** 'semi' = 180° half-disc, 'full' = 360° disc. */
  shape: 'semi' | 'full';
}

export interface ProtractorTick {
  angle: number;
  outer: Vec2;
  inner: Vec2;
  label: string | null;
}

export interface TickOptions {
  /** Degrees between minor ticks. Default 1. */
  minor: number;
  /** Degrees between major (labelled) ticks. Default 10. */
  major: number;
  /** Inner radius factor for minor ticks (0..1). Default 0.92. */
  minorInner: number;
  /** Inner radius factor for major ticks (0..1). Default 0.84. */
  majorInner: number;
}

const DEFAULT_OPTS: TickOptions = {
  minor: 1,
  major: 10,
  minorInner: 0.92,
  majorInner: 0.84,
};

export function protractorTicks(
  state: ProtractorState,
  opts: Partial<TickOptions> = {},
): ProtractorTick[] {
  const o = { ...DEFAULT_OPTS, ...opts };
  const sweep = state.shape === 'semi' ? 180 : 360;
  const ticks: ProtractorTick[] = [];
  for (let a = 0; a <= sweep; a += o.minor) {
    if (state.shape === 'full' && a === sweep) break;
    const isMajor = a % o.major === 0;
    const innerR = state.radius * (isMajor ? o.majorInner : o.minorInner);
    const outer = rotate(
      { x: state.center.x + state.radius, y: state.center.y },
      a + state.rotation,
      state.center,
    );
    const inner = rotate(
      { x: state.center.x + innerR, y: state.center.y },
      a + state.rotation,
      state.center,
    );
    ticks.push({
      angle: a,
      outer,
      inner,
      label: isMajor ? String(a) : null,
    });
  }
  return ticks;
}

/**
 * Angle at the protractor's scale given a screen point, in [0, 360). The
 * caller is responsible for hiding readings outside the visible sweep on a
 * semicircular protractor.
 */
export function angleAtPoint(state: ProtractorState, p: Vec2): number {
  const dx = p.x - state.center.x;
  const dy = p.y - state.center.y;
  const raw = (Math.atan2(dy, dx) * 180) / Math.PI - state.rotation;
  let a = raw % 360;
  if (a < 0) a += 360;
  return a;
}
