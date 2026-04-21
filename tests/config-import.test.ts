import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyConfig,
  clearBackup,
  diffConfig,
  hasBackup,
  parseConfig,
  restorePreviousConfig,
} from '../src/lib/config/import';
import { buildConfigExport, serializeConfig } from '../src/lib/config/export';
import { CONFIG_SCHEMA_VERSION, type ConfigExport } from '../src/lib/config/schema';
import { shortcutsStore } from '../src/lib/store/shortcuts';
import { sidebar } from '../src/lib/store/sidebar';
import { DEFAULT_BINDINGS } from '../src/lib/app/shortcutRegistry';

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.has(k) ? (this.map.get(k) as string) : null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, String(v));
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  clear(): void {
    this.map.clear();
  }
  key(i: number): string | null {
    return Array.from(this.map.keys())[i] ?? null;
  }
  get length(): number {
    return this.map.size;
  }
}

const memory = new MemoryStorage();
Object.defineProperty(globalThis, 'localStorage', {
  value: memory,
  writable: true,
  configurable: true,
});

beforeEach(() => {
  memory.clear();
  shortcutsStore._reset();
  sidebar.reset();
  clearBackup();
});

describe('config import: parse', () => {
  it('accepts a valid v1 config and applies it', () => {
    const cfg: ConfigExport = {
      eldraw: 'config',
      version: 1,
      exportedAt: '2026-04-21T00:00:00.000Z',
      exportedBy: 'eldraw-test',
      sections: {
        shortcuts: {
          kind: 'shortcuts',
          version: 1,
          bindings: { 'tool.pen': 'Shift+P' },
        },
        sidebar: {
          kind: 'sidebar',
          version: 1,
          state: { smoothingPen: 30 },
        },
      },
    };
    const res = parseConfig(JSON.stringify(cfg));
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    applyConfig(res.value);

    expect(shortcutsStore.snapshot()['tool.pen']).toBe('Shift+P');
    expect(sidebar.snapshot().smoothingPen).toBe(30);
  });

  it('rejects an unknown future schema version with a clear error', () => {
    const cfg = {
      eldraw: 'config',
      version: CONFIG_SCHEMA_VERSION + 1,
      exportedAt: '',
      exportedBy: '',
      sections: {},
    };
    const res = parseConfig(JSON.stringify(cfg));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('unsupported-version');
    expect(res.error.message).toMatch(/newer eldraw/i);
  });

  it('rejects malformed JSON without touching live state', () => {
    shortcutsStore.setBinding('tool.pen', 'Shift+P');
    const before = shortcutsStore.snapshot()['tool.pen'];

    const res = parseConfig('{ not json');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('invalid-json');

    expect(shortcutsStore.snapshot()['tool.pen']).toBe(before);
  });

  it('rejects payload missing the eldraw sentinel', () => {
    const cfg = { version: 1, sections: {} };
    const res = parseConfig(JSON.stringify(cfg));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('not-config');
  });

  it('rejects tampered payload where eldraw !== "config"', () => {
    const cfg = {
      eldraw: 'something-else',
      version: 1,
      sections: {},
    };
    const res = parseConfig(JSON.stringify(cfg));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.kind).toBe('not-config');
  });
});

describe('config import: migrations', () => {
  it('runs the shortcuts migration ladder on older-version payloads', () => {
    // A v0 export carrying the legacy Mod+K default must be migrated to Mod+P
    // (see SHORTCUTS_MIGRATIONS in shortcuts.ts).
    const cfg: ConfigExport = {
      eldraw: 'config',
      version: 1,
      exportedAt: '',
      exportedBy: '',
      sections: {
        shortcuts: {
          kind: 'shortcuts',
          version: 0,
          bindings: { 'commandPalette.open': 'Mod+K', 'tool.pen': 'Shift+P' },
        },
      },
    };
    applyConfig(cfg);
    const snap = shortcutsStore.snapshot();
    expect(snap['commandPalette.open']).toBe('Mod+P');
    expect(snap['tool.pen']).toBe('Shift+P');
  });

  it('preserves custom (non-default) shortcut bindings during import', () => {
    const cfg: ConfigExport = {
      eldraw: 'config',
      version: 1,
      exportedAt: '',
      exportedBy: '',
      sections: {
        shortcuts: {
          kind: 'shortcuts',
          version: 1,
          bindings: { 'commandPalette.open': 'Mod+Shift+K' },
        },
      },
    };
    applyConfig(cfg);
    expect(shortcutsStore.snapshot()['commandPalette.open']).toBe('Mod+Shift+K');
  });
});

describe('config import: backup + restore', () => {
  it('round-trips backup → restorePreviousConfig', () => {
    shortcutsStore.setBinding('tool.pen', 'Shift+P');
    sidebar.setSmoothing('pen', 40);

    const incoming: ConfigExport = {
      eldraw: 'config',
      version: 1,
      exportedAt: '',
      exportedBy: '',
      sections: {
        shortcuts: {
          kind: 'shortcuts',
          version: 1,
          bindings: { 'tool.pen': 'Alt+P' },
        },
        sidebar: { kind: 'sidebar', version: 1, state: { smoothingPen: 10 } },
      },
    };

    applyConfig(incoming);
    expect(shortcutsStore.snapshot()['tool.pen']).toBe('Alt+P');
    expect(sidebar.snapshot().smoothingPen).toBe(10);
    expect(hasBackup()).toBe(true);

    const ok = restorePreviousConfig();
    expect(ok).toBe(true);
    expect(shortcutsStore.snapshot()['tool.pen']).toBe('Shift+P');
    expect(sidebar.snapshot().smoothingPen).toBe(40);
  });

  it('restorePreviousConfig returns false when no backup exists', () => {
    expect(restorePreviousConfig()).toBe(false);
  });
});

describe('config diff', () => {
  it('summarizes shortcut changes', () => {
    const current = buildConfigExport();
    const incoming = buildConfigExport();
    incoming.sections.shortcuts!.bindings = {
      ...incoming.sections.shortcuts!.bindings,
      'tool.pen': 'Shift+P',
    };
    const diff = diffConfig(current, incoming);
    expect(diff.hasChanges).toBe(true);
    expect(diff.sections[0].section).toBe('shortcuts');
    expect(diff.sections[0].changes.join(' ')).toMatch(/tool\.pen.*Shift\+P/);
  });

  it('reports no changes for an identical config', () => {
    const cfg = buildConfigExport();
    const parsed = parseConfig(serializeConfig(cfg));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(diffConfig(cfg, parsed.value).hasChanges).toBe(false);
  });

  it('reflects post-migration state for older-version shortcut payloads', () => {
    // A v0 shortcuts payload still carrying the legacy Mod+K default should
    // be migrated to Mod+P before diffing, so the preview does not show a
    // spurious "commandPalette.open: Mod+K" change that applyConfig would
    // never actually write.
    const current = buildConfigExport();
    const incoming: ConfigExport = {
      eldraw: 'config',
      version: 1,
      exportedAt: '',
      exportedBy: '',
      sections: {
        shortcuts: {
          kind: 'shortcuts',
          version: 0,
          bindings: { ...current.sections.shortcuts!.bindings, 'commandPalette.open': 'Mod+K' },
        },
      },
    };
    const diff = diffConfig(current, incoming);
    const joined = diff.sections.flatMap((s) => s.changes).join(' ');
    expect(joined).not.toMatch(/Mod\+K/);
    expect(joined).not.toMatch(/commandPalette\.open/);
    expect(diff.hasChanges).toBe(false);
  });

  it('drops invalid sidebar fields from the diff (sanitize pipeline)', () => {
    const current = buildConfigExport();
    const incoming: ConfigExport = {
      eldraw: 'config',
      version: 1,
      exportedAt: '',
      exportedBy: '',
      sections: {
        sidebar: {
          kind: 'sidebar',
          version: 1,
          state: {
            smoothingPen: 25,
            // Invalid fields that sanitize drops — must not appear in diff.
            bogusField: 'should-be-dropped',
            activeTool: 'not-a-real-tool',
          },
        },
      },
    };
    const diff = diffConfig(current, incoming);
    const joined = diff.sections.flatMap((s) => s.changes).join(' ');
    expect(joined).not.toMatch(/bogusField/);
    expect(joined).not.toMatch(/not-a-real-tool/);
    expect(joined).toMatch(/smoothingPen/);
  });
});

describe('default bindings sanity', () => {
  it('DEFAULT_BINDINGS snapshot matches fresh shortcut store', () => {
    expect(shortcutsStore.snapshot()).toEqual(DEFAULT_BINDINGS);
  });
});
