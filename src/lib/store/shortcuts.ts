import { writable, type Readable } from 'svelte/store';
import { DEFAULT_BINDINGS, SHORTCUT_IDS, type ShortcutId } from '$lib/app/shortcutRegistry';

const STORAGE_KEY = 'eldraw.shortcuts.v1';

/**
 * Current migration version for the persisted bindings payload.
 * Bump this and append a step to `MIGRATIONS` when changing a default that
 * users may already have stored as their "accepted" binding.
 *
 * Legacy (unversioned) payloads are treated as version 0.
 */
export const SHORTCUTS_SCHEMA_VERSION = 1;

export type ShortcutBindings = Record<ShortcutId, string>;

interface StoredPayload {
  version: number;
  bindings: Partial<Record<ShortcutId, string>>;
}

type Migration = (bindings: Partial<Record<ShortcutId, string>>) => void;

/**
 * Ordered migration steps indexed by the version they produce.
 * Step at index i migrates from version i to version i+1.
 *
 * v0 → v1: command palette default moved from Mod+K to Mod+P (#89). Users
 * whose stored binding still matches the old default are bumped; custom
 * bindings are left alone.
 */
const MIGRATIONS: Migration[] = [
  (bindings) => {
    if (bindings['commandPalette.open'] === 'Mod+K') {
      bindings['commandPalette.open'] = 'Mod+P';
    }
  },
];

function cloneDefaults(): ShortcutBindings {
  return { ...DEFAULT_BINDINGS };
}

function hasWrapperShape(
  raw: unknown,
): raw is { version: unknown; bindings: Record<string, unknown> } {
  if (!raw || typeof raw !== 'object') return false;
  const obj = raw as Record<string, unknown>;
  return 'version' in obj && typeof obj.bindings === 'object' && obj.bindings !== null;
}

function isValidVersion(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function extractStoredBindings(raw: unknown): {
  version: number;
  bindings: Partial<Record<ShortcutId, string>>;
} {
  if (hasWrapperShape(raw)) {
    // Corrupt/invalid versions (fractional, negative, NaN, non-numeric) are
    // treated as legacy v0 so all migrations re-run against the bindings.
    const version = isValidVersion(raw.version) ? raw.version : 0;
    return {
      version,
      bindings: { ...(raw.bindings as Partial<Record<ShortcutId, string>>) },
    };
  }
  if (raw && typeof raw === 'object') {
    return { version: 0, bindings: { ...(raw as Partial<Record<ShortcutId, string>>) } };
  }
  return { version: SHORTCUTS_SCHEMA_VERSION, bindings: {} };
}

function runMigrations(bindings: Partial<Record<ShortcutId, string>>, fromVersion: number): void {
  for (let v = Math.max(0, fromVersion); v < SHORTCUTS_SCHEMA_VERSION; v++) {
    MIGRATIONS[v]?.(bindings);
  }
}

function sanitize(raw: unknown): ShortcutBindings {
  const result = cloneDefaults();
  const { version, bindings } = extractStoredBindings(raw);
  runMigrations(bindings, version);
  for (const id of SHORTCUT_IDS) {
    const v = bindings[id];
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
    const payload: StoredPayload = {
      version: SHORTCUTS_SCHEMA_VERSION,
      bindings: { ...bindings },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
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
