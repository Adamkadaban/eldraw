import { writable, type Readable } from 'svelte/store';
import type { GraphObject } from '$lib/types';

export interface GraphPreview {
  pageIndex: number;
  graph: GraphObject;
}

const store = writable<GraphPreview | null>(null);

export const graphPreview: Readable<GraphPreview | null> = { subscribe: store.subscribe };

export function setGraphPreview(preview: GraphPreview): void {
  store.set(preview);
}

export function clearGraphPreview(): void {
  store.set(null);
}
