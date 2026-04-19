import { writable, type Readable } from 'svelte/store';
import type { EldrawDocument } from '$lib/types';
import { saveSidecar } from '$lib/ipc';
import { currentDocument } from './document';

const AUTOSAVE_DEBOUNCE_MS = 1500;

export const autosaveError = writable<string | null>(null);

export interface AutosaveOptions {
  /** Override debounce, primarily for tests. */
  debounceMs?: number;
  /** Injectable IPC for tests. */
  save?: (pdfPath: string, doc: EldrawDocument) => Promise<void>;
  /** Source store to observe. Tests can inject a fake. */
  source?: Readable<EldrawDocument | null>;
}

export function startAutosave(pdfPath: string | null, opts: AutosaveOptions = {}): () => void {
  if (pdfPath === null) return () => {};

  const debounceMs = opts.debounceMs ?? AUTOSAVE_DEBOUNCE_MS;
  const save = opts.save ?? saveSidecar;
  const source = opts.source ?? currentDocument;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: EldrawDocument | null = null;
  let skipInitialDocument = true;

  const unsubscribe = source.subscribe((doc) => {
    if (!doc) return;
    if (skipInitialDocument) {
      skipInitialDocument = false;
      return;
    }
    pending = doc;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const snapshot = pending;
      pending = null;
      if (!snapshot) return;
      save(pdfPath, snapshot).then(
        () => autosaveError.set(null),
        (err: unknown) => autosaveError.set(err instanceof Error ? err.message : String(err)),
      );
    }, debounceMs);
  });

  return () => {
    if (timer !== null) clearTimeout(timer);
    unsubscribe();
  };
}
