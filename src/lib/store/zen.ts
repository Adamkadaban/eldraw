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
      update((s) => (s.active ? s : { active: true }));
    },

    exit(): void {
      update((s) => (s.active ? { active: false } : s));
    },

    toggle(): void {
      update((s) => ({ active: !s.active }));
    },

    reset(): void {
      set({ active: false });
    },
  };
}

export const zen = createZen();

export const zenStore: Readable<ZenState> = { subscribe: zen.subscribe };
