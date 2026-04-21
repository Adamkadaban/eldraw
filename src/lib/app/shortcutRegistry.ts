import { sidebar, styleKeyFor } from '$lib/store/sidebar';
import { documentStore } from '$lib/store/document';
import { viewport } from '$lib/store/viewport';
import { zen } from '$lib/store/zen';
import { commandPalette } from '$lib/command/store';
import {
  currentPage,
  currentPageCount,
  insertBlankAfterCurrent,
  toggleFullscreen,
} from './actions';

export type ShortcutId =
  | 'tool.pen'
  | 'tool.highlighter'
  | 'tool.eraser'
  | 'tool.select'
  | 'tool.line'
  | 'tool.rect'
  | 'tool.ellipse'
  | 'tool.numberline'
  | 'tool.graph'
  | 'tool.text'
  | 'tool.laser'
  | 'tool.tempInk'
  | 'tool.protractor'
  | 'tool.ruler'
  | 'style.cycleDash'
  | 'style.widthDecrease'
  | 'style.widthIncrease'
  | 'page.insertBlank'
  | 'page.prev'
  | 'page.next'
  | 'view.toggleFullscreen'
  | 'view.toggleZen'
  | 'view.toggleZenAlt'
  | 'sidebar.togglePin'
  | 'sidebar.toggleHide'
  | 'sidebar.toggleMinimize'
  | 'rightBar.toggleHide'
  | 'commandPalette.open'
  | 'edit.undo'
  | 'edit.redo'
  | 'preset.1'
  | 'preset.2'
  | 'preset.3'
  | 'preset.4'
  | 'preset.5'
  | 'preset.6'
  | 'preset.7'
  | 'preset.8'
  | 'preset.9'
  | 'palette.1'
  | 'palette.2'
  | 'palette.3'
  | 'palette.4'
  | 'palette.5'
  | 'palette.6'
  | 'palette.7'
  | 'palette.8'
  | 'palette.9';

export interface ShortcutCommand {
  id: ShortcutId;
  label: string;
  defaultSpec: string;
  run: () => void;
  preventDefault?: boolean;
}

function currentWidth(): number | null {
  const snap = sidebar.snapshot();
  const key = styleKeyFor(snap.activeTool);
  return key ? snap.toolStyles[key].width : null;
}

function adjustWidth(delta: number): void {
  const w = currentWidth();
  if (w === null) return;
  const next = Math.max(1, Math.min(40, Math.round(w + delta)));
  sidebar.setWidth(next);
}

function pickPaletteSlot(slot: number): void {
  const snap = sidebar.snapshot();
  const presets = snap.palettes.find((p) => p.id === 'presets');
  const color = presets?.colors[slot - 1];
  if (color) sidebar.setActiveColor(color);
}

const TOOL_COMMANDS: Array<{ id: ShortcutId; label: string; spec: string; tool: string }> = [
  { id: 'tool.pen', label: 'Tool: Pen', spec: 'p', tool: 'pen' },
  { id: 'tool.highlighter', label: 'Tool: Highlighter', spec: 'h', tool: 'highlighter' },
  { id: 'tool.eraser', label: 'Tool: Eraser', spec: 'e', tool: 'eraser' },
  { id: 'tool.select', label: 'Tool: Select', spec: 's', tool: 'select' },
  { id: 'tool.line', label: 'Tool: Line', spec: 'l', tool: 'line' },
  { id: 'tool.rect', label: 'Tool: Rectangle', spec: 'r', tool: 'rect' },
  { id: 'tool.ellipse', label: 'Tool: Ellipse', spec: 'o', tool: 'ellipse' },
  { id: 'tool.numberline', label: 'Tool: Number line', spec: 'n', tool: 'numberline' },
  { id: 'tool.graph', label: 'Tool: Graph', spec: 'g', tool: 'graph' },
  { id: 'tool.text', label: 'Tool: Text', spec: 't', tool: 'text' },
  { id: 'tool.laser', label: 'Tool: Laser', spec: 'x', tool: 'laser' },
  { id: 'tool.tempInk', label: 'Tool: Temp Ink', spec: 'y', tool: 'temp-ink' },
  { id: 'tool.protractor', label: 'Tool: Protractor', spec: 'a', tool: 'protractor' },
  { id: 'tool.ruler', label: 'Tool: Ruler', spec: 'u', tool: 'ruler' },
];

function buildCommands(): ShortcutCommand[] {
  const list: ShortcutCommand[] = TOOL_COMMANDS.map(({ id, label, spec, tool }) => ({
    id,
    label,
    defaultSpec: spec,
    run: () => sidebar.setTool(tool as Parameters<typeof sidebar.setTool>[0]),
  }));

  list.push(
    {
      id: 'style.cycleDash',
      label: 'Cycle dash style',
      defaultSpec: 'd',
      run: () => sidebar.cycleDash(),
    },
    {
      id: 'style.widthDecrease',
      label: 'Decrease stroke width',
      defaultSpec: '[',
      run: () => adjustWidth(-1),
    },
    {
      id: 'style.widthIncrease',
      label: 'Increase stroke width',
      defaultSpec: ']',
      run: () => adjustWidth(1),
    },
    {
      id: 'page.insertBlank',
      label: 'Insert blank page after current',
      defaultSpec: 'b',
      run: () => insertBlankAfterCurrent(),
    },
    {
      id: 'page.prev',
      label: 'Previous page',
      defaultSpec: 'ArrowLeft',
      run: () => viewport.prevPage(),
      preventDefault: true,
    },
    {
      id: 'page.next',
      label: 'Next page',
      defaultSpec: 'ArrowRight',
      run: () => viewport.nextPage(currentPageCount()),
      preventDefault: true,
    },
    {
      id: 'view.toggleFullscreen',
      label: 'Toggle fullscreen',
      defaultSpec: 'f',
      run: () => toggleFullscreen(),
    },
    {
      id: 'view.toggleZen',
      label: 'Toggle zen mode',
      defaultSpec: 'F5',
      run: () => zen.toggle(),
      preventDefault: true,
    },
    {
      id: 'view.toggleZenAlt',
      label: 'Toggle zen mode (secondary)',
      defaultSpec: 'Shift+Z',
      run: () => zen.toggle(),
      preventDefault: true,
    },
    {
      id: 'sidebar.togglePin',
      label: 'Toggle sidebar pin',
      defaultSpec: 'Tab',
      run: () => sidebar.togglePin(),
      preventDefault: true,
    },
    {
      id: 'sidebar.toggleHide',
      label: 'Hide / show sidebar',
      defaultSpec: 'Shift+H',
      run: () => sidebar.toggleHidden(),
      preventDefault: true,
    },
    {
      id: 'sidebar.toggleMinimize',
      label: 'Minimize / expand sidebar',
      defaultSpec: 'Shift+M',
      run: () => sidebar.toggleMinimized(),
      preventDefault: true,
    },
    {
      id: 'rightBar.toggleHide',
      label: 'Hide / show thumbnail strip',
      defaultSpec: 'Shift+T',
      run: () => sidebar.toggleRightBarHidden(),
      preventDefault: true,
    },
    {
      id: 'commandPalette.open',
      label: 'Open command palette',
      defaultSpec: 'Mod+P',
      run: () => commandPalette.toggle(),
      preventDefault: true,
    },
    {
      id: 'edit.undo',
      label: 'Undo',
      defaultSpec: 'Mod+Z',
      run: () => documentStore.undo(currentPage()),
      preventDefault: true,
    },
    {
      id: 'edit.redo',
      label: 'Redo',
      defaultSpec: 'Mod+Shift+Z',
      run: () => documentStore.redo(currentPage()),
      preventDefault: true,
    },
  );

  for (let n = 1; n <= 9; n++) {
    list.push({
      id: `preset.${n}` as ShortcutId,
      label: `Apply preset ${n}`,
      defaultSpec: `${n}`,
      run: () => sidebar.applyPresetSlot(n),
      preventDefault: true,
    });
  }

  for (let n = 1; n <= 9; n++) {
    list.push({
      id: `palette.${n}` as ShortcutId,
      label: `Pick palette color ${n}`,
      defaultSpec: `Mod+${n}`,
      run: () => pickPaletteSlot(n),
    });
  }

  return list;
}

export const SHORTCUT_COMMANDS: ShortcutCommand[] = buildCommands();

export const DEFAULT_BINDINGS: Record<ShortcutId, string> = Object.fromEntries(
  SHORTCUT_COMMANDS.map((c) => [c.id, c.defaultSpec]),
) as Record<ShortcutId, string>;

export const SHORTCUT_IDS: ShortcutId[] = SHORTCUT_COMMANDS.map((c) => c.id);

export function commandFor(id: ShortcutId): ShortcutCommand | undefined {
  return SHORTCUT_COMMANDS.find((c) => c.id === id);
}
