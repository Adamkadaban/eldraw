import {
  CONFIG_SCHEMA_VERSION,
  type ConfigExport,
  type ShortcutsSection,
  type SidebarSection,
} from './schema';
import { shortcutsStore } from '$lib/store/shortcuts';
import { getPersistableSidebarPayload } from '$lib/store/sidebar';

declare const __APP_VERSION__: string | undefined;

function appVersion(): string {
  try {
    if (typeof __APP_VERSION__ === 'string' && __APP_VERSION__.length > 0) {
      return __APP_VERSION__;
    }
  } catch {
    // __APP_VERSION__ is injected by Vite at build time; fall through.
  }
  return '0.0.0-dev';
}

export function buildConfigExport(now: Date = new Date()): ConfigExport {
  const shortcutsPayload = shortcutsStore.getPersistablePayload();
  const sidebarPayload = getPersistableSidebarPayload();

  const shortcuts: ShortcutsSection = {
    kind: 'shortcuts',
    version: shortcutsPayload.version,
    bindings: { ...shortcutsPayload.bindings },
  };
  const sidebar: SidebarSection = {
    kind: 'sidebar',
    version: sidebarPayload.version,
    state: structuredCloneSafe(sidebarPayload.state),
  };

  return {
    eldraw: 'config',
    version: CONFIG_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    exportedBy: `eldraw-${appVersion()}`,
    sections: { shortcuts, sidebar },
  };
}

export function serializeConfig(cfg: ConfigExport): string {
  return JSON.stringify(cfg, null, 2);
}

export function defaultExportFilename(now: Date = new Date()): string {
  const y = now.getFullYear().toString().padStart(4, '0');
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  const d = now.getDate().toString().padStart(2, '0');
  return `eldraw-config-${y}${m}${d}.json`;
}

function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}
