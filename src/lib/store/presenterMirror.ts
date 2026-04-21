import { writable, type Readable } from 'svelte/store';
import type { EldrawDocument } from '$lib/types';
import type { PresenterSyncPayload } from '$lib/ipc/presenter';

export interface PresenterMirrorState {
  pdfId: string | null;
  pageIndex: number;
  document: EldrawDocument | null;
}

function initial(): PresenterMirrorState {
  return { pdfId: null, pageIndex: 0, document: null };
}

function createMirror() {
  const store = writable<PresenterMirrorState>(initial());
  const { subscribe, set } = store;

  return {
    subscribe,
    apply(payload: PresenterSyncPayload): void {
      set({
        pdfId: payload.pdfId,
        pageIndex: payload.pageIndex,
        document: payload.document,
      });
    },
    reset(): void {
      set(initial());
    },
  };
}

export const presenterMirror = createMirror();

export const presenterMirrorStore: Readable<PresenterMirrorState> = {
  subscribe: presenterMirror.subscribe,
};
