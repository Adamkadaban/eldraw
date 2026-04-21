import { describe, expect, it, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  shortcutsStore,
  shortcutBindings,
  SHORTCUTS_STORAGE_KEY,
  SHORTCUTS_SCHEMA_VERSION,
} from '../src/lib/store/shortcuts';
import { DEFAULT_BINDINGS } from '../src/lib/app/shortcutRegistry';
import type { ShortcutId } from '../src/lib/app/shortcutRegistry';

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
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

describe('shortcuts store', () => {
  beforeEach(() => {
    memory.clear();
    shortcutsStore._reset();
  });

  it('hydrates with default bindings when storage is empty', () => {
    shortcutsStore.hydrate();
    const snap = shortcutsStore.snapshot();
    expect(snap).toEqual(DEFAULT_BINDINGS);
    expect(get(shortcutBindings)).toEqual(DEFAULT_BINDINGS);
  });

  it('setBinding updates the store and persists to localStorage', () => {
    shortcutsStore.setBinding('tool.pen', 'Shift+P');
    expect(shortcutsStore.snapshot()['tool.pen']).toBe('Shift+P');

    const raw = memory.getItem(SHORTCUTS_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed.version).toBe(SHORTCUTS_SCHEMA_VERSION);
    expect(parsed.bindings['tool.pen']).toBe('Shift+P');
  });

  it('resetBinding restores only that command to default', () => {
    shortcutsStore.setBinding('tool.pen', 'Shift+P');
    shortcutsStore.setBinding('tool.highlighter', 'Shift+H');
    shortcutsStore.resetBinding('tool.pen');

    const snap = shortcutsStore.snapshot();
    expect(snap['tool.pen']).toBe(DEFAULT_BINDINGS['tool.pen']);
    expect(snap['tool.highlighter']).toBe('Shift+H');
  });

  it('resetAll clears all custom bindings', () => {
    shortcutsStore.setBinding('tool.pen', 'Shift+P');
    shortcutsStore.setBinding('edit.undo', 'Ctrl+Y');
    shortcutsStore.resetAll();
    expect(shortcutsStore.snapshot()).toEqual(DEFAULT_BINDINGS);
  });

  it('persistence round-trip: hydrate picks up previously stored bindings', () => {
    shortcutsStore.setBinding('tool.pen', 'Shift+P');
    shortcutsStore.setBinding('tool.eraser', 'Alt+E');

    // Simulate a fresh session: keep storage, forget in-memory state.
    shortcutsStore._reset();
    // _reset wipes storage too, so re-seed it.
    memory.setItem(
      SHORTCUTS_STORAGE_KEY,
      JSON.stringify({ 'tool.pen': 'Shift+P', 'tool.eraser': 'Alt+E' }),
    );
    shortcutsStore.hydrate();

    const snap = shortcutsStore.snapshot();
    expect(snap['tool.pen']).toBe('Shift+P');
    expect(snap['tool.eraser']).toBe('Alt+E');
    // Unspecified ids fall back to defaults.
    expect(snap['tool.highlighter']).toBe(DEFAULT_BINDINGS['tool.highlighter']);
  });

  it('ignores malformed storage payloads', () => {
    memory.setItem(SHORTCUTS_STORAGE_KEY, '{not json');
    shortcutsStore.hydrate();
    expect(shortcutsStore.snapshot()).toEqual(DEFAULT_BINDINGS);
  });

  it('ignores unknown ids and non-string values in storage', () => {
    memory.setItem(
      SHORTCUTS_STORAGE_KEY,
      JSON.stringify({ 'tool.pen': 42, 'totally.unknown': 'x', 'tool.eraser': 'Alt+E' }),
    );
    shortcutsStore.hydrate();
    const snap = shortcutsStore.snapshot();
    expect(snap['tool.pen']).toBe(DEFAULT_BINDINGS['tool.pen']);
    expect(snap['tool.eraser']).toBe('Alt+E');
  });

  it('command palette default is Mod+P', () => {
    expect(DEFAULT_BINDINGS['commandPalette.open']).toBe('Mod+P');
  });

  it('migrates legacy unversioned Mod+K to Mod+P for commandPalette.open', () => {
    memory.setItem(
      SHORTCUTS_STORAGE_KEY,
      JSON.stringify({ 'commandPalette.open': 'Mod+K', 'tool.pen': 'Shift+P' }),
    );
    shortcutsStore.hydrate();
    const snap = shortcutsStore.snapshot();
    expect(snap['commandPalette.open']).toBe('Mod+P');
    expect(snap['tool.pen']).toBe('Shift+P');
  });

  it('leaves non-default custom commandPalette bindings untouched during migration', () => {
    memory.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify({ 'commandPalette.open': 'Mod+Shift+K' }));
    shortcutsStore.hydrate();
    expect(shortcutsStore.snapshot()['commandPalette.open']).toBe('Mod+Shift+K');
  });

  it('does not re-run migrations on already-versioned payloads', () => {
    // User explicitly set Mod+K after the migration landed — must be preserved.
    memory.setItem(
      SHORTCUTS_STORAGE_KEY,
      JSON.stringify({
        version: SHORTCUTS_SCHEMA_VERSION,
        bindings: { 'commandPalette.open': 'Mod+K' },
      }),
    );
    shortcutsStore.hydrate();
    expect(shortcutsStore.snapshot()['commandPalette.open']).toBe('Mod+K');
  });

  it('persists with current schema version and bindings wrapper', () => {
    shortcutsStore.setBinding('commandPalette.open', 'Mod+K');
    const raw = memory.getItem(SHORTCUTS_STORAGE_KEY);
    const parsed = JSON.parse(raw as string);
    expect(parsed.version).toBe(SHORTCUTS_SCHEMA_VERSION);
    expect(parsed.bindings['commandPalette.open']).toBe('Mod+K');
  });

  it('treats fractional schema version as legacy and runs migrations from v0', () => {
    memory.setItem(
      SHORTCUTS_STORAGE_KEY,
      JSON.stringify({
        version: 0.5,
        bindings: { 'commandPalette.open': 'Mod+K', 'tool.pen': 'Shift+P' },
      }),
    );
    shortcutsStore.hydrate();
    const snap = shortcutsStore.snapshot();
    expect(snap['commandPalette.open']).toBe('Mod+P');
    expect(snap['tool.pen']).toBe('Shift+P');
  });

  it('treats negative schema version as legacy and runs migrations from v0', () => {
    memory.setItem(
      SHORTCUTS_STORAGE_KEY,
      JSON.stringify({
        version: -1,
        bindings: { 'commandPalette.open': 'Mod+K', 'tool.eraser': 'Alt+E' },
      }),
    );
    shortcutsStore.hydrate();
    const snap = shortcutsStore.snapshot();
    expect(snap['commandPalette.open']).toBe('Mod+P');
    expect(snap['tool.eraser']).toBe('Alt+E');
  });

  it('number-key defaults: 1-9 pick presets, Mod+1-9 pick colors', () => {
    for (let n = 1; n <= 9; n++) {
      expect(DEFAULT_BINDINGS[`preset.${n}` as ShortcutId]).toBe(`${n}`);
      expect(DEFAULT_BINDINGS[`palette.${n}` as ShortcutId]).toBe(`Mod+${n}`);
    }
  });

  it('v1 → v2 migration swaps stored bindings still at old defaults', () => {
    const stored: Record<string, string> = {};
    for (let n = 1; n <= 9; n++) {
      stored[`preset.${n}`] = `Mod+${n}`;
      stored[`palette.${n}`] = `${n}`;
    }
    memory.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify({ version: 1, bindings: stored }));
    shortcutsStore.hydrate();
    const snap = shortcutsStore.snapshot();
    for (let n = 1; n <= 9; n++) {
      expect(snap[`preset.${n}` as ShortcutId]).toBe(`${n}`);
      expect(snap[`palette.${n}` as ShortcutId]).toBe(`Mod+${n}`);
    }
  });

  it('v1 → v2 migration preserves user overrides that differ from old defaults', () => {
    memory.setItem(
      SHORTCUTS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        bindings: {
          'preset.1': 'Shift+1',
          'palette.1': 'Alt+1',
          'preset.2': 'Mod+2',
          'palette.2': '2',
        },
      }),
    );
    shortcutsStore.hydrate();
    const snap = shortcutsStore.snapshot();
    expect(snap['preset.1']).toBe('Shift+1');
    expect(snap['palette.1']).toBe('Alt+1');
    expect(snap['preset.2']).toBe(`2`);
    expect(snap['palette.2']).toBe(`Mod+2`);
  });
});
