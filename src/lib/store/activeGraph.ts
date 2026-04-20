import { writable, type Readable } from 'svelte/store';
import type { ObjectId } from '$lib/types';

export interface ActiveGraph {
  pageIndex: number;
  objectId: ObjectId;
}

const store = writable<ActiveGraph | null>(null);

export const activeGraph: Readable<ActiveGraph | null> = { subscribe: store.subscribe };

export function setActiveGraph(value: ActiveGraph | null): void {
  store.set(value);
}

export function clearActiveGraph(): void {
  store.set(null);
}
