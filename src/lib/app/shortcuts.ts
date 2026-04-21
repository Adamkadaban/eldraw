import type { Action } from 'svelte/action';
import { get } from 'svelte/store';
import { sidebar, styleKeyFor } from '$lib/store/sidebar';
import { documentStore, currentDocument } from '$lib/store/document';
import { viewport } from '$lib/store/viewport';
import { presenter } from '$lib/store/presenter';
import { zen } from '$lib/store/zen';
import { sampleCanvasBackground } from '$lib/canvas/bgSample';
import { isEditableTarget } from './shortcutParser';
import { isTextInput } from './focus';

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
    const key = styleKeyFor(snap.activeTool);
    return key ? snap.toolStyles[key].width : null;
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

  function sampleCurrentPageBackground(): string | undefined {
    if (typeof document === 'undefined') return undefined;
    const canvas = document.querySelector<HTMLCanvasElement>(
      '.pdf-slot canvas[aria-label="Rendered PDF page"]',
    );
    if (!canvas) return undefined;
    return sampleCanvasBackground(canvas) ?? undefined;
  }

  function insertBlankAfterCurrent(): void {
    const doc = get(currentDocument);
    if (!doc) return;
    const idx = currentPage();
    const page = doc.pages[idx];
    if (!page) return;
    const background = page.type === 'pdf' ? sampleCurrentPageBackground() : page.background;
    documentStore.insertBlankPageAfter(idx, page.width, page.height, background);
  }

  function handleKeyDown(event: KeyboardEvent): void {
    const ctrlOrMeta = event.ctrlKey || event.metaKey;
    const lower = event.key.toLowerCase();

    if (isTextInput(event.target)) {
      // Let the input handle typing; only surface document-editing shortcuts so
      // undo/redo remain reachable while a text field is focused.
      const editingShortcut = ctrlOrMeta && (lower === 'z' || lower === 'y');
      if (!editingShortcut) return;
    } else if (isEditableTarget(event.target)) {
      return;
    }

    const key = event.key;

    if (key === 'F5') {
      event.preventDefault();
      presenter.toggle();
      return;
    }

    if (key === 'Escape' && presenter.isActive()) {
      event.preventDefault();
      presenter.exit();
      return;
    }

    if (key === 'Escape' && zen.isActive()) {
      event.preventDefault();
      zen.exit();
      return;
    }

    if (
      event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      (key === 'Z' || key === 'z')
    ) {
      event.preventDefault();
      zen.toggle();
      return;
    }

    if (ctrlOrMeta) {
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
      if (!event.shiftKey && !event.altKey && key >= '1' && key <= '9') {
        event.preventDefault();
        sidebar.applyPresetSlot(Number(key));
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
      case 'r':
      case 'R':
        sidebar.setTool('rect');
        return;
      case 'o':
      case 'O':
        sidebar.setTool('ellipse');
        return;
      case 'n':
      case 'N':
        sidebar.setTool('numberline');
        return;
      case 'g':
      case 'G':
        sidebar.setTool('graph');
        return;
      case 't':
      case 'T':
        sidebar.setTool('text');
        return;
      case 'x':
      case 'X':
        sidebar.setTool('laser');
        return;
      case 'y':
      case 'Y':
        sidebar.setTool('temp-ink');
        return;
      case 'a':
      case 'A':
        sidebar.setTool('protractor');
        return;
      case 'u':
      case 'U':
        sidebar.setTool('ruler');
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
