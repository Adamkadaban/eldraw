import { describe, expect, it } from 'vitest';
import { pageIndexAfterDelete, pageIndexAfterDuplicate } from '$lib/app/pageNav';

describe('pageIndexAfterDuplicate', () => {
  it('lands on the copy that follows the source page', () => {
    expect(pageIndexAfterDuplicate(0, 4)).toBe(1);
    expect(pageIndexAfterDuplicate(2, 5)).toBe(3);
  });

  it('clamps when the source was the last page', () => {
    expect(pageIndexAfterDuplicate(3, 4)).toBe(3);
  });

  it('returns 0 for an empty document', () => {
    expect(pageIndexAfterDuplicate(2, 0)).toBe(0);
  });
});

describe('pageIndexAfterDelete', () => {
  it('keeps the same content in view when an earlier page is deleted', () => {
    // 3 pages [A,B,C], viewing C (index 2), delete A -> C is now index 1.
    expect(pageIndexAfterDelete(0, 2, 2)).toBe(1);
  });

  it('steps back when the current page is deleted', () => {
    expect(pageIndexAfterDelete(2, 2, 2)).toBe(1);
  });

  it('leaves the position untouched when a later page is deleted', () => {
    expect(pageIndexAfterDelete(2, 0, 2)).toBe(0);
    expect(pageIndexAfterDelete(3, 1, 3)).toBe(1);
  });

  it('never goes below the first page', () => {
    expect(pageIndexAfterDelete(0, 0, 1)).toBe(0);
  });

  it('clamps to the last remaining page', () => {
    expect(pageIndexAfterDelete(0, 9, 2)).toBe(1);
  });

  it('returns 0 for an empty document', () => {
    expect(pageIndexAfterDelete(0, 0, 0)).toBe(0);
  });
});
