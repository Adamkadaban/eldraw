import { describe, it, expect } from 'vitest';
import {
  DEFAULT_GRAPH_PRESET,
  GRAPH_PRESET_ORDER,
  GRAPH_THEME_PRESETS,
  isGraphPresetName,
  mergeTheme,
  resolveTheme,
} from '$lib/graph/theme';

describe('graph theme presets', () => {
  it('exposes the five named presets with distinct backgrounds', () => {
    expect(GRAPH_PRESET_ORDER).toEqual([
      'classic',
      'textbook',
      'blueprint',
      'minimal',
      'graphPaper',
    ]);
    const backgrounds = GRAPH_PRESET_ORDER.map((n) => GRAPH_THEME_PRESETS[n].background);
    expect(new Set(backgrounds).size).toBeGreaterThanOrEqual(3);
  });

  it('blueprint uses a dark background with light labels', () => {
    const t = GRAPH_THEME_PRESETS.blueprint;
    expect(t.background).toBe('#0d2340');
    expect(t.labelColor.toLowerCase()).not.toBe('#000000');
  });

  it('minimal disables both grid layers', () => {
    const t = GRAPH_THEME_PRESETS.minimal;
    expect(t.gridMajor.enabled).toBe(false);
    expect(t.gridMinor.enabled).toBe(false);
  });

  it('textbook turns on arrowheads', () => {
    expect(GRAPH_THEME_PRESETS.textbook.axisArrowheads).toBe(true);
  });
});

describe('resolveTheme', () => {
  it('returns the default preset when nothing is specified', () => {
    const t = resolveTheme(undefined);
    expect(t).toEqual(GRAPH_THEME_PRESETS[DEFAULT_GRAPH_PRESET]);
  });

  it('returns the named preset when no overrides are supplied', () => {
    const t = resolveTheme({ graphTheme: 'blueprint' });
    expect(t).toEqual(GRAPH_THEME_PRESETS.blueprint);
  });

  it('falls back to the default for unknown preset names', () => {
    const t = resolveTheme({
      // @ts-expect-error — exercising the runtime fallback
      graphTheme: 'not-a-preset',
    });
    expect(t).toEqual(GRAPH_THEME_PRESETS[DEFAULT_GRAPH_PRESET]);
  });

  it('overrides scalar fields while leaving siblings untouched', () => {
    const t = resolveTheme({
      graphTheme: 'classic',
      graphOverrides: { axisColor: '#ff0000' },
    });
    expect(t.axisColor).toBe('#ff0000');
    expect(t.labelColor).toBe(GRAPH_THEME_PRESETS.classic.labelColor);
  });

  it('deep-merges nested grid overrides', () => {
    const t = resolveTheme({
      graphTheme: 'classic',
      graphOverrides: { gridMajor: { color: '#112233', opacity: 0.5 } },
    });
    expect(t.gridMajor.color).toBe('#112233');
    expect(t.gridMajor.opacity).toBe(0.5);
    expect(t.gridMajor.enabled).toBe(GRAPH_THEME_PRESETS.classic.gridMajor.enabled);
    expect(t.gridMajor.width).toBe(GRAPH_THEME_PRESETS.classic.gridMajor.width);
  });

  it('is immutable with respect to the preset table', () => {
    const t = resolveTheme({ graphTheme: 'classic' });
    t.gridMajor.color = '#000000';
    expect(GRAPH_THEME_PRESETS.classic.gridMajor.color).not.toBe('#000000');
  });

  it('ignores undefined fields in overrides', () => {
    const t = resolveTheme({
      graphTheme: 'classic',
      graphOverrides: { axisColor: undefined, gridMajor: { opacity: undefined } },
    });
    expect(t.axisColor).toBe(GRAPH_THEME_PRESETS.classic.axisColor);
    expect(t.gridMajor.opacity).toBe(GRAPH_THEME_PRESETS.classic.gridMajor.opacity);
  });

  it('ignores non-object overrides', () => {
    const t = mergeTheme(GRAPH_THEME_PRESETS.classic, null);
    expect(t).toEqual(GRAPH_THEME_PRESETS.classic);
  });
});

describe('isGraphPresetName', () => {
  it('accepts known preset names', () => {
    for (const name of GRAPH_PRESET_ORDER) {
      expect(isGraphPresetName(name)).toBe(true);
    }
  });
  it('rejects everything else', () => {
    expect(isGraphPresetName('unknown')).toBe(false);
    expect(isGraphPresetName(42)).toBe(false);
    expect(isGraphPresetName(null)).toBe(false);
  });
});
