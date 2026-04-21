import type { ToolKind } from '$lib/types';
import { sidebar } from '$lib/store/sidebar';
import { documentStore } from '$lib/store/document';
import { viewport } from '$lib/store/viewport';
import { presenter } from '$lib/store/presenter';
import { zen } from '$lib/store/zen';
import {
  currentPage,
  currentPageCount,
  insertBlankAfterCurrent,
  toggleFullscreen,
} from '$lib/app/actions';

export interface Command {
  id: string;
  title: string;
  shortcut?: string;
  run: () => void;
}

function toolCommand(id: string, title: string, tool: ToolKind, shortcut?: string): Command {
  return { id, title, shortcut, run: () => sidebar.setTool(tool) };
}

export function getCommands(): Command[] {
  return [
    toolCommand('tool.pen', 'Pen', 'pen', 'P'),
    toolCommand('tool.highlighter', 'Highlighter', 'highlighter', 'H'),
    toolCommand('tool.eraser', 'Eraser', 'eraser', 'E'),
    toolCommand('tool.line', 'Line', 'line', 'L'),
    toolCommand('tool.text', 'Text', 'text', 'T'),
    toolCommand('tool.rect', 'Rectangle', 'rect', 'R'),
    toolCommand('tool.ellipse', 'Ellipse', 'ellipse', 'O'),
    toolCommand('tool.numberline', 'Number line', 'numberline', 'N'),
    toolCommand('tool.graph', 'Graph', 'graph', 'G'),
    toolCommand('tool.protractor', 'Protractor', 'protractor', 'A'),
    toolCommand('tool.ruler', 'Ruler', 'ruler', 'U'),
    toolCommand('tool.laser', 'Laser pointer', 'laser', 'X'),
    toolCommand('tool.temp-ink', 'Temporary ink', 'temp-ink', 'Y'),
    {
      id: 'edit.undo',
      title: 'Undo',
      shortcut: 'Ctrl+Z',
      run: () => documentStore.undo(currentPage()),
    },
    {
      id: 'edit.redo',
      title: 'Redo',
      shortcut: 'Ctrl+Shift+Z',
      run: () => documentStore.redo(currentPage()),
    },
    {
      id: 'view.toggle-pin',
      title: 'Toggle sidebar pin',
      shortcut: 'Tab',
      run: () => sidebar.togglePin(),
    },
    {
      id: 'view.toggle-zen',
      title: 'Toggle zen mode',
      shortcut: 'Shift+Z',
      run: () => zen.toggle(),
    },
    {
      id: 'view.toggle-fullscreen',
      title: 'Toggle fullscreen',
      shortcut: 'F',
      run: toggleFullscreen,
    },
    {
      id: 'presenter.toggle',
      title: 'Toggle presenter view',
      shortcut: 'F5',
      run: () => presenter.toggle(),
    },
    {
      id: 'presenter.exit',
      title: 'Exit presenter view',
      run: () => presenter.exit(),
    },
    {
      id: 'page.next',
      title: 'Next page',
      shortcut: '→',
      run: () => viewport.nextPage(currentPageCount()),
    },
    {
      id: 'page.prev',
      title: 'Previous page',
      shortcut: '←',
      run: () => viewport.prevPage(),
    },
    {
      id: 'page.blank',
      title: 'Insert blank page after current',
      shortcut: 'B',
      run: insertBlankAfterCurrent,
    },
    {
      id: 'style.cycle-dash',
      title: 'Cycle dash style',
      shortcut: 'D',
      run: () => sidebar.cycleDash(),
    },
  ];
}
