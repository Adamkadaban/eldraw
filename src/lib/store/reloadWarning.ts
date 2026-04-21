import { writable, type Readable } from 'svelte/store';

export interface ReloadWarning {
  id: number;
  message: string;
}

const internal = writable<ReloadWarning | null>(null);
let nextId = 1;

export const reloadWarning: Readable<ReloadWarning | null> = { subscribe: internal.subscribe };

export function emitReloadWarning(message: string): ReloadWarning {
  const w = { id: nextId++, message };
  internal.set(w);
  return w;
}

export function clearReloadWarning(): void {
  internal.set(null);
}
