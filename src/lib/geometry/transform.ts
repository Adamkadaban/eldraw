export interface Vec2 {
  x: number;
  y: number;
}

export function rotate(p: Vec2, angleDeg: number, origin: Vec2 = { x: 0, y: 0 }): Vec2 {
  const r = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  };
}

export function translate(p: Vec2, dx: number, dy: number): Vec2 {
  return { x: p.x + dx, y: p.y + dy };
}

export function distance(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Screen-space angle in degrees from `origin` to `p`, measured CCW from the
 * positive x-axis. Result is in [-180, 180].
 */
export function angleDeg(origin: Vec2, p: Vec2): number {
  return (Math.atan2(p.y - origin.y, p.x - origin.x) * 180) / Math.PI;
}

export function normalizeDeg(deg: number): number {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
}
