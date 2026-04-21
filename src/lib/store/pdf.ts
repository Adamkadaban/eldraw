import { writable, type Readable } from 'svelte/store';
import type { PdfMeta } from '$lib/types';
import type { PdfSource } from '$lib/pdf/source';

export interface PdfState {
  meta: PdfMeta | null;
  source: PdfSource | null;
  error: string | null;
  loading: boolean;
}

const initial: PdfState = { meta: null, source: null, error: null, loading: false };

const internal = writable<PdfState>(initial);

export const pdf: Readable<PdfState> = { subscribe: internal.subscribe };

export function setLoading(loading: boolean): void {
  internal.update((s) => ({ ...s, loading }));
}

export function setMeta(meta: PdfMeta): void {
  internal.update((s) => ({ ...s, meta, error: null, loading: false }));
}

export function setSource(source: PdfSource | null): void {
  internal.update((s) => ({ ...s, source }));
}

export function setError(error: string): void {
  internal.update((s) => ({ ...s, error, loading: false }));
}

export function clearError(): void {
  internal.update((s) => ({ ...s, error: null }));
}

export function reset(): void {
  internal.set(initial);
}
