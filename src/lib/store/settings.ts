import { get, writable, type Readable } from 'svelte/store';
import {
  DEFAULT_GRAPH_PRESET,
  isGraphPresetName,
  type GraphPresetName,
  type GraphThemeOverrides,
} from '$lib/graph/theme';

export type ReloadBehavior = 'keep' | 'discard';

export interface Settings {
  reloadBehavior: ReloadBehavior;
  graphTheme: GraphPresetName;
  graphOverrides: GraphThemeOverrides;
}

const DEFAULTS: Settings = {
  reloadBehavior: 'keep',
  graphTheme: DEFAULT_GRAPH_PRESET,
  graphOverrides: {},
};
const STORAGE_KEY = 'eldraw.settings.v1';

function loadPersisted(): Settings {
  if (typeof localStorage === 'undefined') return cloneDefaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefaults();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return cloneDefaults();
    const p = parsed as Record<string, unknown>;
    const reloadBehavior =
      p.reloadBehavior === 'keep' || p.reloadBehavior === 'discard'
        ? p.reloadBehavior
        : DEFAULTS.reloadBehavior;
    const graphTheme = isGraphPresetName(p.graphTheme) ? p.graphTheme : DEFAULTS.graphTheme;
    const graphOverrides =
      p.graphOverrides && typeof p.graphOverrides === 'object' && !Array.isArray(p.graphOverrides)
        ? (p.graphOverrides as GraphThemeOverrides)
        : {};
    return { reloadBehavior, graphTheme, graphOverrides };
  } catch {
    return cloneDefaults();
  }
}

function cloneDefaults(): Settings {
  return { ...DEFAULTS, graphOverrides: {} };
}

function persist(s: Settings): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // storage full or unavailable; ignore
  }
}

const internal = writable<Settings>(loadPersisted());

export const settings: Readable<Settings> & {
  setReloadBehavior: (b: ReloadBehavior) => void;
  setGraphTheme: (name: GraphPresetName) => void;
  setGraphOverrides: (overrides: GraphThemeOverrides) => void;
  resetGraphOverrides: () => void;
  snapshot: () => Settings;
  reset: () => void;
} = {
  subscribe: internal.subscribe,
  setReloadBehavior(b) {
    internal.update((s) => {
      const next = { ...s, reloadBehavior: b };
      persist(next);
      return next;
    });
  },
  setGraphTheme(name) {
    internal.update((s) => {
      const next = { ...s, graphTheme: name };
      persist(next);
      return next;
    });
  },
  setGraphOverrides(overrides) {
    internal.update((s) => {
      const next = { ...s, graphOverrides: overrides };
      persist(next);
      return next;
    });
  },
  resetGraphOverrides() {
    internal.update((s) => {
      const next = { ...s, graphOverrides: {} };
      persist(next);
      return next;
    });
  },
  snapshot() {
    return get(internal);
  },
  reset() {
    internal.set(cloneDefaults());
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  },
};
