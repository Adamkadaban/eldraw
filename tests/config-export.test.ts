import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildConfigExport,
  defaultExportFilename,
  serializeConfig,
} from '../src/lib/config/export';
import { parseConfig } from '../src/lib/config/import';
import { CONFIG_SCHEMA_VERSION } from '../src/lib/config/schema';
import { shortcutsStore } from '../src/lib/store/shortcuts';
import { sidebar } from '../src/lib/store/sidebar';

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

describe('config export', () => {
  beforeEach(() => {
    memory.clear();
    shortcutsStore._reset();
    sidebar.reset();
  });

  it('round-trips through parse without loss', () => {
    shortcutsStore.setBinding('tool.pen', 'Shift+P');
    sidebar.setSmoothing('pen', 30);

    const cfg = buildConfigExport();
    const serialized = serializeConfig(cfg);
    const parsed = parseConfig(serialized);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toEqual(cfg);
  });

  it('serializeConfig pretty-prints', () => {
    const cfg = buildConfigExport();
    const out = serializeConfig(cfg);
    expect(out).toContain('\n');
    expect(out).toContain('  "eldraw": "config"');
  });

  it('tags export with current schema version and sentinel', () => {
    const cfg = buildConfigExport();
    expect(cfg.eldraw).toBe('config');
    expect(cfg.version).toBe(CONFIG_SCHEMA_VERSION);
    expect(cfg.sections.shortcuts?.kind).toBe('shortcuts');
    expect(cfg.sections.sidebar?.kind).toBe('sidebar');
  });

  it('filename is eldraw-config-YYYYMMDD.json', () => {
    const d = new Date(2026, 3, 21);
    expect(defaultExportFilename(d)).toBe('eldraw-config-20260421.json');
  });
});
