import { describe, expect, it } from 'vitest';
import { parseExpressionXY } from '$lib/graph/parser';

function compile(src: string): (x: number, y: number) => number {
  const r = parseExpressionXY(src);
  if (!r.ok) throw new Error(`parse failed: ${r.error}`);
  return r.fn;
}

function error(src: string): string {
  const r = parseExpressionXY(src);
  if (r.ok) throw new Error('expected parse error');
  return r.error;
}

describe('parseExpressionXY', () => {
  it('evaluates expressions in x and y', () => {
    expect(compile('x + y')(2, 3)).toBe(5);
    expect(compile('x*y - 1')(4, 5)).toBe(19);
    expect(compile('x^2 + y^2')(3, 4)).toBe(25);
  });

  it('normalizes equations as lhs - rhs', () => {
    const f = compile('x^2 + y^2 = 4');
    expect(f(2, 0)).toBe(0);
    expect(f(0, 2)).toBe(0);
    expect(f(0, 0)).toBe(-4);
  });

  it('supports constants and functions in two variables', () => {
    expect(compile('sin(x) + cos(y)')(0, 0)).toBeCloseTo(1);
    expect(compile('pi*y')(0, 2)).toBeCloseTo(2 * Math.PI);
  });

  it('rejects equations with more than one =', () => {
    expect(error('x = y = 1')).toMatch(/unexpected/);
  });

  it('rejects unknown variables other than x, y', () => {
    expect(error('z')).toMatch(/unknown identifier/);
  });
});
