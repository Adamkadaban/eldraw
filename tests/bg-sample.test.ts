import { describe, it, expect } from 'vitest';
import { pickSamplePoints, sampleBackgroundFromPixels } from '$lib/canvas/bgSample';

function solidImage(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    pixels[i * 4] = r;
    pixels[i * 4 + 1] = g;
    pixels[i * 4 + 2] = b;
    pixels[i * 4 + 3] = 255;
  }
  return pixels;
}

describe('pickSamplePoints', () => {
  it('returns nine points inside the image bounds', () => {
    const pts = pickSamplePoints(100, 80);
    expect(pts).toHaveLength(9);
    for (const { x, y } of pts) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(100);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(80);
    }
  });

  it('returns an empty set for zero-size images', () => {
    expect(pickSamplePoints(0, 10)).toEqual([]);
    expect(pickSamplePoints(10, 0)).toEqual([]);
  });
});

describe('sampleBackgroundFromPixels', () => {
  it('returns exact color for a solid fill', () => {
    const pixels = solidImage(50, 50, 255, 255, 255);
    expect(sampleBackgroundFromPixels(pixels, 50, 50)).toBe('#ffffff');
  });

  it('detects off-white cream backgrounds', () => {
    const pixels = solidImage(50, 50, 250, 245, 230);
    expect(sampleBackgroundFromPixels(pixels, 50, 50)).toBe('#faf5e6');
  });

  it('detects dark-mode backgrounds', () => {
    const pixels = solidImage(64, 64, 16, 18, 20);
    expect(sampleBackgroundFromPixels(pixels, 64, 64)).toBe('#101214');
  });

  it('returns dominant color when minority pixels differ', () => {
    const pixels = solidImage(60, 60, 240, 240, 240);
    // Paint one corner black: only one of nine sample points lands there.
    const i = 0;
    pixels[i] = 0;
    pixels[i + 1] = 0;
    pixels[i + 2] = 0;
    const result = sampleBackgroundFromPixels(pixels, 60, 60);
    expect(result).toBe('#f0f0f0');
  });

  it('returns null when no single color dominates', () => {
    const pixels = new Uint8ClampedArray(60 * 60 * 4);
    for (let i = 0; i < 60 * 60; i += 1) {
      const c = ((i * 53) % 256) | 0;
      pixels[i * 4] = c;
      pixels[i * 4 + 1] = (c * 3) % 256;
      pixels[i * 4 + 2] = (c * 7) % 256;
      pixels[i * 4 + 3] = 255;
    }
    expect(sampleBackgroundFromPixels(pixels, 60, 60)).toBeNull();
  });

  it('returns null when the buffer is too small', () => {
    const pixels = new Uint8ClampedArray(4);
    expect(sampleBackgroundFromPixels(pixels, 10, 10)).toBeNull();
  });

  it('ignores fully transparent pixels', () => {
    const pixels = new Uint8ClampedArray(20 * 20 * 4);
    expect(sampleBackgroundFromPixels(pixels, 20, 20)).toBeNull();
  });
});
