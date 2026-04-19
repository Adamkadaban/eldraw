import type { Action } from 'svelte/action';
import { get } from 'svelte/store';
import { sidebar } from '$lib/store/sidebar';
import { documentStore, currentDocument } from '$lib/store/document';
import { viewport } from '$lib/store/viewport';
import { isEditableTarget } from './shortcutParser';

/**
 * Global keyboard shortcuts for the app shell. Listeners are attached to
 * `window` so events fire regardless of focus, unless the target is a text
 * input. The action's host element is only used as the action's lifecycle
 * anchor.
 *
 * Space is tracked separately from the keydown routing to distinguish
 * hold-vs-tap for pan mode.
 */
export const shortcuts: Action<HTMLElement> = () => {
  let spaceHeld = false;

  function pickPaletteSlot(slot: number): void {
    const snap = sidebar.snapshot();
    const presets = snap.palettes.find((p) => p.id === 'presets');
    const color = presets?.colors[slot - 1];
    if (color) sidebar.setActiveColor(color);
  }

  function currentWidth(): number | null {
    const snap = sidebar.snapshot();
    const tool = snap.activeTool;
    if (tool === 'pen' || tool === 'highlighter' || tool === 'line') {
      return snap.toolStyles[tool].width;
    }
    return null;
  }

  function adjustWidth(delta: number): void {
    const w = currentWidth();
    if (w === null) return;
    const next = Math.max(1, Math.min(40, Math.round(w + delta)));
    sidebar.setWidth(next);
  }

  function currentPageCount(): number {
    const doc = get(currentDocument);
    return doc?.pages.length ?? 0;
  }

  function currentPage(): number {
    return viewport.snapshot().currentPageIndex;
  }

  function toggleFullscreen(): void {
    if (typeof document === 'undefined') return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen();
    }
  }

  function insertBlankAfterCurrent(): void {
    const doc = get(currentDocument);
    if (!doc) return;
    const idx = currentPage();
    const page = doc.pages[idx];
    if (!page) return;
    documentStore.insertBlankPageAfter(idx, page.width, page.height);
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (isEditableTarget(event.target)) return;

    const ctrlOrMeta = event.ctrlKey || event.metaKey;
    const key = event.key;

    if (ctrlOrMeta) {
      const lower = key.toLowerCase();
      if (lower === 'z' && event.shiftKey) {
        event.preventDefault();
        documentStore.redo(currentPage());
        return;
      }
      if (lower === 'z') {
        event.preventDefault();
        documentStore.undo(currentPage());
        return;
      }
      return;
    }

    if (event.shiftKey || event.altKey) return;

    switch (key) {
      case 'p':
      case 'P':
        sidebar.setTool('pen');
        return;
      case 'h':
      case 'H':
        sidebar.setTool('highlighter');
        return;
      case 'e':
      case 'E':
        sidebar.setTool('eraser');
        return;
      case 'l':
      case 'L':
        sidebar.setTool('line');
        return;
      case 'g':
      case 'G':
        sidebar.setTool('graph');
        return;
      case 'd':
      case 'D':
        sidebar.cycleDash();
        return;
      case 'b':
      case 'B':
        insertBlankAfterCurrent();
        return;
      case 'f':
      case 'F':
        toggleFullscreen();
        return;
      case 'Tab':
        event.preventDefault();
        sidebar.togglePin();
        return;
      case '[':
        adjustWidth(-1);
        return;
      case ']':
        adjustWidth(1);
        return;
      case 'ArrowLeft':
      case 'PageUp':
        event.preventDefault();
        viewport.prevPage();
        return;
      case 'ArrowRight':
      case 'PageDown':
        event.preventDefault();
        viewport.nextPage(currentPageCount());
        return;
      case ' ':
        if (!spaceHeld) {
          spaceHeld = true;
          viewport.setPanMode(true);
        }
        event.preventDefault();
        return;
      default:
        break;
    }

    if (key.length === 1 && key >= '1' && key <= '9') {
      pickPaletteSlot(Number(key));
    }
  }

  function handleKeyUp(event: KeyboardEvent): void {
    if (event.key === ' ') {
      spaceHeld = false;
      viewport.setPanMode(false);
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
  }

  return {
    destroy(): void {
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
      }
    },
  };
};
