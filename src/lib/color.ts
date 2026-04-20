/**
 * Strict hex color validation. Accepts only `#rrggbb` with exactly six
 * hexadecimal digits. Used as a trust boundary for values that are later
 * interpolated into CSS (sidecars are untrusted input).
 */
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function isSafeHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR_RE.test(value);
}

export function sanitizeHexColor(value: unknown): string | undefined {
  return isSafeHexColor(value) ? value : undefined;
}
