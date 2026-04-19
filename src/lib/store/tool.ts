import { writable, get, type Readable } from 'svelte/store';
import type { DashStyle, StrokeStyle, ToolKind } from '$lib/types';

export type StrokeTool = 'pen' | 'highlighter';

export interface ToolState {
  tool: ToolKind;
  style: StrokeStyle;
}

const DEFAULT_STYLES: Record<StrokeTool, StrokeStyle> = {
  pen: { color: '#000000', width: 2, dash: 'solid', opacity: 1 },
  highlighter: { color: '#ffeb3b', width: 14, dash: 'solid', opacity: 0.3 },
};

const perToolStyle: Record<StrokeTool, StrokeStyle> = {
  pen: { ...DEFAULT_STYLES.pen },
  highlighter: { ...DEFAULT_STYLES.highlighter },
};

const HIGHLIGHTER_MAX_OPACITY = 0.3;

function clampStyle(tool: ToolKind, style: StrokeStyle): StrokeStyle {
  if (tool === 'highlighter' && style.opacity > HIGHLIGHTER_MAX_OPACITY) {
    return { ...style, opacity: HIGHLIGHTER_MAX_OPACITY };
  }
  return style;
}

function initialState(): ToolState {
  return { tool: 'pen', style: { ...perToolStyle.pen } };
}

function isStrokeTool(tool: ToolKind): tool is StrokeTool {
  return tool === 'pen' || tool === 'highlighter';
}

const store = writable<ToolState>(initialState());

export const toolStore: Readable<ToolState> = { subscribe: store.subscribe };

export function setTool(tool: ToolKind): void {
  store.update((s) => {
    if (isStrokeTool(s.tool)) {
      perToolStyle[s.tool] = { ...s.style };
    }
    const style = isStrokeTool(tool) ? clampStyle(tool, { ...perToolStyle[tool] }) : s.style;
    return { tool, style };
  });
}

export function setStyle(patch: Partial<StrokeStyle>): void {
  store.update((s) => {
    const style = clampStyle(s.tool, { ...s.style, ...patch });
    if (isStrokeTool(s.tool)) {
      perToolStyle[s.tool] = { ...style };
    }
    return { ...s, style };
  });
}

export function setColor(color: string): void {
  setStyle({ color });
}

export function setWidth(width: number): void {
  setStyle({ width });
}

export function setDash(dash: DashStyle): void {
  setStyle({ dash });
}

export function setOpacity(opacity: number): void {
  setStyle({ opacity });
}

export function getToolState(): ToolState {
  return get(store);
}

export function resetToolStoreForTests(): void {
  perToolStyle.pen = { ...DEFAULT_STYLES.pen };
  perToolStyle.highlighter = { ...DEFAULT_STYLES.highlighter };
  store.set(initialState());
}
