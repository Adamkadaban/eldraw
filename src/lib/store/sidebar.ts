import { derived, get, writable, type Readable } from 'svelte/store';
import type { ColorPalette, DashStyle, StrokeStyle, ToolKind, ToolPreset } from '$lib/types';
import { clampFadeMs, DEFAULT_TEMP_INK_FADE_MS } from '$lib/tools/tempInk';

export type StyledTool = 'pen' | 'highlighter' | 'line';

export const MAX_PRESETS = 9;

export interface LaserStyle {
  color: string;
  radius: number;
}

export const DEFAULT_LASER_STYLE: LaserStyle = { color: '#ff2d2d', radius: 6 };
export const MIN_LASER_RADIUS = 2;
export const MAX_LASER_RADIUS = 24;

export const PRESET_COLORS: readonly string[] = [
  '#000000',
  '#e53935',
  '#1e88e5',
  '#43a047',
  '#fb8c00',
  '#8e24aa',
  '#fdd835',
  '#00acc1',
  '#ec407a',
  '#ffffff',
];

const DEFAULT_PEN: StrokeStyle = { color: '#000000', width: 2, dash: 'solid', opacity: 1 };
const DEFAULT_HIGHLIGHTER: StrokeStyle = {
  color: '#fdd835',
  width: 14,
  dash: 'solid',
  opacity: 0.3,
};
const DEFAULT_LINE: StrokeStyle = { color: '#000000', width: 2, dash: 'solid', opacity: 1 };

export interface SidebarState {
  pinned: boolean;
  activeTool: ToolKind;
  toolStyles: Record<StyledTool, StrokeStyle>;
  palettes: ColorPalette[];
  activeColor: string;
  laser: LaserStyle;
  tempInkFadeMs: number;
  presets: ToolPreset[];
  floatingPos: { x: number; y: number } | null;
}

function initialState(): SidebarState {
  return {
    pinned: true,
    activeTool: 'pen',
    toolStyles: {
      pen: { ...DEFAULT_PEN },
      highlighter: { ...DEFAULT_HIGHLIGHTER },
      line: { ...DEFAULT_LINE },
    },
    palettes: [
      { id: 'presets', name: 'Presets', colors: [...PRESET_COLORS] },
      { id: 'custom', name: 'Custom', colors: [] },
    ],
    activeColor: '#000000',
    laser: { ...DEFAULT_LASER_STYLE },
    tempInkFadeMs: DEFAULT_TEMP_INK_FADE_MS,
    presets: [],
    floatingPos: null,
  };
}

export function canPresetTool(tool: ToolKind): boolean {
  return styleKeyFor(tool) !== null;
}

export function styleKeyFor(tool: ToolKind): StyledTool | null {
  if (tool === 'pen' || tool === 'highlighter' || tool === 'line') return tool;
  if (tool === 'rect' || tool === 'ellipse' || tool === 'numberline') return 'line';
  return null;
}

function nextDash(current: DashStyle): DashStyle {
  if (current === 'solid') return 'dashed';
  if (current === 'dashed') return 'dotted';
  return 'solid';
}

function mapPalette(
  state: SidebarState,
  id: string,
  fn: (colors: string[]) => string[],
): SidebarState {
  return {
    ...state,
    palettes: state.palettes.map((p) => (p.id === id ? { ...p, colors: fn(p.colors) } : p)),
  };
}

function createSidebarStore() {
  const store = writable<SidebarState>(initialState());
  const { subscribe, update, set } = store;

  function applyPresetValue(preset: ToolPreset) {
    const key = styleKeyFor(preset.tool);
    if (!key) return;
    update((st) => ({
      ...st,
      activeTool: preset.tool,
      activeColor: preset.style.color,
      toolStyles: { ...st.toolStyles, [key]: { ...preset.style } },
    }));
  }

  return {
    subscribe,
    set,
    reset: () => set(initialState()),

    setTool(tool: ToolKind) {
      update((s) => {
        if (s.activeTool === tool) return s;
        const next: SidebarState = { ...s, activeTool: tool };
        const key = styleKeyFor(tool);
        if (key) {
          next.activeColor = s.toolStyles[key].color;
        } else if (tool === 'laser') {
          next.activeColor = s.laser.color;
        }
        return next;
      });
    },

    setActiveColor(color: string) {
      update((s) => {
        const next: SidebarState = { ...s, activeColor: color };
        const key = styleKeyFor(s.activeTool);
        if (key) {
          next.toolStyles = {
            ...s.toolStyles,
            [key]: { ...s.toolStyles[key], color },
          };
        } else if (s.activeTool === 'laser') {
          next.laser = { ...s.laser, color };
        }
        return next;
      });
    },

    addCustomColor(color: string) {
      update((s) => {
        const presets = s.palettes.find((p) => p.id === 'presets');
        const custom = s.palettes.find((p) => p.id === 'custom');
        if (presets?.colors.includes(color) || custom?.colors.includes(color)) return s;
        return mapPalette(s, 'custom', (colors) => [...colors, color]);
      });
    },

    removeCustomColor(color: string) {
      update((s) => mapPalette(s, 'custom', (colors) => colors.filter((c) => c !== color)));
    },

    setWidth(width: number) {
      update((s) => {
        const key = styleKeyFor(s.activeTool);
        if (!key) return s;
        return {
          ...s,
          toolStyles: {
            ...s.toolStyles,
            [key]: { ...s.toolStyles[key], width },
          },
        };
      });
    },

    setDash(dash: DashStyle) {
      update((s) => {
        const key = styleKeyFor(s.activeTool);
        if (!key) return s;
        return {
          ...s,
          toolStyles: {
            ...s.toolStyles,
            [key]: { ...s.toolStyles[key], dash },
          },
        };
      });
    },

    cycleDash() {
      update((s) => {
        const key = styleKeyFor(s.activeTool);
        if (!key) return s;
        const current = s.toolStyles[key];
        return {
          ...s,
          toolStyles: {
            ...s.toolStyles,
            [key]: { ...current, dash: nextDash(current.dash) },
          },
        };
      });
    },

    togglePin() {
      update((s) => ({ ...s, pinned: !s.pinned }));
    },

    setFloatingPos(pos: { x: number; y: number } | null) {
      if (pos && (!Number.isFinite(pos.x) || !Number.isFinite(pos.y))) return;
      update((s) => ({ ...s, floatingPos: pos }));
    },

    resetFloatingPos() {
      update((s) => ({ ...s, floatingPos: null }));
    },

    setLaserRadius(radius: number) {
      const clamped = Math.min(MAX_LASER_RADIUS, Math.max(MIN_LASER_RADIUS, radius));
      update((s) => ({ ...s, laser: { ...s.laser, radius: clamped } }));
    },

    setTempInkFadeMs(ms: number) {
      update((s) => ({ ...s, tempInkFadeMs: clampFadeMs(ms) }));
    },

    capturePreset(): ToolPreset | null {
      const s = get(store);
      const key = styleKeyFor(s.activeTool);
      if (!key) return null;
      if (s.presets.length >= MAX_PRESETS) return null;
      const preset: ToolPreset = {
        id: crypto.randomUUID(),
        tool: s.activeTool,
        style: { ...s.toolStyles[key], color: s.activeColor },
      };
      update((st) => ({ ...st, presets: [...st.presets, preset] }));
      return preset;
    },

    removePreset(id: string) {
      update((s) => ({ ...s, presets: s.presets.filter((p) => p.id !== id) }));
    },

    applyPreset(id: string) {
      const s = get(store);
      const preset = s.presets.find((p) => p.id === id);
      if (!preset) return;
      applyPresetValue(preset);
    },

    applyPresetSlot(slot: number) {
      const s = get(store);
      const preset = s.presets[slot - 1];
      if (preset) applyPresetValue(preset);
    },

    setPresets(presets: ToolPreset[]) {
      update((s) => ({ ...s, presets: presets.slice(0, MAX_PRESETS) }));
    },

    snapshot(): SidebarState {
      return get(store);
    },
  };
}

export const sidebar = createSidebarStore();

const PRESETS_STORAGE_KEY = 'eldraw.presets.v1';
const FLOATING_POS_STORAGE_KEY = 'eldraw.sidebar-pos.v1';

const VALID_TOOLS: ReadonlySet<ToolKind> = new Set<ToolKind>([
  'pen',
  'highlighter',
  'eraser',
  'line',
  'rect',
  'ellipse',
  'numberline',
  'graph',
  'text',
  'select',
  'pan',
  'laser',
  'temp-ink',
  'protractor',
  'ruler',
]);

const VALID_DASH: ReadonlySet<DashStyle> = new Set<DashStyle>(['solid', 'dashed', 'dotted']);

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function isValidPreset(value: unknown): value is ToolPreset {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  if (typeof p.id !== 'string') return false;
  if (typeof p.tool !== 'string' || !VALID_TOOLS.has(p.tool as ToolKind)) return false;
  const style = p.style as Record<string, unknown> | undefined;
  if (!style || typeof style !== 'object') return false;
  if (typeof style.color !== 'string') return false;
  if (typeof style.dash !== 'string' || !VALID_DASH.has(style.dash as DashStyle)) return false;
  if (typeof style.width !== 'number' || !Number.isFinite(style.width)) return false;
  if (typeof style.opacity !== 'number' || !Number.isFinite(style.opacity)) return false;
  return true;
}

function sanitizePreset(p: ToolPreset): ToolPreset {
  return {
    ...p,
    style: {
      ...p.style,
      width: clamp(p.style.width, 0.25, 64),
      opacity: clamp(p.style.opacity, 0, 1),
    },
  };
}

function loadPersistedPresets(): ToolPreset[] | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(isValidPreset).map(sanitizePreset).slice(0, MAX_PRESETS);
  } catch {
    return null;
  }
}

function loadPersistedFloatingPos(): { x: number; y: number } | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(FLOATING_POS_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const p = parsed as Record<string, unknown>;
    if (typeof p.x !== 'number' || typeof p.y !== 'number') return null;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    return { x: p.x, y: p.y };
  } catch {
    return null;
  }
}

let hydrated = false;
let hydrationUnsubscribe: (() => void) | null = null;

export function hydrateSidebarFromStorage(): () => void {
  if (hydrated) return hydrationUnsubscribe ?? (() => undefined);
  hydrated = true;

  const presets = loadPersistedPresets();
  if (presets && presets.length > 0) sidebar.setPresets(presets);

  const floatingPos = loadPersistedFloatingPos();
  if (floatingPos) sidebar.setFloatingPos(floatingPos);

  if (typeof localStorage === 'undefined') {
    hydrationUnsubscribe = () => undefined;
    return hydrationUnsubscribe;
  }

  const unsubscribe = sidebar.subscribe((s) => {
    try {
      localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(s.presets));
      if (s.floatingPos) {
        localStorage.setItem(FLOATING_POS_STORAGE_KEY, JSON.stringify(s.floatingPos));
      } else {
        localStorage.removeItem(FLOATING_POS_STORAGE_KEY);
      }
    } catch {
      // storage full or unavailable; ignore
    }
  });
  hydrationUnsubscribe = () => {
    unsubscribe();
    hydrated = false;
    hydrationUnsubscribe = null;
  };
  return hydrationUnsubscribe;
}

export const currentStyle: Readable<StrokeStyle> = derived(sidebar, (s) => {
  const key = styleKeyFor(s.activeTool);
  const base = key
    ? s.toolStyles[key]
    : { color: s.activeColor, width: 2, dash: 'solid' as DashStyle, opacity: 1 };
  return { ...base, color: s.activeColor };
});
