import { describe, it, expect } from 'vitest';
import { parseExpression } from '$lib/graph/parser';

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
