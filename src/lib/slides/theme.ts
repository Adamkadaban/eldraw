import { isSafeHexColor } from '$lib/color';
import type { SlideTheme } from '$lib/types';

const SAFE_FONT_FAMILY_RE = /^[A-Za-z0-9 ,_'’-]+$/;
const FORBIDDEN_FONT_TOKEN_RE = /(?:url|expression)\s*\(/i;
const MIN_FONT_SIZE = 6;
const MAX_FONT_SIZE = 144;

export const defaultSlideTheme: SlideTheme = Object.freeze({
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
  background: '#fbfbf8',
  titleColor: '#25282d',
  textColor: '#34383f',
  accent: '#356f8a',
  titleSize: 34,
  headingSize: 20,
  bodySize: 13,
});

function isSafeFontFamily(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 200 &&
    SAFE_FONT_FAMILY_RE.test(value) &&
    !FORBIDDEN_FONT_TOKEN_RE.test(value)
  );
}

function isSafeFontSize(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_FONT_SIZE &&
    value <= MAX_FONT_SIZE
  );
}

function safeColor(value: unknown, fallback: string): string {
  return isSafeHexColor(value) ? value : fallback;
}

function safeFontFamily(value: unknown, fallback: string): string {
  return isSafeFontFamily(value) ? value : fallback;
}

function safeFontSize(value: unknown, fallback: number): number {
  return isSafeFontSize(value) ? value : fallback;
}

/** Resolve untrusted deck and slide values without allowing CSS injection. */
export function resolveTheme(
  base: SlideTheme | undefined,
  override: Partial<SlideTheme> | undefined,
): SlideTheme {
  const resolvedBase: SlideTheme = {
    fontFamily: safeFontFamily(base?.fontFamily, defaultSlideTheme.fontFamily),
    background: safeColor(base?.background, defaultSlideTheme.background),
    titleColor: safeColor(base?.titleColor, defaultSlideTheme.titleColor),
    textColor: safeColor(base?.textColor, defaultSlideTheme.textColor),
    accent: safeColor(base?.accent, defaultSlideTheme.accent),
    titleSize: safeFontSize(base?.titleSize, defaultSlideTheme.titleSize),
    headingSize: safeFontSize(base?.headingSize, defaultSlideTheme.headingSize),
    bodySize: safeFontSize(base?.bodySize, defaultSlideTheme.bodySize),
  };

  return {
    fontFamily: safeFontFamily(override?.fontFamily, resolvedBase.fontFamily),
    background: safeColor(override?.background, resolvedBase.background),
    titleColor: safeColor(override?.titleColor, resolvedBase.titleColor),
    textColor: safeColor(override?.textColor, resolvedBase.textColor),
    accent: safeColor(override?.accent, resolvedBase.accent),
    titleSize: safeFontSize(override?.titleSize, resolvedBase.titleSize),
    headingSize: safeFontSize(override?.headingSize, resolvedBase.headingSize),
    bodySize: safeFontSize(override?.bodySize, resolvedBase.bodySize),
  };
}

export function isSafeSlideTheme(value: unknown): value is SlideTheme {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const theme = value as Record<string, unknown>;
  const expectedKeys = [
    'fontFamily',
    'background',
    'titleColor',
    'textColor',
    'accent',
    'titleSize',
    'headingSize',
    'bodySize',
  ];
  if (
    Object.keys(theme).length !== expectedKeys.length ||
    expectedKeys.some((key) => !Object.hasOwn(theme, key))
  ) {
    return false;
  }
  return (
    isSafeFontFamily(theme.fontFamily) &&
    isSafeHexColor(theme.background) &&
    isSafeHexColor(theme.titleColor) &&
    isSafeHexColor(theme.textColor) &&
    isSafeHexColor(theme.accent) &&
    isSafeFontSize(theme.titleSize) &&
    isSafeFontSize(theme.headingSize) &&
    isSafeFontSize(theme.bodySize)
  );
}
