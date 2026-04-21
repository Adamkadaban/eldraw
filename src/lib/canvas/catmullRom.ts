import type { Point } from '$lib/types';

/**
 * Centripetal Catmull-Rom interpolation over a pressure-aware point buffer.
 *
 * Input samples are passed through unchanged at their original indices; extra
 * samples are inserted only in gaps where the chord length exceeds
 * `maxChordPt`. This keeps already-dense input cheap (no-op) and only pays
 * for interpolation when hardware sample density drops during fast strokes
 * — which is exactly when polygonal kinks appear.
 *
 * Units: all coordinates — `points` and `maxChordPt` — are in the same
 * coordinate space as the input `Point` values (PDF points in this app).
 * Callers that have a pixel-space threshold must convert px → pt (divide by
 * `ptToPx`) before calling.
 *
 * Centripetal (alpha = 0.5) is used because it avoids the self-intersections
 * and cusps that uniform/chordal Catmull-Rom produce around sharp corners.
 * Reference: Yuksel, Schaefer, Keyser, "Parameterization and Applications of
 * Catmull-Rom Curves" (2011).
 */
export function catmullRomSmooth(points: Point[], maxChordPt = 6): Point[] {
  if (points.length < 2) return points.slice();
  if (maxChordPt <= 0) return points.slice();

  const out: Point[] = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? points[i + 1];

    const chord = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (chord <= maxChordPt) {
      out.push(p2);
      continue;
    }

    const steps = Math.min(16, Math.ceil(chord / maxChordPt));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      out.push(centripetal(p0, p1, p2, p3, t));
    }
    out.push(p2);
  }
  return out;
}

function centripetal(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const t0 = 0;
  const t1 = t0 + knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);

  const u = t1 + (t2 - t1) * t;

  const a1 = lerpXY(p0, p1, safeDiv(t1 - u, t1 - t0), safeDiv(u - t0, t1 - t0));
  const a2 = lerpXY(p1, p2, safeDiv(t2 - u, t2 - t1), safeDiv(u - t1, t2 - t1));
  const a3 = lerpXY(p2, p3, safeDiv(t3 - u, t3 - t2), safeDiv(u - t2, t3 - t2));

  const b1 = {
    x: a1.x * safeDiv(t2 - u, t2 - t0) + a2.x * safeDiv(u - t0, t2 - t0),
    y: a1.y * safeDiv(t2 - u, t2 - t0) + a2.y * safeDiv(u - t0, t2 - t0),
  };
  const b2 = {
    x: a2.x * safeDiv(t3 - u, t3 - t1) + a3.x * safeDiv(u - t1, t3 - t1),
    y: a2.y * safeDiv(t3 - u, t3 - t1) + a3.y * safeDiv(u - t1, t3 - t1),
  };
  const x = b1.x * safeDiv(t2 - u, t2 - t1) + b2.x * safeDiv(u - t1, t2 - t1);
  const y = b1.y * safeDiv(t2 - u, t2 - t1) + b2.y * safeDiv(u - t1, t2 - t1);

  const pressure = p1.pressure + (p2.pressure - p1.pressure) * t;
  const time = p1.t + (p2.t - p1.t) * t;
  return { x, y, pressure, t: time };
}

function knot(a: Point, b: Point): number {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  return Math.sqrt(d) || 1e-6;
}

function lerpXY(a: Point, b: Point, wa: number, wb: number): { x: number; y: number } {
  return { x: a.x * wa + b.x * wb, y: a.y * wa + b.y * wb };
}

function safeDiv(n: number, d: number): number {
  return d === 0 ? 0 : n / d;
}
