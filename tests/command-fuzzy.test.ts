import { describe, expect, it } from 'vitest';
import { score } from '../src/lib/command/fuzzy';

describe('fuzzy score', () => {
  it('returns 0 for empty query (match everything)', () => {
    expect(score('', 'Pen')).toBe(0);
    expect(score('', '')).toBe(0);
  });

  it('returns null when query chars are not a subsequence', () => {
    expect(score('xyz', 'Pen')).toBeNull();
    expect(score('ab', 'a')).toBeNull();
  });

  it('matches case-insensitively', () => {
    expect(score('PEN', 'pen')).not.toBeNull();
    expect(score('pen', 'PEN')).not.toBeNull();
  });

  it('ranks earlier matches higher than later matches', () => {
    const early = score('r', 'Ruler')!;
    const late = score('r', 'Eraser')!;
    expect(early).toBeGreaterThan(late);
  });

  it('ranks contiguous matches higher than scattered matches', () => {
    const contiguous = score('gr', 'Graph')!;
    const scattered = score('gr', 'Gather rune')!;
    expect(contiguous).toBeGreaterThan(scattered);
  });

  it('ranks prefix matches highest', () => {
    const prefix = score('un', 'Undo')!;
    const middle = score('un', 'Thunder')!;
    expect(prefix).toBeGreaterThan(middle);
  });

  it('returns a number for any valid subsequence match', () => {
    const s = score('tl', 'Toggle');
    expect(typeof s).toBe('number');
  });
});
