import { derived, get, writable, type Readable } from 'svelte/store';
import type { ColorPalette, DashStyle, StrokeStyle, ToolKind } from '$lib/types';
import { clampFadeMs, DEFAULT_TEMP_INK_FADE_MS } from '$lib/tools/tempInk';

export type StyledTool = 'pen' | 'highlighter' | 'line';

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
  };
}

function isStyledTool(tool: ToolKind): tool is StyledTool {
  return tool === 'pen' || tool === 'highlighter' || tool === 'line';
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

  return {
    subscribe,
    set,
    reset: () => set(initialState()),

    setTool(tool: ToolKind) {
      update((s) => {
        if (s.activeTool === tool) return s;
        const next: SidebarState = { ...s, activeTool: tool };
        if (isStyledTool(tool)) {
          next.activeColor = s.toolStyles[tool].color;
        } else if (tool === 'laser') {
          next.activeColor = s.laser.color;
        }
        return next;
      });
    },

    setActiveColor(color: string) {
      update((s) => {
        const next: SidebarState = { ...s, activeColor: color };
        if (isStyledTool(s.activeTool)) {
          next.toolStyles = {
            ...s.toolStyles,
            [s.activeTool]: { ...s.toolStyles[s.activeTool], color },
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
        if (!isStyledTool(s.activeTool)) return s;
        return {
          ...s,
          toolStyles: {
            ...s.toolStyles,
            [s.activeTool]: { ...s.toolStyles[s.activeTool], width },
          },
        };
      });
    },

    setDash(dash: DashStyle) {
      update((s) => {
        if (!isStyledTool(s.activeTool)) return s;
        return {
          ...s,
          toolStyles: {
            ...s.toolStyles,
            [s.activeTool]: { ...s.toolStyles[s.activeTool], dash },
          },
        };
      });
    },

    cycleDash() {
      update((s) => {
        if (!isStyledTool(s.activeTool)) return s;
        const current = s.toolStyles[s.activeTool];
        return {
          ...s,
          toolStyles: {
            ...s.toolStyles,
            [s.activeTool]: { ...current, dash: nextDash(current.dash) },
          },
        };
      });
    },

    togglePin() {
      update((s) => ({ ...s, pinned: !s.pinned }));
    },

    setLaserRadius(radius: number) {
      const clamped = Math.min(MAX_LASER_RADIUS, Math.max(MIN_LASER_RADIUS, radius));
      update((s) => ({ ...s, laser: { ...s.laser, radius: clamped } }));
    },

    setTempInkFadeMs(ms: number) {
      update((s) => ({ ...s, tempInkFadeMs: clampFadeMs(ms) }));
    },

    snapshot(): SidebarState {
      return get(store);
    },
  };
}

export const sidebar = createSidebarStore();

export const currentStyle: Readable<StrokeStyle> = derived(sidebar, (s) => {
  const base = isStyledTool(s.activeTool)
    ? s.toolStyles[s.activeTool]
    : { color: s.activeColor, width: 2, dash: 'solid' as DashStyle, opacity: 1 };
  return { ...base, color: s.activeColor };
});
