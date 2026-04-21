/**
 * Axis tick + grid math for graph objects. Pure functions; no canvas / DOM.
 */

const NICE_MULTIPLIERS: readonly number[] = [1, 2, 5, 10];

/**
 * Return a "nice" step size so that `range / step` is close to `targetCount`.
 * The step is always of the form m × 10^k with m ∈ {1, 2, 5, 10}, giving
 * human-friendly tick spacing across any scale.
 */
export function niceStep(range: number, targetCount: number): number {
  if (!Number.isFinite(range) || range <= 0) return 1;
  if (!Number.isFinite(targetCount) || targetCount <= 0) return range;

  const rough = range / targetCount;
  const exponent = Math.floor(Math.log10(rough));
  const pow = 10 ** exponent;
  const mantissa = rough / pow;

  let best = NICE_MULTIPLIERS[0];
  let bestErr = Infinity;
  for (const m of NICE_MULTIPLIERS) {
    const err = Math.abs(Math.log(m / mantissa));
    if (err < bestErr) {
      bestErr = err;
      best = m;
    }
  }
  return best * pow;
}

/**
 * Tick values (multiples of `step`, or a `niceStep` of the range when `step`
 * is omitted) contained in `[min, max]`, in ascending order.
 */
export function generateTicks(min: number, max: number, step?: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [];
  const s = step ?? niceStep(max - min, 8);
  if (!(s > 0) || !Number.isFinite(s)) return [];

  const eps = s * 1e-9;
  const first = Math.ceil(min / s - 1e-9);
  const last = Math.floor(max / s + 1e-9);
  const ticks: number[] = [];
  for (let i = first; i <= last; i += 1) {
    const v = i * s;
    if (v >= min - eps && v <= max + eps) ticks.push(v === 0 ? 0 : v);
  }
  return ticks;
}

/**
 * Decimal places needed to render multiples of `step` without trailing noise.
 * Derived from the step's own decimal representation so e.g. `0.25` keeps
 * 2 digits. Capped at 12 for safety.
 */
export function tickDecimals(step: number): number {
  if (!(step > 0) || !Number.isFinite(step)) return 0;
  const s = step.toString();
  if (s.includes('e') || s.includes('E')) {
    const m = /e(-?\d+)/i.exec(s);
    const exp = m ? parseInt(m[1], 10) : 0;
    const intPart = s.split('e')[0];
    const frac = intPart.includes('.') ? intPart.split('.')[1].length : 0;
    return Math.max(0, Math.min(12, frac - exp));
  }
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : Math.min(12, s.length - dot - 1);
}

/** Format a tick value with enough precision for the given step. */
export function formatTick(value: number, step: number): string {
  const d = tickDecimals(step);
  const rounded = Number(value.toFixed(d));
  if (Object.is(rounded, -0)) return '0';
  return d === 0 ? rounded.toString() : rounded.toFixed(d);
}
