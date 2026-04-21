import { get, writable, type Readable } from 'svelte/store';

export interface PresenterState {
  /** In-window presenter mode (fallback when no second monitor). */
  active: boolean;
  /** Separate `WebviewWindow` is open. */
  windowOpen: boolean;
}

function createPresenter() {
  const store = writable<PresenterState>({ active: false, windowOpen: false });
  const { subscribe, update, set } = store;

  return {
    subscribe,

    isActive(): boolean {
      return get(store).active;
    },

    isWindowOpen(): boolean {
      return get(store).windowOpen;
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

    setWindowOpen(open: boolean): void {
      update((s) => (s.windowOpen === open ? s : { ...s, windowOpen: open }));
    },

    reset(): void {
      set({ active: false, windowOpen: false });
    },
  };
}

export const presenter = createPresenter();

export const presenterStore: Readable<PresenterState> = { subscribe: presenter.subscribe };
