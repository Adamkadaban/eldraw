import { get, writable, type Readable } from 'svelte/store';

export interface ZenState {
  active: boolean;
}

export interface ZenFullscreenBridge {
  setFullscreen(on: boolean): void | Promise<void>;
}

let bridge: ZenFullscreenBridge | null = null;

/**
 * Inject the OS-level fullscreen bridge. The UI shell registers the real
 * Tauri bridge on mount; tests register mocks. Pass `null` to unregister.
 */
export function registerZenFullscreenBridge(b: ZenFullscreenBridge | null): void {
  bridge = b;
}

function pushFullscreen(on: boolean): void {
  if (!bridge) return;
  void Promise.resolve(bridge.setFullscreen(on)).catch(() => {});
}

function createZen() {
  const store = writable<ZenState>({ active: false });
  const { subscribe, update, set } = store;

  return {
    subscribe,

    isActive(): boolean {
      return get(store).active;
    },

    enter(): void {
      let changed = false;
      update((s) => {
        if (s.active) return s;
        changed = true;
        return { ...s, active: true };
      });
      if (changed) pushFullscreen(true);
    },

    exit(): void {
      let changed = false;
      update((s) => {
        if (!s.active) return s;
        changed = true;
        return { ...s, active: false };
      });
      if (changed) pushFullscreen(false);
    },

    toggle(): void {
      let next = false;
      update((s) => {
        next = !s.active;
        return { ...s, active: next };
      });
      pushFullscreen(next);
    },

    reset(): void {
      const wasActive = get(store).active;
      set({ active: false });
      if (wasActive) pushFullscreen(false);
    },
  };
}

export const zen = createZen();

export const zenStore: Readable<ZenState> = { subscribe: zen.subscribe };

export interface ChromeVisibility {
  topbar: boolean;
  sidebar: boolean;
  thumbnails: boolean;
}

/**
 * Decide which chrome sections render for the current view flags.
 * Zen mode hides everything except the canvas; presenter behaves the same.
 * A detached sidebar lives in its own window, so it never renders inline.
 */
export function chromeVisibility(flags: {
  zen: boolean;
  presenter: boolean;
  sidebarDetached: boolean;
  hasPages: boolean;
}): ChromeVisibility {
  const chromeHidden = flags.zen || flags.presenter;
  return {
    topbar: !chromeHidden,
    sidebar: !chromeHidden && !flags.sidebarDetached,
    thumbnails: !chromeHidden && flags.hasPages,
  };
}
