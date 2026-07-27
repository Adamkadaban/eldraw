import { describe, expect, it } from 'vitest';
import { defaultSlideTheme, isSafeSlideTheme, resolveTheme } from '$lib/slides/theme';
import type { SlideTheme } from '$lib/types';

describe('slide theme validation', () => {
  it('accepts the default theme', () => {
    expect(isSafeSlideTheme(defaultSlideTheme)).toBe(true);
  });

  it.each([
    { background: 'red; background: url(x)' },
    { accent: 'javascript:' },
    { textColor: '#xyz' },
    { fontFamily: '<script>' },
    { fontFamily: 'system-ui; color: red' },
    { fontFamily: 'url(evil)' },
    { fontFamily: 42 },
  ])('rejects unsafe theme data %#', (patch) => {
    expect(isSafeSlideTheme({ ...defaultSlideTheme, ...patch })).toBe(false);
  });

  it('rejects missing, extra, and non-object values', () => {
    const missing: Partial<SlideTheme> = { ...defaultSlideTheme };
    delete missing.bodySize;
    expect(isSafeSlideTheme(missing)).toBe(false);
    expect(isSafeSlideTheme({ ...defaultSlideTheme, extra: true })).toBe(false);
    expect(isSafeSlideTheme(null)).toBe(false);
    expect(isSafeSlideTheme('theme')).toBe(false);
  });

  it('falls back field-by-field instead of throwing', () => {
    const resolved = resolveTheme(
      {
        ...defaultSlideTheme,
        accent: 'javascript:',
        fontFamily: '<script>',
        bodySize: Number.NaN,
      },
      {
        background: 'red; background: url(x)',
        titleColor: '#xyz',
        headingSize: -4,
      } as Partial<typeof defaultSlideTheme>,
    );
    expect(resolved.accent).toBe(defaultSlideTheme.accent);
    expect(resolved.fontFamily).toBe(defaultSlideTheme.fontFamily);
    expect(resolved.bodySize).toBe(defaultSlideTheme.bodySize);
    expect(resolved.background).toBe(defaultSlideTheme.background);
    expect(resolved.titleColor).toBe(defaultSlideTheme.titleColor);
    expect(resolved.headingSize).toBe(defaultSlideTheme.headingSize);
  });

  it('merges valid overrides over a valid base', () => {
    const resolved = resolveTheme(
      { ...defaultSlideTheme, accent: '#112233' },
      { bodySize: 15, background: '#fefefe' },
    );
    expect(resolved.accent).toBe('#112233');
    expect(resolved.bodySize).toBe(15);
    expect(resolved.background).toBe('#fefefe');
  });
});
