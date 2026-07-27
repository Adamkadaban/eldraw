import { describe, expect, it } from 'vitest';
import { autoSegment, detectMathSegments, looksLikeMath } from '$lib/text/autodetect';

function mathValues(source: string): string[] {
  return detectMathSegments(source)
    .filter((segment) => segment.kind === 'math')
    .map((segment) => segment.value);
}

describe('detectMathSegments', () => {
  it.each([
    ['y = 3x - 1', 'y = 3x - 1'],
    ['f(x) = 3x + 5', 'f(x) = 3x + 5'],
    ['x^2 + y^2 = r^2', 'x^2 + y^2 = r^2'],
    ['-3z = 15', '-3z = 15'],
    ['x + 7 = 18', 'x + 7 = 18'],
    ['2x - 5y = 10', '2x - 5y = 10'],
    ['x <= 11', 'x <= 11'],
    ['\\frac{1}{2}', '\\frac{1}{2}'],
    ['y = -1/2 x + 4', 'y = -1/2 x + 4'],
    ['a_{ij} = 2', 'a_{ij} = 2'],
  ])('detects %s', (source, expected) => {
    expect(mathValues(source)).toEqual([expected]);
    expect(looksLikeMath(source)).toBe(true);
  });

  it('extracts math from surrounding prose', () => {
    expect(detectMathSegments('The slope of y = 3x - 1 is 3.')).toEqual([
      { kind: 'text', value: 'The slope of ' },
      { kind: 'math', value: 'y = 3x - 1', display: false },
      { kind: 'text', value: ' is 3.' },
    ]);
  });

  it('splits a valid expression from prose that follows it', () => {
    expect(detectMathSegments('The line y = mx + b has slope m.')).toEqual([
      { kind: 'text', value: 'The line ' },
      { kind: 'math', value: 'y = mx + b', display: false },
      { kind: 'text', value: ' has slope m.' },
    ]);
  });

  it('does not promote either side of a prose-word boundary without complete operands', () => {
    const source = 'the answer = whatever you want';
    expect(detectMathSegments(source)).toEqual([{ kind: 'text', value: source }]);
  });

  it.each([
    'Domain & Range',
    'The # of days in a month',
    'Check your answer',
    'well - known',
    'Apply to both sides',
    'Simplify to find the solution',
    'It costs $5 today',
    'This is a pre-algebra lesson',
    '50% off',
    'ID = AB',
  ])('leaves prose unchanged: %s', (source) => {
    expect(detectMathSegments(source)).toEqual([{ kind: 'text', value: source }]);
    expect(looksLikeMath(source)).toBe(false);
  });

  it('keeps trailing punctuation outside detected math', () => {
    expect(detectMathSegments('Solve x = 4, then check.')).toEqual([
      { kind: 'text', value: 'Solve ' },
      { kind: 'math', value: 'x = 4', display: false },
      { kind: 'text', value: ', then check.' },
    ]);
  });

  it('trims a dangling operand after a sentence comma', () => {
    expect(detectMathSegments('Since x^2 = 16, x is 4 or -4.')).toEqual([
      { kind: 'text', value: 'Since ' },
      { kind: 'math', value: 'x^2 = 16', display: false },
      { kind: 'text', value: ', x is 4 or -4.' },
    ]);
  });

  it('keeps commas that are nested inside math brackets', () => {
    expect(mathValues('Use f(x, y) = 2 and S = {1, 2}.')).toEqual(['f(x, y) = 2', 'S = {1, 2}']);
  });

  it('rejects incomplete bracketed expressions', () => {
    expect(detectMathSegments('Use \\frac{1 here')).toEqual([
      { kind: 'text', value: 'Use \\frac{1 here' },
    ]);
  });
});

describe('autoSegment', () => {
  it('does not auto-detect inside explicit delimiters', () => {
    expect(autoSegment('The line $y = mx + b$ has slope m = 3.')).toEqual([
      { kind: 'text', value: 'The line ' },
      { kind: 'math', value: 'y = mx + b', display: false },
      { kind: 'text', value: ' has slope ' },
      { kind: 'math', value: 'm = 3', display: false },
      { kind: 'text', value: '.' },
    ]);
  });

  it('preserves explicit display mode', () => {
    expect(autoSegment('Use \\[x = 2\\] now')).toContainEqual({
      kind: 'math',
      value: 'x = 2',
      display: true,
    });
  });
});
