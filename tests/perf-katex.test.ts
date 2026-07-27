import { describe, it, expect } from 'vitest';
import { renderMixed } from '$lib/text/render';
import {
  renderInlineMath,
  clearInlineMathCache,
  inlineMathCacheSize,
} from '$lib/slides/render/inlineMath';

const LATEX_SOURCES = [
  'The quadratic formula is $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$',
  "When $f(x) = x^2$, we have $f'(x) = 2x$",
  "Euler's identity: $e^{i\\pi} + 1 = 0$",
  'The integral $\\int_0^1 x^2 dx = \\frac{1}{3}$',
  '$\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}$',
  'Consider $\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1$',
  'Matrix: $\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$',
  'Binomial: $\\binom{n}{k} = \\frac{n!}{k!(n-k)!}$',
];

describe('KaTeX perf baseline', () => {
  it('measures renderMixed for slide text with math', () => {
    const t0 = performance.now();
    const iterations = 100;
    for (let i = 0; i < iterations; i++) {
      for (const src of LATEX_SOURCES) {
        renderMixed(src, 'auto');
      }
    }
    const elapsed = performance.now() - t0;
    const perCall = elapsed / (iterations * LATEX_SOURCES.length);
    console.log(
      `[BENCH] renderMixed auto: ${iterations}×${LATEX_SOURCES.length} calls = ${elapsed.toFixed(1)}ms (${perCall.toFixed(2)}ms/call)`,
    );
    expect(elapsed).toBeLessThan(60000);
  });

  it('measures renderInlineMath repeated calls (same source) - now cached', () => {
    clearInlineMathCache();
    const source = LATEX_SOURCES[0];

    // Cold call
    const t0 = performance.now();
    renderInlineMath(source);
    const cold = performance.now() - t0;

    // Warm calls (should be cache hits)
    const iterations = 200;
    const t1 = performance.now();
    for (let i = 0; i < iterations; i++) {
      renderInlineMath(source);
    }
    const warm = performance.now() - t1;
    const perCall = warm / iterations;

    console.log(`[BENCH] renderInlineMath cold:  ${cold.toFixed(2)}ms`);
    console.log(
      `[BENCH] renderInlineMath warm ×${iterations}: ${warm.toFixed(2)}ms (${perCall.toFixed(4)}ms/call)`,
    );
    console.log(`[BENCH] Cache speedup:          ${(cold / perCall).toFixed(0)}x`);
    console.log(`[BENCH] Cache size:             ${inlineMathCacheSize()}`);
    expect(perCall).toBeLessThan(cold);
  });
});
