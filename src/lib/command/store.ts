import { get, writable, type Readable } from 'svelte/store';

export interface CommandPaletteState {
  open: boolean;
}

function createCommandPalette() {
  const store = writable<CommandPaletteState>({ open: false });
  const { subscribe, set, update } = store;

  return {
    subscribe,

    isOpen(): boolean {
      return get(store).open;
    },

    open(): void {
      update((s) => (s.open ? s : { ...s, open: true }));
    },

    close(): void {
      update((s) => (s.open ? { ...s, open: false } : s));
    },

    toggle(): void {
      update((s) => ({ ...s, open: !s.open }));
    },

    reset(): void {
      set({ open: false });
    },
  };
}

export const commandPalette = createCommandPalette();

export const commandPaletteStore: Readable<CommandPaletteState> = {
  subscribe: commandPalette.subscribe,
};

export function openCommandPalette(): void {
  commandPalette.open();
}

export function closeCommandPalette(): void {
  commandPalette.close();
}
