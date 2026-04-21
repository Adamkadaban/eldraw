/**
 * Glue between the command palette and the config IO layer.
 *
 * The export/import actions use the browser `<a download>` / `<input type="file">`
 * flow so they work both inside Tauri (the webview handles it) and in plain
 * vitest/SvelteKit without pulling in `@tauri-apps/plugin-fs`.
 */

import { buildConfigExport, defaultExportFilename, serializeConfig } from './export';
import {
  applyConfig,
  clearBackup,
  diffConfig,
  hasBackup,
  parseConfig,
  restorePreviousConfig,
} from './import';
import { configDialog } from './dialog';
import type { ConfigExport } from './schema';

export function triggerExportSettings(
  doc: Document | null = typeof document !== 'undefined' ? document : null,
): void {
  if (!doc) return;
  const cfg = buildConfigExport();
  const json = serializeConfig(cfg);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url;
  a.download = defaultExportFilename();
  a.rel = 'noopener';
  doc.body.appendChild(a);
  a.click();
  doc.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function triggerImportSettings(
  doc: Document | null = typeof document !== 'undefined' ? document : null,
): void {
  if (!doc) return;
  const input = doc.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.style.display = 'none';

  const cleanup = (): void => {
    if (input.parentNode) input.parentNode.removeChild(input);
  };

  input.addEventListener(
    'change',
    async () => {
      const file = input.files?.[0] ?? null;
      cleanup();
      if (!file) return;
      try {
        const raw = await file.text();
        handleImportedRaw(raw, file.name);
      } catch (err) {
        configDialog.set({
          kind: 'import-error',
          error: { kind: 'invalid-json', message: (err as Error).message },
        });
      }
    },
    { once: true },
  );

  // Not every browser/runtime fires `cancel`. Use window focus-return as a
  // fallback so a cancelled picker never leaves the element dangling.
  input.addEventListener('cancel', cleanup, { once: true });
  if (typeof window !== 'undefined') {
    window.addEventListener(
      'focus',
      () => {
        setTimeout(cleanup, 500);
      },
      { once: true },
    );
  }

  doc.body.appendChild(input);
  input.click();
}

export function handleImportedRaw(raw: string, filename: string): void {
  const res = parseConfig(raw);
  if (!res.ok) {
    configDialog.set({ kind: 'import-error', error: res.error });
    return;
  }
  const diff = diffConfig(buildConfigExport(), res.value);
  configDialog.set({ kind: 'import-preview', incoming: res.value, diff, filename });
}

/** Used by the "Restore previous settings" command. */
export function triggerRestorePreviousSettings(): boolean {
  return restorePreviousConfig();
}

export function triggerResetSettings(): void {
  configDialog.set({ kind: 'reset-confirm', step: 1 });
}

/** Exposed for tests. */
export function _applyForTest(cfg: ConfigExport): void {
  applyConfig(cfg);
}

/** Exposed for tests. */
export function _hasBackup(): boolean {
  return hasBackup();
}

/** Exposed for tests. */
export function _clearBackupForTest(): void {
  clearBackup();
}
