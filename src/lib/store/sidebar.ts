import { derived, get, writable, type Readable } from 'svelte/store';
import type { ColorPalette, DashStyle, StrokeStyle, ToolKind, ToolPreset } from '$lib/types';
import { clampFadeMs, DEFAULT_TEMP_INK_FADE_MS } from '$lib/tools/tempInk';
import type { SnapEdge } from '$lib/sidebar/snap';

export type { SnapEdge };

export type StyledTool = 'pen' | 'highlighter' | 'line';

export type SmoothingTool = 'pen' | 'highlighter' | 'temp-ink';

export const MAX_PRESETS = 9;

export const DEFAULT_SMOOTHING_PEN = 50;
export const DEFAULT_SMOOTHING_HIGHLIGHTER = 50;
export const DEFAULT_SMOOTHING_TEMP_INK = 30;

export const DEFAULT_STRAIGHT_EDGE_SNAP_STEP = 15;
export const MIN_STRAIGHT_EDGE_SNAP_STEP = 1;
export const MAX_STRAIGHT_EDGE_SNAP_STEP = 90;

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
  detached: boolean;
  activeTool: ToolKind;
  toolStyles: Record<StyledTool, StrokeStyle>;
  palettes: ColorPalette[];
  activeColor: string;
  laser: LaserStyle;
  tempInkFadeMs: number;
  smoothingPen: number;
  smoothingHighlighter: number;
  smoothingTempInk: number;
  straightEdgeSnapStep: number;
  presets: ToolPreset[];
  floatingPos: { x: number; y: number } | null;
  hidden: boolean;
  minimized: boolean;
  snapEdge: SnapEdge | null;
  rightBarHidden: boolean;
}

const VALID_SNAP_EDGES: ReadonlySet<SnapEdge> = new Set<SnapEdge>([
  'left',
  'right',
  'top',
  'bottom',
]);

function initialState(): SidebarState {
  return {
    pinned: true,
    detached: false,
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
    smoothingPen: DEFAULT_SMOOTHING_PEN,
    smoothingHighlighter: DEFAULT_SMOOTHING_HIGHLIGHTER,
    smoothingTempInk: DEFAULT_SMOOTHING_TEMP_INK,
    straightEdgeSnapStep: DEFAULT_STRAIGHT_EDGE_SNAP_STEP,
    presets: [],
    floatingPos: null,
    hidden: false,
    minimized: false,
    snapEdge: null,
    rightBarHidden: false,
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

    setHidden(hidden: boolean) {
      update((s) => (s.hidden === hidden ? s : { ...s, hidden }));
    },

    toggleHidden() {
      update((s) => ({ ...s, hidden: !s.hidden }));
    },

    setMinimized(minimized: boolean) {
      update((s) => (s.minimized === minimized ? s : { ...s, minimized }));
    },

    toggleMinimized() {
      update((s) => ({ ...s, minimized: !s.minimized }));
    },

    setSnapEdge(edge: SnapEdge | null) {
      if (edge !== null && !VALID_SNAP_EDGES.has(edge)) return;
      update((s) => (s.snapEdge === edge ? s : { ...s, snapEdge: edge }));
    },

    setRightBarHidden(hidden: boolean) {
      update((s) => (s.rightBarHidden === hidden ? s : { ...s, rightBarHidden: hidden }));
    },

    toggleRightBarHidden() {
      update((s) => ({ ...s, rightBarHidden: !s.rightBarHidden }));
    },

    setDetached(detached: boolean) {
      update((s) => (s.detached === detached ? s : { ...s, detached }));
    },

    /**
     * Apply a remote snapshot from the paired window. Only touches fields
     * that are meaningful to share across windows; window-local state like
     * `detached` and `floatingPos` is preserved so the two windows can
     * track their own chrome independently.
     */
    applyRemote(snapshot: Partial<SidebarState>) {
      update((s) => {
        const next: SidebarState = { ...s };
        if (snapshot.pinned !== undefined) next.pinned = snapshot.pinned;
        if (snapshot.activeTool !== undefined) next.activeTool = snapshot.activeTool;
        if (snapshot.toolStyles !== undefined) next.toolStyles = snapshot.toolStyles;
        if (snapshot.palettes !== undefined) next.palettes = snapshot.palettes;
        if (snapshot.activeColor !== undefined) next.activeColor = snapshot.activeColor;
        if (snapshot.laser !== undefined) next.laser = snapshot.laser;
        if (snapshot.tempInkFadeMs !== undefined) next.tempInkFadeMs = snapshot.tempInkFadeMs;
        if (snapshot.smoothingPen !== undefined && Number.isFinite(snapshot.smoothingPen)) {
          next.smoothingPen = clamp(snapshot.smoothingPen, 0, 100);
        }
        if (
          snapshot.smoothingHighlighter !== undefined &&
          Number.isFinite(snapshot.smoothingHighlighter)
        ) {
          next.smoothingHighlighter = clamp(snapshot.smoothingHighlighter, 0, 100);
        }
        if (snapshot.smoothingTempInk !== undefined && Number.isFinite(snapshot.smoothingTempInk)) {
          next.smoothingTempInk = clamp(snapshot.smoothingTempInk, 0, 100);
        }
        if (
          snapshot.straightEdgeSnapStep !== undefined &&
          Number.isFinite(snapshot.straightEdgeSnapStep)
        ) {
          next.straightEdgeSnapStep = clamp(
            snapshot.straightEdgeSnapStep,
            MIN_STRAIGHT_EDGE_SNAP_STEP,
            MAX_STRAIGHT_EDGE_SNAP_STEP,
          );
        }
        if (snapshot.presets !== undefined) next.presets = snapshot.presets;
        if (typeof snapshot.hidden === 'boolean') next.hidden = snapshot.hidden;
        if (typeof snapshot.minimized === 'boolean') next.minimized = snapshot.minimized;
        if (typeof snapshot.rightBarHidden === 'boolean') {
          next.rightBarHidden = snapshot.rightBarHidden;
        }
        if (snapshot.snapEdge === null) {
          next.snapEdge = null;
        } else if (
          typeof snapshot.snapEdge === 'string' &&
          VALID_SNAP_EDGES.has(snapshot.snapEdge as SnapEdge)
        ) {
          next.snapEdge = snapshot.snapEdge;
        }
        return next;
      });
    },

    setFloatingPos(pos: { x: number; y: number } | null) {
      if (pos && (!Number.isFinite(pos.x) || !Number.isFinite(pos.y))) return;
      update((s) => ({ ...s, floatingPos: pos }));
    },

    resetFloatingPos() {
      update((s) => ({ ...s, floatingPos: null }));
    },

    persistFloatingPos() {
      if (typeof localStorage === 'undefined') return;
      const pos = get(store).floatingPos;
      try {
        if (pos) localStorage.setItem(FLOATING_POS_STORAGE_KEY, JSON.stringify(pos));
        else localStorage.removeItem(FLOATING_POS_STORAGE_KEY);
      } catch {
        // storage full or unavailable; ignore
      }
    },

    setLaserRadius(radius: number) {
      const clamped = Math.min(MAX_LASER_RADIUS, Math.max(MIN_LASER_RADIUS, radius));
      update((s) => ({ ...s, laser: { ...s.laser, radius: clamped } }));
    },

    setTempInkFadeMs(ms: number) {
      update((s) => ({ ...s, tempInkFadeMs: clampFadeMs(ms) }));
    },

    setSmoothing(tool: SmoothingTool, value: number) {
      const clamped = clamp(value, 0, 100);
      update((s) => {
        if (tool === 'pen') return { ...s, smoothingPen: clamped };
        if (tool === 'highlighter') return { ...s, smoothingHighlighter: clamped };
        return { ...s, smoothingTempInk: clamped };
      });
    },

    setStraightEdgeSnapStep(value: number) {
      const clamped = clamp(value, MIN_STRAIGHT_EDGE_SNAP_STEP, MAX_STRAIGHT_EDGE_SNAP_STEP);
      update((s) =>
        s.straightEdgeSnapStep === clamped ? s : { ...s, straightEdgeSnapStep: clamped },
      );
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
const SMOOTHING_STORAGE_KEY = 'eldraw.smoothing.v1';
const LAYOUT_STORAGE_KEY = 'eldraw.sidebar-layout.v1';
const STRAIGHT_EDGE_STORAGE_KEY = 'eldraw.straight-edge.v1';

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

interface PersistedSmoothing {
  pen: number;
  highlighter: number;
  tempInk: number;
}

function loadPersistedSmoothing(): PersistedSmoothing | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SMOOTHING_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const p = parsed as Record<string, unknown>;
    const pen = typeof p.pen === 'number' ? p.pen : null;
    const highlighter = typeof p.highlighter === 'number' ? p.highlighter : null;
    const tempInk = typeof p.tempInk === 'number' ? p.tempInk : null;
    if (pen === null || highlighter === null || tempInk === null) return null;
    if (!Number.isFinite(pen) || !Number.isFinite(highlighter) || !Number.isFinite(tempInk)) {
      return null;
    }
    return {
      pen: clamp(pen, 0, 100),
      highlighter: clamp(highlighter, 0, 100),
      tempInk: clamp(tempInk, 0, 100),
    };
  } catch {
    return null;
  }
}

function loadPersistedStraightEdgeSnapStep(): number | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STRAIGHT_EDGE_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const p = parsed as Record<string, unknown>;
    if (typeof p.snapStepDeg !== 'number' || !Number.isFinite(p.snapStepDeg)) return null;
    return clamp(p.snapStepDeg, MIN_STRAIGHT_EDGE_SNAP_STEP, MAX_STRAIGHT_EDGE_SNAP_STEP);
  } catch {
    return null;
  }
}

let hydrated = false;
let hydrationUnsubscribe: (() => void) | null = null;

interface PersistedLayout {
  hidden: boolean;
  minimized: boolean;
  snapEdge: SnapEdge | null;
  rightBarHidden: boolean;
}

function loadPersistedLayout(): PersistedLayout | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const p = parsed as Record<string, unknown>;
    const hidden = typeof p.hidden === 'boolean' ? p.hidden : false;
    const minimized = typeof p.minimized === 'boolean' ? p.minimized : false;
    const rightBarHidden = typeof p.rightBarHidden === 'boolean' ? p.rightBarHidden : false;
    let snapEdge: SnapEdge | null = null;
    if (typeof p.snapEdge === 'string' && VALID_SNAP_EDGES.has(p.snapEdge as SnapEdge)) {
      snapEdge = p.snapEdge as SnapEdge;
    }
    return { hidden, minimized, snapEdge, rightBarHidden };
  } catch {
    return null;
  }
}

export function hydrateSidebarFromStorage(): () => void {
  if (hydrated) return hydrationUnsubscribe ?? (() => undefined);
  hydrated = true;

  const presets = loadPersistedPresets();
  if (presets && presets.length > 0) sidebar.setPresets(presets);

  const floatingPos = loadPersistedFloatingPos();
  if (floatingPos) sidebar.setFloatingPos(floatingPos);

  const smoothing = loadPersistedSmoothing();
  if (smoothing) {
    sidebar.setSmoothing('pen', smoothing.pen);
    sidebar.setSmoothing('highlighter', smoothing.highlighter);
    sidebar.setSmoothing('temp-ink', smoothing.tempInk);
  }

  const snapStep = loadPersistedStraightEdgeSnapStep();
  if (snapStep !== null) sidebar.setStraightEdgeSnapStep(snapStep);

  const layout = loadPersistedLayout();
  if (layout) {
    sidebar.setHidden(layout.hidden);
    sidebar.setMinimized(layout.minimized);
    sidebar.setSnapEdge(layout.snapEdge);
    sidebar.setRightBarHidden(layout.rightBarHidden);
  }

  if (typeof localStorage === 'undefined') {
    hydrationUnsubscribe = () => undefined;
    return hydrationUnsubscribe;
  }

  const unsubscribe = sidebar.subscribe((s) => {
    try {
      localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(s.presets));
      localStorage.setItem(
        SMOOTHING_STORAGE_KEY,
        JSON.stringify({
          pen: s.smoothingPen,
          highlighter: s.smoothingHighlighter,
          tempInk: s.smoothingTempInk,
        }),
      );
      localStorage.setItem(
        STRAIGHT_EDGE_STORAGE_KEY,
        JSON.stringify({ snapStepDeg: s.straightEdgeSnapStep }),
      );
      localStorage.setItem(
        LAYOUT_STORAGE_KEY,
        JSON.stringify({
          hidden: s.hidden,
          minimized: s.minimized,
          snapEdge: s.snapEdge,
          rightBarHidden: s.rightBarHidden,
        }),
      );
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

export type SyncableSidebarState = Pick<
  SidebarState,
  | 'pinned'
  | 'activeTool'
  | 'toolStyles'
  | 'palettes'
  | 'activeColor'
  | 'laser'
  | 'tempInkFadeMs'
  | 'smoothingPen'
  | 'smoothingHighlighter'
  | 'smoothingTempInk'
  | 'straightEdgeSnapStep'
  | 'presets'
  | 'hidden'
  | 'minimized'
  | 'snapEdge'
  | 'rightBarHidden'
>;

/**
 * Current migration version for sidebar state serialized into a portable
 * config export. Bump and append a step to `SIDEBAR_MIGRATIONS` when a
 * field's meaning changes in a way old exports need to be translated.
 */
export const SIDEBAR_SCHEMA_VERSION = 1;

type SidebarMigration = (state: Record<string, unknown>) => void;
const SIDEBAR_MIGRATIONS: SidebarMigration[] = [];

function isStrokeStyle(value: unknown): value is StrokeStyle {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.color === 'string' &&
    typeof s.width === 'number' &&
    Number.isFinite(s.width) &&
    typeof s.dash === 'string' &&
    VALID_DASH.has(s.dash as DashStyle) &&
    typeof s.opacity === 'number' &&
    Number.isFinite(s.opacity)
  );
}

function isColorPalette(value: unknown): value is ColorPalette {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  if (typeof p.id !== 'string' || typeof p.name !== 'string') return false;
  if (!Array.isArray(p.colors)) return false;
  return p.colors.every((c): c is string => typeof c === 'string');
}

function sanitizeImportedSidebar(raw: Record<string, unknown>): Partial<SyncableSidebarState> {
  const out: Partial<SyncableSidebarState> = {};
  if (typeof raw.pinned === 'boolean') out.pinned = raw.pinned;
  if (typeof raw.activeTool === 'string' && VALID_TOOLS.has(raw.activeTool as ToolKind)) {
    out.activeTool = raw.activeTool as ToolKind;
  }
  if (raw.toolStyles && typeof raw.toolStyles === 'object') {
    const ts = raw.toolStyles as Record<string, unknown>;
    if (isStrokeStyle(ts.pen) && isStrokeStyle(ts.highlighter) && isStrokeStyle(ts.line)) {
      out.toolStyles = {
        pen: {
          ...ts.pen,
          width: clamp(ts.pen.width, 0.25, 64),
          opacity: clamp(ts.pen.opacity, 0, 1),
        },
        highlighter: {
          ...ts.highlighter,
          width: clamp(ts.highlighter.width, 0.25, 64),
          opacity: clamp(ts.highlighter.opacity, 0, 1),
        },
        line: {
          ...ts.line,
          width: clamp(ts.line.width, 0.25, 64),
          opacity: clamp(ts.line.opacity, 0, 1),
        },
      };
    }
  }
  if (Array.isArray(raw.palettes) && raw.palettes.every(isColorPalette)) {
    out.palettes = raw.palettes.map((p) => ({ ...p, colors: [...p.colors] }));
  }
  if (typeof raw.activeColor === 'string') out.activeColor = raw.activeColor;
  if (raw.laser && typeof raw.laser === 'object') {
    const l = raw.laser as Record<string, unknown>;
    if (typeof l.color === 'string' && typeof l.radius === 'number' && Number.isFinite(l.radius)) {
      out.laser = { color: l.color, radius: clamp(l.radius, MIN_LASER_RADIUS, MAX_LASER_RADIUS) };
    }
  }
  if (typeof raw.tempInkFadeMs === 'number' && Number.isFinite(raw.tempInkFadeMs)) {
    out.tempInkFadeMs = clampFadeMs(raw.tempInkFadeMs);
  }
  if (typeof raw.smoothingPen === 'number' && Number.isFinite(raw.smoothingPen)) {
    out.smoothingPen = clamp(raw.smoothingPen, 0, 100);
  }
  if (typeof raw.smoothingHighlighter === 'number' && Number.isFinite(raw.smoothingHighlighter)) {
    out.smoothingHighlighter = clamp(raw.smoothingHighlighter, 0, 100);
  }
  if (typeof raw.smoothingTempInk === 'number' && Number.isFinite(raw.smoothingTempInk)) {
    out.smoothingTempInk = clamp(raw.smoothingTempInk, 0, 100);
  }
  if (typeof raw.straightEdgeSnapStep === 'number' && Number.isFinite(raw.straightEdgeSnapStep)) {
    out.straightEdgeSnapStep = clamp(
      raw.straightEdgeSnapStep,
      MIN_STRAIGHT_EDGE_SNAP_STEP,
      MAX_STRAIGHT_EDGE_SNAP_STEP,
    );
  }
  if (Array.isArray(raw.presets)) {
    out.presets = raw.presets.filter(isValidPreset).map(sanitizePreset).slice(0, MAX_PRESETS);
  }
  return out;
}

function runSidebarMigrations(state: Record<string, unknown>, fromVersion: number): void {
  const from = Number.isInteger(fromVersion) && fromVersion >= 0 ? fromVersion : 0;
  for (let v = from; v < SIDEBAR_SCHEMA_VERSION; v++) {
    SIDEBAR_MIGRATIONS[v]?.(state);
  }
}

export function pickSyncable(state: SidebarState): SyncableSidebarState {
  return {
    pinned: state.pinned,
    activeTool: state.activeTool,
    toolStyles: state.toolStyles,
    palettes: state.palettes,
    activeColor: state.activeColor,
    laser: state.laser,
    tempInkFadeMs: state.tempInkFadeMs,
    smoothingPen: state.smoothingPen,
    smoothingHighlighter: state.smoothingHighlighter,
    smoothingTempInk: state.smoothingTempInk,
    straightEdgeSnapStep: state.straightEdgeSnapStep,
    presets: state.presets,
    hidden: state.hidden,
    minimized: state.minimized,
    snapEdge: state.snapEdge,
    rightBarHidden: state.rightBarHidden,
  };
}

export function getPersistableSidebarPayload(): { version: number; state: SyncableSidebarState } {
  return { version: SIDEBAR_SCHEMA_VERSION, state: pickSyncable(get(sidebar)) };
}

/**
 * Apply a sidebar payload from a portable config file. Runs the migration
 * ladder against a mutable copy, then validates and merges field-by-field.
 * Unknown or invalid fields are dropped (existing live state is kept) so
 * older or tampered exports never leave the store in a broken state.
 */
export function applyImportedSidebarPayload(payload: { version?: unknown; state?: unknown }): void {
  const rawState =
    payload.state && typeof payload.state === 'object'
      ? { ...(payload.state as Record<string, unknown>) }
      : {};
  const version =
    typeof payload.version === 'number' && Number.isInteger(payload.version) && payload.version >= 0
      ? payload.version
      : 0;
  runSidebarMigrations(rawState, version);
  const sanitized = sanitizeImportedSidebar(rawState);
  sidebar.applyRemote(sanitized);
}

/**
 * Pure preview: run migrations + sanitize on a deep copy of the payload
 * without mutating live state. Returns the subset of fields the importer
 * would actually apply, so the caller can diff against the current state.
 */
export function previewImportedSidebarPayload(payload: {
  version?: unknown;
  state?: unknown;
}): Partial<SyncableSidebarState> {
  const rawState =
    payload.state && typeof payload.state === 'object'
      ? JSON.parse(JSON.stringify(payload.state))
      : {};
  const version =
    typeof payload.version === 'number' && Number.isInteger(payload.version) && payload.version >= 0
      ? payload.version
      : 0;
  runSidebarMigrations(rawState, version);
  return sanitizeImportedSidebar(rawState);
}

export function syncableEqual(a: SyncableSidebarState, b: SyncableSidebarState): boolean {
  return deepEqual(a, b);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return false;
  }
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (Array.isArray(b)) return false;
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bObj, key)) return false;
    if (!deepEqual(aObj[key], bObj[key])) return false;
  }
  return true;
}
