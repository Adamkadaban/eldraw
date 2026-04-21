import type { ToolKind } from '$lib/types';
import { sidebar } from '$lib/store/sidebar';
import { documentStore } from '$lib/store/document';
import { viewport } from '$lib/store/viewport';
import { presenter } from '$lib/store/presenter';
import { zen } from '$lib/store/zen';
import { closePresenterWindow, listMonitors, openPresenterWindow } from '$lib/ipc/presenter';
import { warn } from '$lib/log';
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

/**
 * Enumerate monitors and let the user pick one via `window.prompt`. Falls
 * back to the first non-primary monitor (or the primary if only one exists)
 * when running non-interactively. The command-palette UI is minimal; a
 * proper monitor picker lives behind the sidebar "Open presenter…" button.
 */
async function promptAndOpenPresenterWindow(): Promise<void> {
  try {
    const monitors = await listMonitors();
    if (monitors.length === 0) {
      await openPresenterWindow(null);
      presenter.setWindowOpen(true);
      return;
    }
    if (monitors.length === 1 || typeof window === 'undefined') {
      const external = monitors.find((m) => !m.isPrimary);
      await openPresenterWindow(external?.index ?? monitors[0].index);
      presenter.setWindowOpen(true);
      return;
    }
    const lines = monitors.map(
      (m) =>
        `${m.index}: ${m.name ?? 'display'} ${m.width}x${m.height}${m.isPrimary ? ' (primary)' : ''}`,
    );
    const defaultIndex = monitors.find((m) => !m.isPrimary)?.index ?? monitors[0].index;
    const raw = window.prompt(
      `Open presenter on monitor:\n${lines.join('\n')}`,
      String(defaultIndex),
    );
    if (raw === null) return;
    const parsed = Number.parseInt(raw.trim(), 10);
    const idx = Number.isFinite(parsed) ? parsed : defaultIndex;
    await openPresenterWindow(idx);
    presenter.setWindowOpen(true);
  } catch (err) {
    warn('ipc', 'open_presenter_window', err);
  }
}

async function closePresenter(): Promise<void> {
  try {
    await closePresenterWindow();
  } catch (err) {
    warn('ipc', 'close_presenter_window', err);
  } finally {
    presenter.setWindowOpen(false);
  }
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
      id: 'presenter.openWindow',
      title: 'Open presenter on another monitor…',
      run: () => void promptAndOpenPresenterWindow(),
    },
    {
      id: 'presenter.closeWindow',
      title: 'Close presenter window',
      run: () => void closePresenter(),
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
