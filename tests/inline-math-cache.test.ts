import { describe, it, expect, beforeEach } from 'vitest';
import {
  renderInlineMath,
  clearInlineMathCache,
  inlineMathCacheSize,
} from '$lib/slides/render/inlineMath';

describe('renderInlineMath caching', () => {
  beforeEach(() => {
    clearInlineMathCache();
  });

  it('caches result for identical source strings', () => {
    const source = '$x^2 + y^2 = r^2$';
    const result1 = renderInlineMath(source);
    const result2 = renderInlineMath(source);
    expect(result1).toBe(result2);
    expect(inlineMathCacheSize()).toBe(1);
  });

  it('stores separate entries for different sources', () => {
    renderInlineMath('$a$');
    renderInlineMath('$b$');
    expect(inlineMathCacheSize()).toBe(2);
  });

  it('does not re-render on cache hit', () => {
    const source = 'Some text with $\\int_0^1 f(x) dx$ math';
    const t0 = performance.now();
    renderInlineMath(source);
    const cold = performance.now() - t0;

    const t1 = performance.now();
    for (let i = 0; i < 100; i++) renderInlineMath(source);
    const warmAvg = (performance.now() - t1) / 100;

    expect(warmAvg).toBeLessThan(cold);
  });

  it('evicts oldest entry when cache exceeds limit', () => {
    for (let i = 0; i < 513; i++) {
      renderInlineMath(`$x_{${i}}$`);
    }
    expect(inlineMathCacheSize()).toBe(512);
  });
});
