import { describe, expect, it } from 'vitest';
import { normalizeMathSource } from '$lib/text/normalize';
import { renderMixed } from '$lib/text/render';

/**
 * A LaTeX control sequence absorbs every letter that follows it, so a
 * shorthand replacement sitting directly against a variable used to produce an
 * undefined command such as `\ley`.
 */
describe('operator shorthand against an adjacent letter', () => {
  const cases: [string, string][] = [
    ['x<=y', '\\le'],
    ['x>=y', '\\ge'],
    ['x!=y', '\\ne'],
    ['x->y', '\\to'],
    ['a*b', '\\cdot'],
    ['x+-y', '\\pm'],
  ];

  it.each(cases)('%s emits a terminated command', (input, command) => {
    const normalized = normalizeMathSource(input);
    expect(normalized).toContain(`${command} `);
    expect(normalized).not.toMatch(new RegExp(`\\${command}[a-z]`));
  });

  it.each(cases)('%s renders without a KaTeX error', (input) => {
    expect(renderMixed(input, 'auto').errored).toBe(false);
  });

  it('does not add a separator when one is not needed', () => {
    expect(normalizeMathSource('x <= 5')).toContain('\\le');
    expect(normalizeMathSource('x <= 5')).not.toContain('\\le  ');
  });

  it('stays idempotent', () => {
    for (const [input] of cases) {
      const once = normalizeMathSource(input);
      expect(normalizeMathSource(once)).toBe(once);
    }
  });
});

describe('multi-character script wrapping', () => {
  it('wraps a multi-digit exponent', () => {
    expect(normalizeMathSource('x^10')).toBe('x^{10}');
  });

  it('wraps a multi-letter subscript', () => {
    expect(normalizeMathSource('a_ij')).toBe('a_{ij}');
  });

  it('leaves a digit followed by a variable alone so the meaning is preserved', () => {
    // TeX reads `x^2y` as x² times y. Wrapping it would silently mean x^(2y).
    expect(normalizeMathSource('x^2y')).toBe('x^2y');
    expect(normalizeMathSource('e^2x')).toBe('e^2x');
    expect(normalizeMathSource('a^2b + c')).toBe('a^2b + c');
  });

  it('leaves a single-character script alone', () => {
    expect(normalizeMathSource('x^2')).toBe('x^2');
    expect(normalizeMathSource('a_i')).toBe('a_i');
  });

  it('does not re-wrap an already braced script', () => {
    expect(normalizeMathSource('x^{10}')).toBe('x^{10}');
  });
});
