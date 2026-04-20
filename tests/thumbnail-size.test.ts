import { describe, expect, it } from 'vitest';
import { thumbnailSize } from '../src/lib/sidebar/thumbnailSize';

describe('thumbnailSize', () => {
  it('preserves portrait aspect ratio', () => {
    const s = thumbnailSize(612, 792, 140);
    expect(s.width).toBe(140);
    expect(s.height).toBe(Math.round(140 * (792 / 612)));
  });

  it('preserves landscape aspect ratio', () => {
    const s = thumbnailSize(800, 400, 100);
    expect(s.width).toBe(100);
    expect(s.height).toBe(50);
  });

  it('falls back to square for non-positive dimensions', () => {
    expect(thumbnailSize(0, 100, 80)).toEqual({ width: 80, height: 80 });
    expect(thumbnailSize(100, -1, 80)).toEqual({ width: 80, height: 80 });
  });

  it('falls back to square for non-finite inputs', () => {
    expect(thumbnailSize(Number.NaN, 100, 80)).toEqual({ width: 80, height: 80 });
    expect(thumbnailSize(100, Number.POSITIVE_INFINITY, 80)).toEqual({ width: 80, height: 80 });
  });

  it('guarantees height of at least 1', () => {
    const s = thumbnailSize(10000, 1, 50);
    expect(s.height).toBeGreaterThanOrEqual(1);
  });
});
