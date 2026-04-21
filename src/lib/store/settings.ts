import { get, writable, type Readable } from 'svelte/store';

export type ReloadBehavior = 'keep' | 'discard';

export interface Settings {
  reloadBehavior: ReloadBehavior;
}

const DEFAULTS: Settings = { reloadBehavior: 'keep' };
const STORAGE_KEY = 'eldraw.settings.v1';

function loadPersisted(): Settings {
  if (typeof localStorage === 'undefined') return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULTS };
    const p = parsed as Record<string, unknown>;
    const reloadBehavior =
      p.reloadBehavior === 'keep' || p.reloadBehavior === 'discard'
        ? p.reloadBehavior
        : DEFAULTS.reloadBehavior;
    return { reloadBehavior };
  } catch {
    return { ...DEFAULTS };
  }
}

function persist(s: Settings): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // storage full or unavailable; ignore
  }
}

const internal = writable<Settings>(loadPersisted());

export const settings: Readable<Settings> & {
  setReloadBehavior: (b: ReloadBehavior) => void;
  snapshot: () => Settings;
  reset: () => void;
} = {
  subscribe: internal.subscribe,
  setReloadBehavior(b) {
    internal.update((s) => {
      const next = { ...s, reloadBehavior: b };
      persist(next);
      return next;
    });
  },
  snapshot() {
    return get(internal);
  },
  reset() {
    internal.set({ ...DEFAULTS });
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  },
};
