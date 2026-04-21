import { get, writable, type Readable } from 'svelte/store';

export interface ZenState {
  active: boolean;
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
      update((s) => (s.active ? s : { ...s, active: true }));
    },

    exit(): void {
      update((s) => (s.active ? { ...s, active: false } : s));
    },

    toggle(): void {
      update((s) => ({ ...s, active: !s.active }));
    },

    reset(): void {
      set({ active: false });
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
