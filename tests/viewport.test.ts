import { describe, expect, it, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { viewport, MIN_SCALE, MAX_SCALE } from '../src/lib/store/viewport';

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
