import { describe, expect, it } from 'vitest';
import {
  applySnap,
  clampToViewport,
  detectSnapEdge,
  EDGE_SNAP_THRESHOLD,
  SNAP_MARGIN,
  SNAP_THRESHOLD,
} from '../src/lib/sidebar/snap';

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

describe('detectSnapEdge', () => {
  it('returns null when drag point is far from every edge', () => {
    expect(detectSnapEdge({ x: 500, y: 300 }, size, viewport)).toBeNull();
  });

  it('detects left edge when x is within threshold', () => {
    expect(detectSnapEdge({ x: 10, y: 300 }, size, viewport)).toBe('left');
  });

  it('detects right edge', () => {
    const p = { x: viewport.width - size.width - 5, y: 300 };
    expect(detectSnapEdge(p, size, viewport)).toBe('right');
  });

  it('detects top edge', () => {
    expect(detectSnapEdge({ x: 500, y: 5 }, size, viewport)).toBe('top');
  });

  it('detects bottom edge', () => {
    const p = { x: 500, y: viewport.height - size.height - 8 };
    expect(detectSnapEdge(p, size, viewport)).toBe('bottom');
  });

  it('picks the closest edge when multiple are in range (corner)', () => {
    // near top-left corner: top dist 5 < left dist 10 → prefers top
    expect(detectSnapEdge({ x: 10, y: 5 }, size, viewport)).toBe('top');
    // flipped: prefers left when left is closer
    expect(detectSnapEdge({ x: 3, y: 20 }, size, viewport)).toBe('left');
  });

  it('respects custom threshold', () => {
    const p = { x: 30, y: 300 };
    expect(detectSnapEdge(p, size, viewport, 40)).toBe('left');
    expect(detectSnapEdge(p, size, viewport, 20)).toBeNull();
  });

  it('default edge threshold matches exported constant', () => {
    expect(EDGE_SNAP_THRESHOLD).toBe(40);
  });

  it('prefers left edge when sidebar is larger than viewport at origin', () => {
    const bigSidebar = { width: 2000, height: 1500 };
    const smallViewport = { width: 1200, height: 800 };
    expect(detectSnapEdge({ x: 0, y: 0 }, bigSidebar, smallViewport)).toBe('left');
  });
});
