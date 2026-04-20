import { describe, it, expect } from 'vitest';
import {
  pickSamplePoints,
  sampleBackgroundFromPixels,
  sampleCanvasBackground,
} from '$lib/canvas/bgSample';
import { isSafeHexColor } from '$lib/color';

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

describe('isSafeHexColor', () => {
  it('accepts strict 6-digit hex', () => {
    expect(isSafeHexColor('#ffffff')).toBe(true);
    expect(isSafeHexColor('#000000')).toBe(true);
    expect(isSafeHexColor('#AaBbCc')).toBe(true);
  });

  it('rejects short hex, non-hex, and injection payloads', () => {
    expect(isSafeHexColor('#fff')).toBe(false);
    expect(isSafeHexColor('red')).toBe(false);
    expect(isSafeHexColor('rgb(0,0,0)')).toBe(false);
    expect(isSafeHexColor('#ggggggg')).toBe(false);
    expect(isSafeHexColor('#ffffff ')).toBe(false);
    expect(isSafeHexColor('red; background-image: url(x)')).toBe(false);
    expect(isSafeHexColor('#ffffff; background-image: url(x)')).toBe(false);
    expect(isSafeHexColor(undefined)).toBe(false);
    expect(isSafeHexColor(null)).toBe(false);
    expect(isSafeHexColor(123)).toBe(false);
  });
});

describe('sampleCanvasBackground', () => {
  function fakeCanvas(width: number, height: number, rgba: [number, number, number, number]) {
    return {
      width,
      height,
      getContext: () => ({
        getImageData: (_x: number, _y: number, w: number, h: number) => ({
          data: new Uint8ClampedArray([...rgba]),
          width: w,
          height: h,
        }),
      }),
    } as unknown as HTMLCanvasElement;
  }

  it('samples at most 9 pixels (one per sample point)', () => {
    let calls = 0;
    const canvas = {
      width: 1000,
      height: 1000,
      getContext: () => ({
        getImageData: (_x: number, _y: number, w: number, h: number) => {
          calls += 1;
          expect(w).toBe(1);
          expect(h).toBe(1);
          return { data: new Uint8ClampedArray([240, 240, 240, 255]), width: 1, height: 1 };
        },
      }),
    } as unknown as HTMLCanvasElement;
    const color = sampleCanvasBackground(canvas);
    expect(calls).toBe(9);
    expect(color).toBe('#f0f0f0');
  });

  it('returns a valid #rrggbb string', () => {
    const canvas = fakeCanvas(50, 50, [255, 255, 255, 255]);
    const color = sampleCanvasBackground(canvas);
    expect(color).toBe('#ffffff');
    expect(isSafeHexColor(color!)).toBe(true);
  });

  it('returns null for zero-size canvases', () => {
    expect(sampleCanvasBackground(fakeCanvas(0, 100, [0, 0, 0, 255]))).toBeNull();
  });
});
