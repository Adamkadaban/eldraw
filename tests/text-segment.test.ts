import { describe, expect, it } from 'vitest';
import { hasExplicitMath, segmentLatex } from '$lib/text/segment';

describe('segmentLatex', () => {
  it('segments inline dollar math without consuming sentence punctuation', () => {
    expect(segmentLatex('The line $y = mx + b$ has slope $m$.')).toEqual([
      { kind: 'text', value: 'The line ' },
      { kind: 'math', value: 'y = mx + b', display: false },
      { kind: 'text', value: ' has slope ' },
      { kind: 'math', value: 'm', display: false },
      { kind: 'text', value: '.' },
    ]);
  });

  it('segments bracketed display math', () => {
    expect(segmentLatex('Before \\[x^2 + y^2 = r^2\\] after')).toEqual([
      { kind: 'text', value: 'Before ' },
      { kind: 'math', value: 'x^2 + y^2 = r^2', display: true },
      { kind: 'text', value: ' after' },
    ]);
  });

  it('keeps unmatched dollars literal and unescapes escaped dollars', () => {
    expect(segmentLatex('It costs $5 today and \\$6 tomorrow')).toEqual([
      { kind: 'text', value: 'It costs $5 today and $6 tomorrow' },
    ]);
  });

  it('reports only complete explicit math runs', () => {
    expect(hasExplicitMath('price $5')).toBe(false);
    expect(hasExplicitMath('value \\(x + 1\\)')).toBe(true);
  });
});
