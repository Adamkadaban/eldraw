import { describe, expect, it } from 'vitest';
import { formatAlpha, formatRoman, presentList } from '$lib/slides/listMarkers';
import type { SlideListBlock } from '$lib/types';

function list(
  marker: SlideListBlock['marker'],
  levels: number[],
  markerByLevel?: SlideListBlock['markerByLevel'],
): SlideListBlock {
  return {
    id: 'list',
    kind: 'list',
    marker,
    markerByLevel,
    items: levels.map((level, index) => ({ text: String(index), level })),
  };
}

describe('slide list markers', () => {
  it('steps decimal lists down and restarts numbering within each parent', () => {
    const presented = presentList(list('decimal', [0, 1, 1, 2, 0, 1, 2, 2]));
    expect(presented.map((item) => item.marker)).toEqual([
      '1.',
      'a.',
      'b.',
      'i.',
      '2.',
      'a.',
      'i.',
      'ii.',
    ]);
  });

  it('steps bullet lists down to hollow bullets and dashes', () => {
    expect(presentList(list('bullet', [0, 1, 2, 3])).map((item) => item.marker)).toEqual([
      '•',
      '◦',
      '–',
      '◦',
    ]);
  });

  it('honors explicit per-level marker choices', () => {
    const presented = presentList(list('bullet', [0, 1, 1, 2, 2], ['decimal', 'alpha', 'roman']));
    expect(presented.map((item) => item.marker)).toEqual(['1.', 'a.', 'b.', 'i.', 'ii.']);
  });

  it('formats alphabetic and roman sequences beyond their first values', () => {
    expect(formatAlpha(1)).toBe('a');
    expect(formatAlpha(26)).toBe('z');
    expect(formatAlpha(27)).toBe('aa');
    expect(formatAlpha(52)).toBe('az');
    expect(formatAlpha(53)).toBe('ba');
    expect(formatRoman(4)).toBe('iv');
    expect(formatRoman(9)).toBe('ix');
    expect(formatRoman(27)).toBe('xxvii');

    const alpha = presentList(
      list(
        'alpha',
        Array.from({ length: 27 }, () => 0),
      ),
    );
    const roman = presentList(
      list(
        'roman',
        Array.from({ length: 9 }, () => 0),
      ),
    );
    expect(alpha[26].marker).toBe('aa.');
    expect(roman[8].marker).toBe('ix.');
  });

  it('uses marker-width-aware indentation', () => {
    const presented = presentList(list('decimal', [...Array.from({ length: 12 }, () => 0), 1]));
    expect(presented[0].markerWidthEm).toBeGreaterThan(1.2);
    expect(presented[12].indentEm).toBeGreaterThan(presented[0].indentEm);
  });
});
