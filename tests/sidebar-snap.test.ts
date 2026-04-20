import { describe, expect, it } from 'vitest';
import { applySnap, clampToViewport, SNAP_MARGIN, SNAP_THRESHOLD } from '../src/lib/sidebar/snap';

const size = { width: 220, height: 400 };
const viewport = { width: 1200, height: 800 };

describe('clampToViewport', () => {
  it('keeps in-bounds point unchanged', () => {
    expect(clampToViewport({ x: 100, y: 100 }, size, viewport)).toEqual({ x: 100, y: 100 });
  });

  it('clamps negative coordinates to 0', () => {
    expect(clampToViewport({ x: -50, y: -10 }, size, viewport)).toEqual({ x: 0, y: 0 });
  });

  it('clamps past right/bottom edges to maxima', () => {
    expect(clampToViewport({ x: 5000, y: 5000 }, size, viewport)).toEqual({
      x: viewport.width - size.width,
      y: viewport.height - size.height,
    });
  });

  it('handles sidebar larger than viewport by clamping to 0', () => {
    const tiny = { width: 100, height: 100 };
    const big = { width: 300, height: 300 };
    expect(clampToViewport({ x: 50, y: 50 }, big, tiny)).toEqual({ x: 0, y: 0 });
  });
});

describe('applySnap', () => {
  it('snaps to top-left corner when near origin', () => {
    const snapped = applySnap({ x: 10, y: 10 }, size, viewport);
    expect(snapped).toEqual({ x: SNAP_MARGIN, y: SNAP_MARGIN });
  });

  it('snaps to top-right corner', () => {
    const nearRight = { x: viewport.width - size.width - 5, y: 8 };
    const snapped = applySnap(nearRight, size, viewport);
    expect(snapped).toEqual({
      x: viewport.width - size.width - SNAP_MARGIN,
      y: SNAP_MARGIN,
    });
  });

  it('snaps to bottom-left corner', () => {
    const nearBL = { x: 3, y: viewport.height - size.height - 2 };
    const snapped = applySnap(nearBL, size, viewport);
    expect(snapped).toEqual({
      x: SNAP_MARGIN,
      y: viewport.height - size.height - SNAP_MARGIN,
    });
  });

  it('snaps to bottom-right corner', () => {
    const nearBR = {
      x: viewport.width - size.width - 6,
      y: viewport.height - size.height - 4,
    };
    const snapped = applySnap(nearBR, size, viewport);
    expect(snapped).toEqual({
      x: viewport.width - size.width - SNAP_MARGIN,
      y: viewport.height - size.height - SNAP_MARGIN,
    });
  });

  it('snaps only on the axis within threshold', () => {
    const nearLeft = { x: 5, y: 300 };
    const snapped = applySnap(nearLeft, size, viewport);
    expect(snapped).toEqual({ x: SNAP_MARGIN, y: 300 });
  });

  it('does not snap when far from all edges', () => {
    const mid = { x: 500, y: 300 };
    expect(applySnap(mid, size, viewport)).toEqual(mid);
  });

  it('respects custom threshold', () => {
    const p = { x: 40, y: 300 };
    expect(applySnap(p, size, viewport, 50)).toEqual({ x: SNAP_MARGIN, y: 300 });
    expect(applySnap(p, size, viewport, 20)).toEqual({ x: 40, y: 300 });
  });

  it('clamps result so it is always in-bounds', () => {
    const outside = { x: -100, y: -100 };
    const snapped = applySnap(outside, size, viewport);
    expect(snapped.x).toBeGreaterThanOrEqual(0);
    expect(snapped.y).toBeGreaterThanOrEqual(0);
  });

  it('default threshold is 24', () => {
    expect(SNAP_THRESHOLD).toBe(24);
  });
});
