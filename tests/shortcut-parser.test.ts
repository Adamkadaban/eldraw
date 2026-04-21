import { describe, expect, it } from 'vitest';
import {
  formatSpec,
  isEditableTarget,
  matchesEvent,
  parseShortcut,
} from '../src/lib/app/shortcutParser';

function kb(
  key: string,
  mods: Partial<{ ctrl: boolean; shift: boolean; alt: boolean; meta: boolean }> = {},
): KeyboardEvent {
  return {
    key,
    ctrlKey: mods.ctrl ?? false,
    shiftKey: mods.shift ?? false,
    altKey: mods.alt ?? false,
    metaKey: mods.meta ?? false,
  } as KeyboardEvent;
}

describe('parseShortcut', () => {
  it('parses a single character as lowercase key', () => {
    const p = parseShortcut('P');
    expect(p).toEqual({
      key: 'p',
      ctrl: false,
      shift: false,
      alt: false,
      meta: false,
      modOrMeta: false,
    });
  });

  it('parses Ctrl+Z', () => {
    expect(parseShortcut('Ctrl+Z')).toEqual({
      key: 'z',
      ctrl: true,
      shift: false,
      alt: false,
      meta: false,
      modOrMeta: false,
    });
  });

  it('parses Ctrl+Shift+Z', () => {
    expect(parseShortcut('Ctrl+Shift+Z')).toEqual({
      key: 'z',
      ctrl: true,
      shift: true,
      alt: false,
      meta: false,
      modOrMeta: false,
    });
  });

  it('preserves named keys like ArrowLeft', () => {
    expect(parseShortcut('ArrowLeft').key).toBe('ArrowLeft');
    expect(parseShortcut('PageUp').key).toBe('PageUp');
  });

  it('parses bracket keys', () => {
    expect(parseShortcut('[').key).toBe('[');
    expect(parseShortcut(']').key).toBe(']');
  });

  it('accepts Cmd as meta alias', () => {
    const p = parseShortcut('Cmd+Z');
    expect(p.meta).toBe(true);
    expect(p.key).toBe('z');
  });

  it('throws on empty spec', () => {
    expect(() => parseShortcut('')).toThrow();
  });

  it('throws when only modifiers given', () => {
    expect(() => parseShortcut('Ctrl+Shift')).toThrow();
  });

  it('parses Mod as modOrMeta', () => {
    const p = parseShortcut('Mod+Z');
    expect(p.modOrMeta).toBe(true);
    expect(p.ctrl).toBe(false);
    expect(p.meta).toBe(false);
  });
});

describe('matchesEvent', () => {
  it('matches a bare key', () => {
    expect(matchesEvent(parseShortcut('p'), kb('p'))).toBe(true);
    expect(matchesEvent(parseShortcut('p'), kb('P'))).toBe(true);
  });

  it('requires modifiers to match exactly', () => {
    expect(matchesEvent(parseShortcut('Ctrl+Z'), kb('z', { ctrl: true }))).toBe(true);
    expect(matchesEvent(parseShortcut('Ctrl+Z'), kb('z'))).toBe(false);
    expect(matchesEvent(parseShortcut('Ctrl+Z'), kb('z', { ctrl: true, shift: true }))).toBe(false);
  });

  it('matches named keys', () => {
    expect(matchesEvent(parseShortcut('ArrowLeft'), kb('ArrowLeft'))).toBe(true);
    expect(matchesEvent(parseShortcut('ArrowLeft'), kb('ArrowRight'))).toBe(false);
  });

  it('Mod matches either Ctrl or Meta', () => {
    const p = parseShortcut('Mod+Z');
    expect(matchesEvent(p, kb('z', { ctrl: true }))).toBe(true);
    expect(matchesEvent(p, kb('z', { meta: true }))).toBe(true);
    expect(matchesEvent(p, kb('z'))).toBe(false);
  });

  it('Space spec matches a Space keydown and round-trips through formatSpec', () => {
    const p = parseShortcut('Space');
    expect(p.key).toBe(' ');
    expect(matchesEvent(p, kb(' '))).toBe(true);
    expect(formatSpec('Space')).toBe('Space');
    expect(matchesEvent(parseShortcut('Shift+Space'), kb(' ', { shift: true }))).toBe(true);
  });
});

describe('isEditableTarget', () => {
  it('returns true for input, textarea, select tagName', () => {
    expect(isEditableTarget({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true);
    expect(isEditableTarget({ tagName: 'SELECT' } as unknown as EventTarget)).toBe(true);
  });

  it('returns true for contenteditable', () => {
    expect(
      isEditableTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget),
    ).toBe(true);
  });

  it('returns false for plain elements and null', () => {
    expect(isEditableTarget({ tagName: 'DIV' } as unknown as EventTarget)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});
