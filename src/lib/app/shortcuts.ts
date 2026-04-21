import type { Action } from 'svelte/action';
import { viewport } from '$lib/store/viewport';
import { presenter } from '$lib/store/presenter';
import { zen } from '$lib/store/zen';
import { isEditableTarget, matchesEvent, parseShortcut } from './shortcutParser';
import type { ParsedKey } from './shortcutParser';
import { isTextInput } from './focus';
import { SHORTCUT_COMMANDS, type ShortcutCommand } from './shortcutRegistry';
import { shortcutsStore } from '$lib/store/shortcuts';

/**
 * Global keyboard shortcuts for the app shell. Bindings come from the
 * customizable shortcuts store; a few stateful keys (Space hold for pan,
 * Escape exits) stay hard-coded because they do not map cleanly to a single
 * keydown action.
 */
export const shortcuts: Action<HTMLElement> = () => {
  let spaceHeld = false;

  interface Resolved {
    parsed: ParsedKey;
    command: ShortcutCommand;
  }

  let resolved: Resolved[] = [];

  function rebuild(): void {
    const bindings = shortcutsStore.snapshot();
    const next: Resolved[] = [];
    for (const command of SHORTCUT_COMMANDS) {
      const spec = bindings[command.id];
      if (!spec) continue;
      try {
        next.push({ parsed: parseShortcut(spec), command });
      } catch {
        // Ignore malformed bindings; the user can re-record them.
      }
    }
    resolved = next;
  }

  rebuild();
  const unsubscribe = shortcutsStore.subscribe(() => rebuild());

  function handleKeyDown(event: KeyboardEvent): void {
    if (isTextInput(event.target)) {
      // Native text-editing shortcuts (including Ctrl/Cmd+Z/Y) must reach the
      // input. Document-level actions are intentionally off while a real
      // text field is focused; the user can blur it and press again.
      return;
    }
    if (isEditableTarget(event.target)) return;

    if (event.key === 'Escape') {
      if (presenter.isActive()) {
        event.preventDefault();
        presenter.exit();
        return;
      }
      if (zen.isActive()) {
        event.preventDefault();
        zen.exit();
        return;
      }
    }

    if (event.key === ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (!spaceHeld) {
        spaceHeld = true;
        viewport.setPanMode(true);
      }
      event.preventDefault();
      return;
    }

    for (const { parsed, command } of resolved) {
      if (matchesEvent(parsed, event)) {
        if (command.preventDefault) event.preventDefault();
        command.run();
        return;
      }
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
      unsubscribe();
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
      }
    },
  };
};
