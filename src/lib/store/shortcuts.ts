import { writable, type Readable } from 'svelte/store';
import { DEFAULT_BINDINGS, SHORTCUT_IDS, type ShortcutId } from '$lib/app/shortcutRegistry';

const STORAGE_KEY = 'eldraw.shortcuts.v1';

export type ShortcutBindings = Record<ShortcutId, string>;

function cloneDefaults(): ShortcutBindings {
  return { ...DEFAULT_BINDINGS };
}

function sanitize(raw: unknown): ShortcutBindings {
  const result = cloneDefaults();
  if (!raw || typeof raw !== 'object') return result;
  const record = raw as Record<string, unknown>;
  for (const id of SHORTCUT_IDS) {
    const v = record[id];
    if (typeof v === 'string' && v.length > 0) {
      result[id] = v;
    }
  }
  return result;
}

function readStorage(): ShortcutBindings {
  if (typeof localStorage === 'undefined') return cloneDefaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefaults();
    return sanitize(JSON.parse(raw));
  } catch {
    return cloneDefaults();
  }
}

function writeStorage(bindings: ShortcutBindings): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
  } catch {
    // Storage may be unavailable (private mode, quota). Non-fatal.
  }
}

function createShortcutsStore() {
  const store = writable<ShortcutBindings>(readStorage());
  const { subscribe, update, set } = store;

  function persist(next: ShortcutBindings): void {
    writeStorage(next);
  }

  return {
    subscribe,

    snapshot(): ShortcutBindings {
      let current: ShortcutBindings = cloneDefaults();
      subscribe((v) => (current = v))();
      return current;
    },

    setBinding(id: ShortcutId, spec: string): void {
      update((s) => {
        const next = { ...s, [id]: spec };
        persist(next);
        return next;
      });
    },

    resetBinding(id: ShortcutId): void {
      update((s) => {
        const next = { ...s, [id]: DEFAULT_BINDINGS[id] };
        persist(next);
        return next;
      });
    },

    resetAll(): void {
      const next = cloneDefaults();
      persist(next);
      set(next);
    },

    hydrate(): void {
      set(readStorage());
    },

    /** Test-only: drop persisted state and restore defaults in memory. */
    _reset(): void {
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          // ignore
        }
      }
      set(cloneDefaults());
    },
  };
}

export const shortcutsStore = createShortcutsStore();

export const shortcutBindings: Readable<ShortcutBindings> = {
  subscribe: shortcutsStore.subscribe,
};

export const SHORTCUTS_STORAGE_KEY = STORAGE_KEY;
