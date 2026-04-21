/**
 * Shared types for the portable config file ("export settings to JSON").
 *
 * The top-level envelope is versioned (`CONFIG_SCHEMA_VERSION`) and is
 * separate from each section's own schema version. This lets individual
 * sections evolve their migration ladder (shortcuts, sidebar) without
 * forcing a global envelope bump. Unknown sections are ignored on import
 * so new sections from future builds drop in cleanly.
 */

export const CONFIG_SCHEMA_VERSION = 1;

export interface ShortcutsSection {
  kind: 'shortcuts';
  version: number;
  bindings: Record<string, string>;
}

export interface SidebarSection {
  kind: 'sidebar';
  version: number;
  state: Record<string, unknown>;
}

export type ConfigSection = ShortcutsSection | SidebarSection;

export interface ConfigSections {
  shortcuts?: ShortcutsSection;
  sidebar?: SidebarSection;
}

export interface ConfigExport {
  eldraw: 'config';
  version: number;
  exportedAt: string;
  exportedBy: string;
  sections: ConfigSections;
}

export type ConfigErrorKind =
  | 'invalid-json'
  | 'not-config'
  | 'unsupported-version'
  | 'invalid-shape';

export interface ConfigError {
  kind: ConfigErrorKind;
  message: string;
}

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export const CONFIG_BACKUP_KEY = 'eldraw.config.backup';

export interface ConfigBackup {
  backedUpAt: string;
  config: ConfigExport;
}

export interface SectionChange {
  section: 'shortcuts' | 'sidebar';
  summary: string;
  changes: string[];
}

export interface ConfigDiff {
  hasChanges: boolean;
  sections: SectionChange[];
}
