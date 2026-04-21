/**
 * Graph visual themes — types, built-in presets, and resolution helpers.
 *
 * A `GraphTheme` is plain data consumed by `GraphLayer` and the preview in
 * settings. Presets live in `GRAPH_THEME_PRESETS`; user tuning is expressed
 * as a deep-partial `GraphThemeOverrides` and merged on top via
 * {@link resolveTheme}.
 */

export type GraphPresetName = 'classic' | 'textbook' | 'blueprint' | 'minimal' | 'graphPaper';

export type OriginLabelMode = 'none' | 'letter' | 'coords';
export type AxisLabelStyle = 'italic-serif' | 'italic-sans' | 'none';

export interface GridStrokeTheme {
  enabled: boolean;
  color: string;
  width: number;
  opacity: number;
}

export interface MinorGridTheme extends GridStrokeTheme {
  /** Minor divisions per major cell (default 5 ⇒ `majorStep / 5`). */
  subdivisions: number;
}

export interface GraphTheme {
  background: string;
  backgroundEnabled: boolean;
  frameColor: string;
  frameEnabled: boolean;

  axisColor: string;
  axisWidth: number;
  axisArrowheads: boolean;

  /** Length in px of tick marks drawn on the axis itself. `0` disables them. */
  tickLength: number;

  gridMajor: GridStrokeTheme;
  gridMinor: MinorGridTheme;

  labelColor: string;
  labelFontFamily: string;
  labelFontSize: number;

  axisLabelStyle: AxisLabelStyle;
  originLabel: OriginLabelMode;

  curveDefaultWidth: number;
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export type GraphThemeOverrides = DeepPartial<GraphTheme>;

const SANS = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const SERIF = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';

const classic: GraphTheme = {
  background: '#ffffff',
  backgroundEnabled: true,
  frameColor: '#888888',
  frameEnabled: true,

  axisColor: '#3a3a3a',
  axisWidth: 1.25,
  axisArrowheads: false,
  tickLength: 0,

  gridMajor: { enabled: true, color: '#cfcfcf', width: 1, opacity: 1 },
  gridMinor: { enabled: true, color: '#ececec', width: 1, opacity: 1, subdivisions: 5 },

  labelColor: '#555555',
  labelFontFamily: SANS,
  labelFontSize: 10,

  axisLabelStyle: 'italic-serif',
  originLabel: 'none',
  curveDefaultWidth: 2,
};

const textbook: GraphTheme = {
  background: '#ffffff',
  backgroundEnabled: true,
  frameColor: '#000000',
  frameEnabled: false,

  axisColor: '#111111',
  axisWidth: 1.5,
  axisArrowheads: true,
  tickLength: 4,

  gridMajor: { enabled: true, color: '#d6d6d6', width: 1, opacity: 1 },
  gridMinor: { enabled: false, color: '#ebebeb', width: 1, opacity: 1, subdivisions: 5 },

  labelColor: '#111111',
  labelFontFamily: SERIF,
  labelFontSize: 11,

  axisLabelStyle: 'italic-serif',
  originLabel: 'letter',
  curveDefaultWidth: 2,
};

const blueprint: GraphTheme = {
  background: '#0d2340',
  backgroundEnabled: true,
  frameColor: '#2b4a74',
  frameEnabled: true,

  axisColor: '#f2f6fb',
  axisWidth: 1.25,
  axisArrowheads: true,
  tickLength: 4,

  gridMajor: { enabled: true, color: '#6fb6d9', width: 1, opacity: 0.45 },
  gridMinor: { enabled: true, color: '#6fb6d9', width: 1, opacity: 0.18, subdivisions: 5 },

  labelColor: '#e9f1fb',
  labelFontFamily: SANS,
  labelFontSize: 10,

  axisLabelStyle: 'italic-serif',
  originLabel: 'letter',
  curveDefaultWidth: 2.25,
};

const minimal: GraphTheme = {
  background: '#ffffff',
  backgroundEnabled: false,
  frameColor: '#000000',
  frameEnabled: false,

  axisColor: '#222222',
  axisWidth: 1,
  axisArrowheads: false,
  tickLength: 4,

  gridMajor: { enabled: false, color: '#e5e5e5', width: 1, opacity: 1 },
  gridMinor: { enabled: false, color: '#f1f1f1', width: 1, opacity: 1, subdivisions: 5 },

  labelColor: '#333333',
  labelFontFamily: SANS,
  labelFontSize: 10,

  axisLabelStyle: 'italic-serif',
  originLabel: 'none',
  curveDefaultWidth: 2,
};

const graphPaper: GraphTheme = {
  background: '#fff6e6',
  backgroundEnabled: true,
  frameColor: '#d8bc8a',
  frameEnabled: true,

  axisColor: '#a23b1f',
  axisWidth: 1.25,
  axisArrowheads: false,
  tickLength: 0,

  gridMajor: { enabled: true, color: '#d97a4d', width: 1, opacity: 0.55 },
  gridMinor: { enabled: true, color: '#d97a4d', width: 1, opacity: 0.22, subdivisions: 5 },

  labelColor: '#6b4226',
  labelFontFamily: SERIF,
  labelFontSize: 10,

  axisLabelStyle: 'italic-serif',
  originLabel: 'none',
  curveDefaultWidth: 2,
};

export const GRAPH_THEME_PRESETS: Readonly<Record<GraphPresetName, GraphTheme>> = Object.freeze({
  classic,
  textbook,
  blueprint,
  minimal,
  graphPaper,
});

export const GRAPH_PRESET_ORDER: readonly GraphPresetName[] = [
  'classic',
  'textbook',
  'blueprint',
  'minimal',
  'graphPaper',
];

export const GRAPH_PRESET_LABELS: Readonly<Record<GraphPresetName, string>> = {
  classic: 'Classic',
  textbook: 'Textbook',
  blueprint: 'Blueprint',
  minimal: 'Minimal',
  graphPaper: 'Graph paper',
};

export const DEFAULT_GRAPH_PRESET: GraphPresetName = 'classic';

export interface AppearanceThemeInput {
  graphTheme?: GraphPresetName;
  graphOverrides?: GraphThemeOverrides;
}

/**
 * Clone a preset and deep-merge `overrides` on top. Overrides that are
 * `undefined` or not plain objects are ignored — the preset value wins.
 */
export function resolveTheme(appearance: AppearanceThemeInput | undefined | null): GraphTheme {
  const name = appearance?.graphTheme;
  const base =
    name && name in GRAPH_THEME_PRESETS
      ? GRAPH_THEME_PRESETS[name]
      : GRAPH_THEME_PRESETS[DEFAULT_GRAPH_PRESET];
  const overrides = appearance?.graphOverrides;
  return mergeTheme(base, overrides);
}

export function mergeTheme(base: GraphTheme, overrides?: GraphThemeOverrides | null): GraphTheme {
  const merged = cloneTheme(base);
  if (!overrides || typeof overrides !== 'object') return merged;
  mergeInto(merged as unknown as Record<string, unknown>, overrides as Record<string, unknown>);
  return merged;
}

function cloneTheme(t: GraphTheme): GraphTheme {
  return {
    ...t,
    gridMajor: { ...t.gridMajor },
    gridMinor: { ...t.gridMinor },
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeInto(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const key of Object.keys(patch)) {
    const incoming = patch[key];
    if (incoming === undefined) continue;
    const current = target[key];
    if (isPlainObject(current) && isPlainObject(incoming)) {
      mergeInto(current, incoming);
    } else {
      target[key] = incoming;
    }
  }
}

/** Does this value look like a valid preset name? */
export function isGraphPresetName(v: unknown): v is GraphPresetName {
  return typeof v === 'string' && v in GRAPH_THEME_PRESETS;
}
