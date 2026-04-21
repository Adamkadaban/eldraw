/**
 * 1€ low-pass filter for 2D pointer input.
 *
 * Reference: Casiez, Roussel & Vogel, "1€ Filter: A Simple Speed-based
 * Low-pass Filter for Noisy Input in Interactive Systems", CHI 2012.
 * http://cristal.univ-lille.fr/~casiez/1euro/
 *
 * We run this filter per stroke on the live input path. The same filtered
 * points feed both the preview render and the committed stroke, so the
 * preview and the commit are always point-identical. Issue #113.
 *
 * At stabilization=0 the filter is a byte-identical passthrough (sentinel
 * `minCutoff === Infinity`); at higher amounts `minCutoff` drops and `beta`
 * rises, so slow/tremor motion is aggressively smoothed while fast intended
 * motion loosens the cutoff and follows the pen.
 */
export interface OneEuroConfig {
  minCutoff: number;
  beta: number;
  dCutoff?: number;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface OneEuroFilter {
  filter(point: Point2D, tMs: number): Point2D;
  reset(): void;
}

export function createOneEuroFilter(config: OneEuroConfig): OneEuroFilter {
  const minCutoff = config.minCutoff;
  const beta = config.beta;
  const dCutoff = config.dCutoff ?? 1.0;
  const passthrough = !Number.isFinite(minCutoff);

  let initialized = false;
  let lastT = 0;
  let xHat = 0;
  let yHat = 0;
  let dxHat = 0;
  let dyHat = 0;

  function smoothingFactor(cutoffHz: number, dtSec: number): number {
    const tau = 1 / (2 * Math.PI * cutoffHz);
    return 1 / (1 + tau / dtSec);
  }

  return {
    filter(point, tMs) {
      if (passthrough) return { x: point.x, y: point.y };
      if (!initialized) {
        initialized = true;
        lastT = tMs;
        xHat = point.x;
        yHat = point.y;
        dxHat = 0;
        dyHat = 0;
        return { x: point.x, y: point.y };
      }
      const dt = Math.max((tMs - lastT) / 1000, 1e-6);
      lastT = tMs;

      const dx = (point.x - xHat) / dt;
      const dy = (point.y - yHat) / dt;
      const ad = smoothingFactor(dCutoff, dt);
      dxHat = dxHat + ad * (dx - dxHat);
      dyHat = dyHat + ad * (dy - dyHat);

      const speed = Math.hypot(dxHat, dyHat);
      const cutoff = minCutoff + beta * speed;
      const a = smoothingFactor(cutoff, dt);
      xHat = xHat + a * (point.x - xHat);
      yHat = yHat + a * (point.y - yHat);
      return { x: xHat, y: yHat };
    },
    reset() {
      initialized = false;
      lastT = 0;
      xHat = 0;
      yHat = 0;
      dxHat = 0;
      dyHat = 0;
    },
  };
}

/**
 * Map the 0..100 stabilization slider to a 1€ filter config.
 *
 * 0 → passthrough (bit-identical to raw input).
 * >0 → `minCutoff` drops geometrically from 30 Hz to 0.4 Hz and `beta`
 * rises quadratically to 1.8e-3. Both values must DECREASE with amount:
 * a lower minCutoff filters more at rest, and a lower beta keeps the
 * cutoff from opening up during fast motion. Previous curves pushed both
 * UP at the top end and left tremor almost unfiltered. Issue #121.
 *
 * Reference points:
 *   amount=25  → minCutoff ≈ 10.2 Hz, β ≈ 1.1e-4
 *   amount=50  → minCutoff ≈ 3.5 Hz,  β = 4.5e-4
 *   amount=75  → minCutoff ≈ 1.2 Hz,  β ≈ 1.0e-3
 *   amount=100 → minCutoff = 0.4 Hz,  β = 1.8e-3
 */
export function stabilizationToConfig(amount: number): OneEuroConfig {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(amount) ? amount : 0));
  if (clamped <= 0) {
    return { minCutoff: Number.POSITIVE_INFINITY, beta: 0 };
  }
  const norm = clamped / 100;
  const minCutoffMax = 30;
  const minCutoffMin = 0.4;
  const betaMax = 0.0018;
  const minCutoff = minCutoffMax * Math.pow(minCutoffMin / minCutoffMax, norm);
  const beta = betaMax * norm * norm;
  return { minCutoff, beta, dCutoff: 1.0 };
}
