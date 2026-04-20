import { describe, it, expect } from 'vitest';
import { estimateTextBounds, hitTestTextObject, hitTestTextObjects } from '$lib/text/hitTest';
import type { TextObject } from '$lib/types';

function text(partial: Partial<TextObject> & Pick<TextObject, 'id' | 'at'>): TextObject {
  return {
    id: partial.id,
    createdAt: 0,
    type: 'text',
    at: partial.at,
    content: partial.content ?? 'hello',
    latex: partial.latex ?? false,
    fontSize: partial.fontSize ?? 16,
    color: partial.color ?? '#000',
  };
}

describe('estimateTextBounds', () => {
  it('returns at-anchored width and height for plain text', () => {
    const b = estimateTextBounds(text({ id: 'a', at: { x: 10, y: 20 }, content: 'abc' }));
    expect(b.x).toBe(10);
    expect(b.y).toBe(20);
    expect(b.width).toBeGreaterThan(0);
    expect(b.height).toBeGreaterThanOrEqual(16);
  });

  it('grows with content length', () => {
    const small = estimateTextBounds(text({ id: 'a', at: { x: 0, y: 0 }, content: 'hi' }));
    const big = estimateTextBounds(
      text({ id: 'b', at: { x: 0, y: 0 }, content: 'hello there friend' }),
    );
    expect(big.width).toBeGreaterThan(small.width);
  });

  it('grows with newlines', () => {
    const one = estimateTextBounds(text({ id: 'a', at: { x: 0, y: 0 }, content: 'a' }));
    const three = estimateTextBounds(text({ id: 'b', at: { x: 0, y: 0 }, content: 'a\nb\nc' }));
    expect(three.height).toBeGreaterThan(one.height);
  });

  it('uses wider per-char estimate for latex content', () => {
    const plain = estimateTextBounds(text({ id: 'a', at: { x: 0, y: 0 }, content: 'xxxx' }));
    const latex = estimateTextBounds(
      text({ id: 'b', at: { x: 0, y: 0 }, content: 'xxxx', latex: true }),
    );
    expect(latex.width).toBeGreaterThan(plain.width);
  });

  it('returns at least font-size dimensions for empty content', () => {
    const b = estimateTextBounds(text({ id: 'a', at: { x: 5, y: 7 }, content: '', fontSize: 24 }));
    expect(b.width).toBeGreaterThanOrEqual(24);
    expect(b.height).toBeGreaterThanOrEqual(24);
  });
});

describe('hitTestTextObject', () => {
  const obj = text({ id: 'a', at: { x: 100, y: 100 }, content: 'hello', fontSize: 16 });

  it('hits inside the bounds', () => {
    expect(hitTestTextObject(obj, { x: 105, y: 105 })).toBe(true);
  });

  it('misses far above the object', () => {
    expect(hitTestTextObject(obj, { x: 105, y: 0 })).toBe(false);
  });

  it('misses far to the left of the object', () => {
    expect(hitTestTextObject(obj, { x: 0, y: 105 })).toBe(false);
  });

  it('respects padding for forgiving picks', () => {
    expect(hitTestTextObject(obj, { x: 99, y: 99 }, 0)).toBe(false);
    expect(hitTestTextObject(obj, { x: 99, y: 99 }, 4)).toBe(true);
  });
});

describe('hitTestTextObjects', () => {
  it('returns the topmost (last) overlapping object', () => {
    const a = text({ id: 'a', at: { x: 0, y: 0 }, content: 'wide enough text' });
    const b = text({ id: 'b', at: { x: 0, y: 0 }, content: 'wide enough text' });
    const hit = hitTestTextObjects([a, b], { x: 5, y: 5 });
    expect(hit?.id).toBe('b');
  });

  it('returns null when no object is hit', () => {
    const a = text({ id: 'a', at: { x: 0, y: 0 }, content: 'hi' });
    expect(hitTestTextObjects([a], { x: 5000, y: 5000 })).toBeNull();
  });
});
