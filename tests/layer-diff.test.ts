import { describe, expect, it } from 'vitest';
import { appendedItems, isAppendOnly } from '$lib/canvas/layerDiff';

const a = { id: 'a' };
const b = { id: 'b' };
const c = { id: 'c' };

describe('isAppendOnly', () => {
  it('accepts a pure append', () => {
    expect(isAppendOnly([a, b], [a, b, c])).toBe(true);
  });

  it('accepts an unchanged list', () => {
    expect(isAppendOnly([a, b], [a, b])).toBe(true);
  });

  it('accepts the first item drawn onto an empty layer', () => {
    expect(isAppendOnly([], [a])).toBe(true);
  });

  // Each case below must force a full redraw: painting on top cannot undo
  // pixels that are already on the canvas.
  it('rejects a removal, as after erasing or undo', () => {
    expect(isAppendOnly([a, b, c], [a, b])).toBe(false);
  });

  it('rejects a replaced object, as after a style or geometry edit', () => {
    const edited = { ...b };
    expect(isAppendOnly([a, b], [a, edited])).toBe(false);
  });

  it('rejects a reorder even when the same objects are present', () => {
    expect(isAppendOnly([a, b], [b, a])).toBe(false);
  });

  it('rejects an insert before the end', () => {
    expect(isAppendOnly([a, b], [a, c, b])).toBe(false);
  });

  it('rejects clearing the layer', () => {
    expect(isAppendOnly([a, b], [])).toBe(false);
  });

  it('rejects a same-length list of entirely different objects', () => {
    expect(isAppendOnly([a, b], [{ id: 'a' }, { id: 'b' }])).toBe(false);
  });
});

describe('appendedItems', () => {
  it('returns only the newly added items', () => {
    expect(appendedItems([a], [a, b, c])).toEqual([b, c]);
  });

  it('returns nothing when the list is unchanged', () => {
    expect(appendedItems([a, b], [a, b])).toEqual([]);
  });

  it('returns nothing when a full redraw is required', () => {
    expect(appendedItems([a, b], [b, a])).toEqual([]);
    expect(appendedItems([a, b, c], [a, b])).toEqual([]);
  });
});
