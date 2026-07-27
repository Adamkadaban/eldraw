import { describe, it, expect } from 'vitest';
import {
  freeVariables,
  parseExpression,
  parseExpressionWithParams,
  parseExpressionXY,
  parseExpressionXYWithParams,
} from '$lib/graph/parser';
import type { GraphParameter } from '$lib/types';

function compile(src: string): (x: number) => number {
  const r = parseExpression(src);
  if (!r.ok) throw new Error(`parse failed: ${r.error}`);
  return r.fn;
}

function error(src: string): string {
  const r = parseExpression(src);
  if (r.ok) throw new Error('expected parse error');
  return r.error;
}

describe('parseExpression', () => {
  it('parses integer and decimal literals', () => {
    expect(compile('42')(0)).toBe(42);
    expect(compile('3.14')(0)).toBeCloseTo(3.14);
    expect(compile('.5')(0)).toBe(0.5);
  });

  it('evaluates the variable x', () => {
    expect(compile('x')(7)).toBe(7);
    expect(compile('x + 1')(10)).toBe(11);
  });

  it('respects operator precedence', () => {
    expect(compile('1 + 2 * 3')(0)).toBe(7);
    expect(compile('(1 + 2) * 3')(0)).toBe(9);
    expect(compile('2 + 3 * 4 - 1')(0)).toBe(13);
    expect(compile('10 / 2 / 5')(0)).toBe(1);
  });

  it('treats ^ as right-associative', () => {
    expect(compile('2^3^2')(0)).toBe(512);
    expect(compile('(2^3)^2')(0)).toBe(64);
  });

  it('binds ^ tighter than unary minus for pow on negatives', () => {
    expect(compile('-2^2')(0)).toBe(-4);
    expect(compile('(-2)^2')(0)).toBe(4);
  });

  it('supports unary signs in exponents without changing power precedence', () => {
    expect(compile('x^-2')(3)).toBeCloseTo(1 / 9);
    expect(compile('2^-x')(3)).toBeCloseTo(1 / 8);
    expect(compile('e^-x')(2)).toBeCloseTo(Math.exp(-2));
    expect(compile('x^--2')(3)).toBe(9);
    expect(compile('-2^2')(0)).toBe(-4);
    expect(compile('2^3^2')(0)).toBe(512);
  });

  it('supports unary plus and minus', () => {
    expect(compile('-x')(5)).toBe(-5);
    expect(compile('--x')(5)).toBe(5);
    expect(compile('+x')(5)).toBe(5);
    expect(compile('3 - -2')(0)).toBe(5);
  });

  it('evaluates trig functions', () => {
    expect(compile('sin(0)')(0)).toBeCloseTo(0);
    expect(compile('cos(0)')(0)).toBeCloseTo(1);
    expect(compile('sin(pi/2)')(0)).toBeCloseTo(1);
    expect(compile('tan(0)')(0)).toBeCloseTo(0);
  });

  it('evaluates inverse trig, log, ln, exp, sqrt, abs', () => {
    expect(compile('asin(1)')(0)).toBeCloseTo(Math.PI / 2);
    expect(compile('acos(1)')(0)).toBeCloseTo(0);
    expect(compile('atan(1)')(0)).toBeCloseTo(Math.PI / 4);
    expect(compile('log(1000)')(0)).toBeCloseTo(3);
    expect(compile('ln(e)')(0)).toBeCloseTo(1);
    expect(compile('exp(0)')(0)).toBe(1);
    expect(compile('exp(1)')(0)).toBeCloseTo(Math.E);
    expect(compile('sqrt(9)')(0)).toBe(3);
    expect(compile('abs(-4.5)')(0)).toBe(4.5);
  });

  it('evaluates constants pi and e', () => {
    expect(compile('pi')(0)).toBeCloseTo(Math.PI);
    expect(compile('e')(0)).toBeCloseTo(Math.E);
    expect(compile('2*pi')(0)).toBeCloseTo(2 * Math.PI);
  });

  it('evaluates nested and composed expressions', () => {
    expect(compile('x^2 + 2*x - 1')(3)).toBe(14);
    expect(compile('1/(1+x^2)')(0)).toBe(1);
    expect(compile('1/(1+x^2)')(1)).toBe(0.5);
    expect(compile('exp(-x^2)')(0)).toBe(1);
    expect(compile('sin(cos(x))')(0)).toBeCloseTo(Math.sin(1));
  });

  it('tolerates whitespace', () => {
    expect(compile('  1  +  2  ')(0)).toBe(3);
    expect(compile('sin ( 0 )')(0)).toBe(0);
  });

  it('returns errors for malformed input', () => {
    expect(error('')).toMatch(/empty/);
    expect(error('1 +')).toMatch(/unexpected end/);
    expect(error('(1+2')).toMatch(/unexpected end|expected '\)'/);
    expect(error('1+2)')).toMatch(/unexpected token/);
    expect(error('1..2')).toMatch(/invalid number/);
    expect(error('@')).toMatch(/unexpected character/);
    expect(error('foo(1)')).toMatch(/unknown function/);
    expect(error('y')).toMatch(/unknown identifier/);
  });

  it('handles division producing Infinity without throwing', () => {
    const f = compile('1/x');
    expect(f(0)).toBe(Infinity);
    expect(f(2)).toBe(0.5);
  });
});

describe('freeVariables', () => {
  it('returns free variables in first-appearance order without duplicates', () => {
    expect(freeVariables('y = a*sin(b*x) + c + a', ['x', 'y'])).toEqual(['a', 'b', 'c']);
  });

  it('excludes function names, constants, and reserved variables', () => {
    expect(freeVariables('sin(x)', ['x'])).toEqual([]);
    expect(freeVariables('pi*x + e^x', ['x'])).toEqual([]);
    expect(freeVariables('x^2 + y^2 = r^2', ['x', 'y'])).toEqual(['r']);
  });

  it('returns an empty list for input that cannot be tokenized', () => {
    expect(() => freeVariables('a + @', ['x'])).not.toThrow();
    expect(freeVariables('a + @', ['x'])).toEqual([]);
  });
});

describe('parameterized expressions', () => {
  const parameter = (name: string, value: number): GraphParameter => ({
    name,
    value,
    min: -5,
    max: 5,
    step: 0.1,
  });

  it('evaluates and updates explicit parameters through a shared buffer', () => {
    const result = parseExpressionWithParams('a*sin(x) + b', [
      parameter('a', 2),
      parameter('b', 1),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.compiled.fn(Math.PI / 2)).toBeCloseTo(3);
    result.compiled.setParameter('a', 4);
    expect(result.compiled.fn(Math.PI / 2)).toBeCloseTo(5);
    result.compiled.setParameter('unknown', 100);
    expect(result.compiled.fn(Math.PI / 2)).toBeCloseTo(5);
    expect(result.compiled.parameterNames).toEqual(['a', 'b']);
  });

  it('evaluates and updates implicit parameters', () => {
    const result = parseExpressionXYWithParams('x^2 + y^2 = r^2', [parameter('r', 2)]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.compiled.fn(0, 2)).toBe(0);
    result.compiled.setParameter('r', 3);
    expect(result.compiled.fn(0, 2)).toBe(-5);
  });

  it('still reports undeclared identifiers cleanly', () => {
    const result = parseExpressionWithParams('a*x + b', [parameter('a', 2)]);
    expect(result).toEqual({ ok: false, error: "unknown identifier 'b'" });
  });

  it('preserves the legacy parser semantics', () => {
    const negativePower = parseExpression('-2^2');
    const associatedPower = parseExpression('2^3^2');
    const implicit = parseExpressionXY('x^2 + y^2 = 4');
    expect(negativePower.ok && negativePower.fn(0)).toBe(-4);
    expect(associatedPower.ok && associatedPower.fn(0)).toBe(512);
    expect(implicit.ok && implicit.fn(0, 2)).toBe(0);
  });
});
