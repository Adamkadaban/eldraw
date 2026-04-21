import { describe, expect, it } from 'vitest';
import { isTextInput } from '../src/lib/app/focus';

function el(props: Record<string, unknown>): EventTarget {
  return props as unknown as EventTarget;
}

describe('isTextInput', () => {
  it('returns true for textarea', () => {
    expect(isTextInput(el({ tagName: 'TEXTAREA' }))).toBe(true);
  });

  it('returns true for text-like input types', () => {
    for (const type of ['text', 'number', 'search', 'url', 'email', 'password', 'tel']) {
      expect(isTextInput(el({ tagName: 'INPUT', type }))).toBe(true);
    }
  });

  it('treats an input with no type as text', () => {
    expect(isTextInput(el({ tagName: 'INPUT' }))).toBe(true);
  });

  it('returns false for non-text input types', () => {
    for (const type of ['checkbox', 'radio', 'color', 'range', 'file', 'button', 'submit']) {
      expect(isTextInput(el({ tagName: 'INPUT', type }))).toBe(false);
    }
  });

  it('returns true for contenteditable elements regardless of tag', () => {
    expect(isTextInput(el({ tagName: 'DIV', isContentEditable: true }))).toBe(true);
    expect(isTextInput(el({ tagName: 'SPAN', isContentEditable: true }))).toBe(true);
  });

  it('returns false for plain elements, select, and null', () => {
    expect(isTextInput(el({ tagName: 'DIV' }))).toBe(false);
    expect(isTextInput(el({ tagName: 'SELECT' }))).toBe(false);
    expect(isTextInput(el({ tagName: 'BUTTON' }))).toBe(false);
    expect(isTextInput(null)).toBe(false);
  });

  it('is case-insensitive on the input type attribute', () => {
    expect(isTextInput(el({ tagName: 'INPUT', type: 'TEXT' }))).toBe(true);
    expect(isTextInput(el({ tagName: 'INPUT', type: 'Email' }))).toBe(true);
  });
});
