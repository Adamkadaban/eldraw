import {
  CONFIG_BACKUP_KEY,
  CONFIG_SCHEMA_VERSION,
  type ConfigBackup,
  type ConfigDiff,
  type ConfigError,
  type ConfigExport,
  type Result,
  type SectionChange,
} from './schema';
import { buildConfigExport } from './export';
import { shortcutsStore } from '$lib/store/shortcuts';
import { applyImportedSidebarPayload, previewImportedSidebarPayload } from '$lib/store/sidebar';

function err(kind: ConfigError['kind'], message: string): Result<never, ConfigError> {
  return { ok: false, error: { kind, message } };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export function parseConfig(raw: string): Result<ConfigExport, ConfigError> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return err('invalid-json', `Not valid JSON: ${(e as Error).message}`);
  }
  if (!isRecord(parsed)) {
    return err('invalid-shape', 'Config must be a JSON object.');
  }
  if (parsed.eldraw !== 'config') {
    return err(
      'not-config',
      'Missing `"eldraw": "config"` sentinel — this file is not an eldraw config export.',
    );
  }
  if (
    typeof parsed.version !== 'number' ||
    !Number.isInteger(parsed.version) ||
    parsed.version < 1
  ) {
    return err('invalid-shape', 'Config `version` must be a positive integer.');
  }
  if (parsed.version > CONFIG_SCHEMA_VERSION) {
    return err(
      'unsupported-version',
      `Config was exported by a newer eldraw (schema v${parsed.version}). ` +
        `This build understands v${CONFIG_SCHEMA_VERSION} and below.`,
    );
  }
  if (!isRecord(parsed.sections)) {
    return err('invalid-shape', 'Config `sections` must be an object.');
  }

  const sections: ConfigExport['sections'] = {};
  const rawSections = parsed.sections;

  if (rawSections.shortcuts !== undefined) {
    const s = rawSections.shortcuts;
    if (!isRecord(s) || !isRecord(s.bindings)) {
      return err('invalid-shape', 'Invalid `sections.shortcuts` payload.');
    }
    const bindings: Record<string, string> = {};
    for (const [k, v] of Object.entries(s.bindings)) {
      if (typeof v === 'string') bindings[k] = v;
    }
    const version = typeof s.version === 'number' ? s.version : 0;
    sections.shortcuts = { kind: 'shortcuts', version, bindings };
  }

  if (rawSections.sidebar !== undefined) {
    const s = rawSections.sidebar;
    if (!isRecord(s) || !isRecord(s.state)) {
      return err('invalid-shape', 'Invalid `sections.sidebar` payload.');
    }
    const version = typeof s.version === 'number' ? s.version : 0;
    sections.sidebar = {
      kind: 'sidebar',
      version,
      state: { ...s.state },
    };
  }

  const cfg: ConfigExport = {
    eldraw: 'config',
    version: parsed.version,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '',
    exportedBy: typeof parsed.exportedBy === 'string' ? parsed.exportedBy : '',
    sections,
  };
  return { ok: true, value: cfg };
}

export function diffConfig(current: ConfigExport, incoming: ConfigExport): ConfigDiff {
  const effective = previewEffectiveConfig(incoming);
  const sections: SectionChange[] = [];

  if (effective.sections.shortcuts) {
    const cur = current.sections.shortcuts?.bindings ?? {};
    const next = effective.sections.shortcuts.bindings;
    const changes: string[] = [];
    for (const [id, spec] of Object.entries(next)) {
      if (cur[id] !== spec) {
        changes.push(cur[id] ? `${id}: ${cur[id]} → ${spec}` : `${id}: set to ${spec}`);
      }
    }
    for (const id of Object.keys(cur)) {
      if (!(id in next)) changes.push(`${id}: ${cur[id]} → (unset)`);
    }
    if (changes.length > 0) {
      sections.push({
        section: 'shortcuts',
        summary: `${changes.length} shortcut${changes.length === 1 ? '' : 's'} will change`,
        changes,
      });
    }
  }

  if (effective.sections.sidebar) {
    const cur = current.sections.sidebar?.state ?? {};
    const next = effective.sections.sidebar.state;
    const changes: string[] = [];
    for (const [key, value] of Object.entries(next)) {
      const before = (cur as Record<string, unknown>)[key];
      if (!deepEqual(before, value)) {
        changes.push(`${key}: ${preview(before)} → ${preview(value)}`);
      }
    }
    if (changes.length > 0) {
      sections.push({
        section: 'sidebar',
        summary: `${changes.length} sidebar field${changes.length === 1 ? '' : 's'} will change`,
        changes,
      });
    }
  }

  return { hasChanges: sections.length > 0, sections };
}

/**
 * Normalize an incoming config by running each section's migration and
 * sanitize pipeline on a deep copy. The result mirrors what `applyConfig`
 * would actually persist, without mutating live store state. Used by
 * `diffConfig` so the preview reflects the post-migration world (e.g.
 * Mod+K → Mod+P) rather than the raw bytes on disk.
 */
export function previewEffectiveConfig(cfg: ConfigExport): ConfigExport {
  const out: ConfigExport = {
    eldraw: 'config',
    version: cfg.version,
    exportedAt: cfg.exportedAt,
    exportedBy: cfg.exportedBy,
    sections: {},
  };

  if (cfg.sections.shortcuts) {
    const bindings = shortcutsStore.previewImportedPayload({
      version: cfg.sections.shortcuts.version,
      bindings: cfg.sections.shortcuts.bindings,
    });
    out.sections.shortcuts = {
      kind: 'shortcuts',
      version: cfg.sections.shortcuts.version,
      bindings: bindings as Record<string, string>,
    };
  }

  if (cfg.sections.sidebar) {
    const state = previewImportedSidebarPayload({
      version: cfg.sections.sidebar.version,
      state: cfg.sections.sidebar.state,
    });
    out.sections.sidebar = {
      kind: 'sidebar',
      version: cfg.sections.sidebar.version,
      state: state as Record<string, unknown>,
    };
  }

  return out;
}

function preview(v: unknown): string {
  if (v === undefined) return '(unset)';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean' || v === null) return String(v);
  try {
    const s = JSON.stringify(v);
    return s.length > 60 ? `${s.slice(0, 57)}…` : s;
  } catch {
    return '[object]';
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (Array.isArray(b)) return false;
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bObj, key)) return false;
    if (!deepEqual(aObj[key], bObj[key])) return false;
  }
  return true;
}

function writeBackup(current: ConfigExport): void {
  if (typeof localStorage === 'undefined') return;
  const backup: ConfigBackup = { backedUpAt: new Date().toISOString(), config: current };
  try {
    localStorage.setItem(CONFIG_BACKUP_KEY, JSON.stringify(backup));
  } catch {
    // Storage unavailable/full — non-fatal; restore simply won't be offered.
  }
}

function readBackup(): ConfigBackup | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CONFIG_BACKUP_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    if (typeof parsed.backedUpAt !== 'string') return null;
    if (!isRecord(parsed.config)) return null;
    return parsed as unknown as ConfigBackup;
  } catch {
    return null;
  }
}

export function hasBackup(): boolean {
  return readBackup() !== null;
}

/**
 * Persist the incoming config, after backing up the current live state so
 * the user can undo via `restorePreviousConfig`. Each section is run
 * through its store's own migration ladder via `applyImportedPayload`.
 */
export function applyConfig(cfg: ConfigExport): void {
  writeBackup(buildConfigExport());
  applySections(cfg);
}

function applySections(cfg: ConfigExport): void {
  if (cfg.sections.shortcuts) {
    shortcutsStore.applyImportedPayload({
      version: cfg.sections.shortcuts.version,
      bindings: cfg.sections.shortcuts.bindings,
    });
  }
  if (cfg.sections.sidebar) {
    applyImportedSidebarPayload({
      version: cfg.sections.sidebar.version,
      state: cfg.sections.sidebar.state,
    });
  }
}

export function restorePreviousConfig(): boolean {
  const backup = readBackup();
  if (!backup) return false;
  const currentLive = buildConfigExport();
  applySections(backup.config);
  if (typeof localStorage !== 'undefined') {
    try {
      const replacement: ConfigBackup = {
        backedUpAt: new Date().toISOString(),
        config: currentLive,
      };
      localStorage.setItem(CONFIG_BACKUP_KEY, JSON.stringify(replacement));
    } catch {
      // ignore
    }
  }
  return true;
}

export function clearBackup(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(CONFIG_BACKUP_KEY);
  } catch {
    // ignore
  }
}
