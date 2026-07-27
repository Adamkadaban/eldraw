import type { SlideListBlock, SlideListMarker } from '$lib/types';

type ResolvedListMarker = SlideListMarker | 'hollow' | 'dash';

export interface PresentedListItem {
  text: string;
  level: number;
  marker: string;
  markerWidthEm: number;
  indentEm: number;
}

const NUMBERED_SEQUENCE: readonly ResolvedListMarker[] = ['decimal', 'alpha', 'roman', 'alpha'];
const BULLET_SEQUENCE: readonly ResolvedListMarker[] = ['bullet', 'hollow', 'dash', 'hollow'];

function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 0;
  return Math.min(3, Math.max(0, Math.floor(level)));
}

export function formatAlpha(value: number): string {
  if (!Number.isInteger(value) || value < 1) return '';
  let remaining = value;
  let result = '';
  while (remaining > 0) {
    remaining -= 1;
    result = String.fromCharCode(97 + (remaining % 26)) + result;
    remaining = Math.floor(remaining / 26);
  }
  return result;
}

export function formatRoman(value: number): string {
  if (!Number.isInteger(value) || value < 1) return '';
  if (value > 3999) return String(value);
  const numerals: ReadonlyArray<readonly [number, string]> = [
    [1000, 'm'],
    [900, 'cm'],
    [500, 'd'],
    [400, 'cd'],
    [100, 'c'],
    [90, 'xc'],
    [50, 'l'],
    [40, 'xl'],
    [10, 'x'],
    [9, 'ix'],
    [5, 'v'],
    [4, 'iv'],
    [1, 'i'],
  ];
  let remaining = value;
  let result = '';
  for (const [amount, numeral] of numerals) {
    while (remaining >= amount) {
      result += numeral;
      remaining -= amount;
    }
  }
  return result;
}

function automaticMarker(marker: SlideListMarker, level: number): ResolvedListMarker {
  if (marker === 'bullet') return BULLET_SEQUENCE[level];
  if (marker === 'decimal') return NUMBERED_SEQUENCE[level];
  if (marker === 'alpha') return NUMBERED_SEQUENCE[(level + 1) % NUMBERED_SEQUENCE.length];
  if (marker === 'roman') return NUMBERED_SEQUENCE[(level + 2) % NUMBERED_SEQUENCE.length];
  return 'none';
}

function markerAtLevel(block: SlideListBlock, level: number): ResolvedListMarker {
  return block.markerByLevel?.[level] ?? automaticMarker(block.marker, level);
}

function markerText(marker: ResolvedListMarker, count: number): string {
  switch (marker) {
    case 'bullet':
      return '•';
    case 'hollow':
      return '◦';
    case 'dash':
      return '–';
    case 'decimal':
      return `${count}.`;
    case 'alpha':
      return `${formatAlpha(count)}.`;
    case 'roman':
      return `${formatRoman(count)}.`;
    case 'none':
      return '';
  }
}

function markerWidth(marker: string): number {
  return marker.length === 0 ? 0 : Math.max(1.2, marker.length * 0.62 + 0.45);
}

/** Resolve nested marker styles and sibling-local numbering for a flat list. */
export function presentList(block: SlideListBlock): PresentedListItem[] {
  const counters = [0, 0, 0, 0];
  const provisional = block.items.map((item) => {
    const level = clampLevel(item.level);
    counters[level] += 1;
    for (let deeper = level + 1; deeper < counters.length; deeper += 1) counters[deeper] = 0;
    const marker = markerText(markerAtLevel(block, level), counters[level]);
    return { text: item.text, level, marker };
  });
  const widths = [0, 0, 0, 0];
  for (const item of provisional) {
    widths[item.level] = Math.max(widths[item.level], markerWidth(item.marker));
  }
  return provisional.map((item) => ({
    ...item,
    markerWidthEm: widths[item.level],
    indentEm: widths.slice(0, item.level).reduce((sum, width) => sum + width + 0.65, 0),
  }));
}
