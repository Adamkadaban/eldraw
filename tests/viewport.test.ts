import { describe, expect, it, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { viewport, MIN_SCALE, MAX_SCALE, computeFitScale } from '../src/lib/store/viewport';

describe('viewport', () => {
  beforeEach(() => viewport.reset());

  it('clamps scale to [MIN_SCALE, MAX_SCALE]', () => {
    viewport.setScale(100);
    expect(get(viewport).scale).toBe(MAX_SCALE);
    viewport.setScale(0.01);
    expect(get(viewport).scale).toBe(MIN_SCALE);
    viewport.setScale(1.0);
    expect(get(viewport).scale).toBe(1.0);
  });

  it('zoomIn and zoomOut stay within bounds', () => {
    viewport.setScale(MAX_SCALE);
    viewport.zoomIn();
    expect(get(viewport).scale).toBe(MAX_SCALE);
    viewport.setScale(MIN_SCALE);
    viewport.zoomOut();
    expect(get(viewport).scale).toBe(MIN_SCALE);
  });

  it('setScale rejects non-finite values by falling back', () => {
    viewport.setScale(Number.NaN);
    expect(get(viewport).scale).toBeGreaterThanOrEqual(MIN_SCALE);
    expect(get(viewport).scale).toBeLessThanOrEqual(MAX_SCALE);
  });

  it('nextPage clamps to total - 1', () => {
    viewport.setPage(0, 3);
    viewport.nextPage(3);
    viewport.nextPage(3);
    viewport.nextPage(3);
    viewport.nextPage(3);
    expect(get(viewport).currentPageIndex).toBe(2);
  });

  it('prevPage clamps to 0', () => {
    viewport.setPage(1, 3);
    viewport.prevPage();
    viewport.prevPage();
    viewport.prevPage();
    expect(get(viewport).currentPageIndex).toBe(0);
  });

  it('handles empty document (total = 0)', () => {
    viewport.setPage(5, 0);
    expect(get(viewport).currentPageIndex).toBe(0);
    viewport.nextPage(0);
    expect(get(viewport).currentPageIndex).toBe(0);
  });

  it('panBy accumulates offset', () => {
    viewport.panBy(10, 5);
    viewport.panBy(-3, 2);
    const s = get(viewport);
    expect(s.offsetX).toBe(7);
    expect(s.offsetY).toBe(7);
  });

  it('setPanMode toggles pan state', () => {
    viewport.setPanMode(true);
    expect(get(viewport).panMode).toBe(true);
    viewport.setPanMode(false);
    expect(get(viewport).panMode).toBe(false);
  });
});

describe('computeFitScale', () => {
  it('portrait page in landscape viewport is height-limited', () => {
    // Page 612x792pt (US Letter portrait), viewport 1600x900 minus padding.
    const scale = computeFitScale({ width: 612, height: 792 }, { width: 1600, height: 900 }, 0);
    expect(scale).toBeCloseTo(900 / 792, 6);
  });

  it('landscape page in portrait viewport is width-limited', () => {
    const scale = computeFitScale({ width: 792, height: 612 }, { width: 900, height: 1600 }, 0);
    expect(scale).toBeCloseTo(900 / 792, 6);
  });

  it('exact aspect match yields the matching ratio on both axes', () => {
    const scale = computeFitScale({ width: 200, height: 100 }, { width: 400, height: 200 }, 0);
    expect(scale).toBeCloseTo(2, 6);
  });

  it('respects padding by shrinking the available area', () => {
    const noPad = computeFitScale({ width: 100, height: 100 }, { width: 200, height: 200 }, 0);
    const withPad = computeFitScale({ width: 100, height: 100 }, { width: 200, height: 200 }, 24);
    expect(withPad).toBeLessThan(noPad);
  });

  it('clamps to MAX_SCALE for tiny pages in huge viewports', () => {
    const scale = computeFitScale({ width: 1, height: 1 }, { width: 10000, height: 10000 }, 0);
    expect(scale).toBe(MAX_SCALE);
  });

  it('clamps to MIN_SCALE for huge pages in tiny viewports', () => {
    const scale = computeFitScale({ width: 10000, height: 10000 }, { width: 100, height: 100 }, 0);
    expect(scale).toBe(MIN_SCALE);
  });

  it('handles invalid page dims gracefully', () => {
    expect(computeFitScale({ width: 0, height: 100 }, { width: 200, height: 200 })).toBe(1);
  });
});

describe('viewport.fitPageToViewport', () => {
  beforeEach(() => viewport.reset());

  it('sets scale to fit and zeros the offset', () => {
    viewport.setOffset(50, 70);
    viewport.fitPageToViewport({ width: 200, height: 100 }, { width: 400, height: 200 });
    const s = get(viewport);
    expect(s.offsetX).toBe(0);
    expect(s.offsetY).toBe(0);
    expect(s.scale).toBeCloseTo(
      computeFitScale({ width: 200, height: 100 }, { width: 400, height: 200 }),
      6,
    );
  });
});
