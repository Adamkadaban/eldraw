import { describe, expect, it } from 'vitest';
import { normalizeMathSource } from '$lib/text/normalize';

describe('normalizeMathSource', () => {
  it('normalizes common teacher shorthand', () => {
    expect(normalizeMathSource('x <= 4, y >= 2, x != y, a +- b')).toBe(
      'x \\le 4, y \\ge 2, x \\ne y, a \\pm b',
    );
    expect(normalizeMathSource('x * y -> oo ...')).toBe('x \\cdot y \\to \\infty \\dots');
  });

  it('normalizes functions, roots, and Greek tokens', () => {
    expect(normalizeMathSource('sin(x) + cos theta + sqrt(x^2 + pi)')).toBe(
      '\\sin(x) + \\cos \\theta + \\sqrt{x^2 + \\pi}',
    );
    expect(normalizeMathSource('sqrt x')).toBe('\\sqrt x');
    expect(normalizeMathSource('abs(x)')).toBe('\\operatorname{abs}(x)');
  });

  it('handles balanced nested square roots', () => {
    expect(normalizeMathSource('sqrt(1 + sqrt(x))')).toBe('\\sqrt{1 + \\sqrt{x}}');
  });

  it('wraps multi-character superscripts and subscripts', () => {
    expect(normalizeMathSource('x^10 + a_ij + y^2')).toBe('x^{10} + a_{ij} + y^2');
  });

  it('escapes special characters without double escaping', () => {
    expect(normalizeMathSource('50% + #1 & x \\% \\# \\&')).toBe('50\\% + \\#1 \\& x \\% \\# \\&');
  });

  it('only replaces whole word constants and Greek names', () => {
    expect(normalizeMathSource('pilot + spin + infty + pi')).toBe('pilot + spin + \\infty + \\pi');
  });

  it.each([
    'x <= 10',
    'sin(x) + sqrt(pi)',
    'x^10 + a_ij',
    '50% & #1',
    '\\sin(x) + \\sqrt{x} + \\pi',
  ])('is idempotent for %s', (source) => {
    const once = normalizeMathSource(source);
    expect(normalizeMathSource(once)).toBe(once);
  });
});
