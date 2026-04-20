/**
 * Background color sampling for blank pages.
 *
 * Given a rendered PDF bitmap, we pick a handful of points away from the
 * center (corners + edge midpoints + center) and find the dominant color
 * bucket. If no bucket is clearly dominant (photographic / high-variance
 * pages), we return `null` and callers fall back to white.
 *
 * Pure logic is exported separately so it can be unit-tested without a DOM.
 */

const DOMINANT_FRACTION = 0.5;
const QUANTIZE_STEP = 16;

export interface SamplePoint {
  x: number;
  y: number;
}

export function pickSamplePoints(width: number, height: number): SamplePoint[] {
  if (width <= 0 || height <= 0) return [];
  const inset = Math.max(1, Math.floor(Math.min(width, height) * 0.02));
  const clampX = (n: number) => Math.max(0, Math.min(width - 1, n));
  const clampY = (n: number) => Math.max(0, Math.min(height - 1, n));
  const xs = [clampX(inset), clampX(Math.floor(width / 2)), clampX(width - 1 - inset)];
  const ys = [clampY(inset), clampY(Math.floor(height / 2)), clampY(height - 1 - inset)];
  const pts: SamplePoint[] = [];
  for (const y of ys) {
    for (const x of xs) pts.push({ x, y });
  }
  return pts;
}

function toHex(r: number, g: number, b: number): string {
  const component = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${component(r)}${component(g)}${component(b)}`;
}

/**
 * Sample the dominant color from a rendered bitmap's RGBA pixel buffer.
 * Returns a `#rrggbb` string, or `null` when the image is too noisy for a
 * single color to dominate (photographic content, heavy gradients).
 */
export function sampleBackgroundFromPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): string | null {
  if (width <= 0 || height <= 0) return null;
  if (pixels.length < width * height * 4) return null;

  const samples = pickSamplePoints(width, height);
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  let total = 0;

  for (const { x, y } of samples) {
    const i = (y * width + x) * 4;
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];
    if (a < 128) continue;
    const qr = Math.round(r / QUANTIZE_STEP);
    const qg = Math.round(g / QUANTIZE_STEP);
    const qb = Math.round(b / QUANTIZE_STEP);
    const key = (qr << 16) | (qg << 8) | qb;
    const existing = buckets.get(key);
    if (existing) {
      existing.count += 1;
      existing.r += r;
      existing.g += g;
      existing.b += b;
    } else {
      buckets.set(key, { count: 1, r, g, b });
    }
    total += 1;
  }

  if (total === 0) return null;

  let best: { count: number; r: number; g: number; b: number } | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.count > best.count) best = bucket;
  }
  if (!best) return null;
  if (best.count / total < DOMINANT_FRACTION) return null;

  return toHex(best.r / best.count, best.g / best.count, best.b / best.count);
}

/**
 * Sample the dominant color from a 2D canvas. Returns `null` when the
 * canvas is unreadable (e.g., tainted by a cross-origin image) or the
 * content is too varied to pick a clear background.
 */
export function sampleCanvasBackground(canvas: HTMLCanvasElement): string | null {
  if (canvas.width === 0 || canvas.height === 0) return null;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  try {
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return sampleBackgroundFromPixels(data.data, data.width, data.height);
  } catch {
    return null;
  }
}
