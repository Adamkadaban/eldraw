import { writable } from 'svelte/store';
import type { ConfigDiff, ConfigError, ConfigExport } from './schema';

export type ConfigDialogMode =
  | { kind: 'closed' }
  | { kind: 'import-preview'; incoming: ConfigExport; diff: ConfigDiff; filename: string }
  | { kind: 'import-error'; error: ConfigError }
  | { kind: 'reset-confirm'; step: 1 | 2 };

export const configDialog = writable<ConfigDialogMode>({ kind: 'closed' });

export function closeConfigDialog(): void {
  configDialog.set({ kind: 'closed' });
}
