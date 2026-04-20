import { get, writable, type Readable } from 'svelte/store';

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 4.0;
const ZOOM_STEP = 1.1;

export interface ViewportState {
  scale: number;
  offsetX: number;
  offsetY: number;
  currentPageIndex: number;
  panMode: boolean;
}

function initial(): ViewportState {
  return { scale: 1.5, offsetX: 0, offsetY: 0, currentPageIndex: 0, panMode: false };
}

function clampScale(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, n));
}

function createViewport() {
  const store = writable<ViewportState>(initial());
  const { subscribe, update, set } = store;

  return {
    subscribe,
    reset: () => set(initial()),

    setScale(scale: number): void {
      update((s) => ({ ...s, scale: clampScale(scale) }));
    },

    zoomIn(): void {
      update((s) => ({ ...s, scale: clampScale(s.scale * ZOOM_STEP) }));
    },

    zoomOut(): void {
      update((s) => ({ ...s, scale: clampScale(s.scale / ZOOM_STEP) }));
    },

    setOffset(offsetX: number, offsetY: number): void {
      update((s) => ({ ...s, offsetX, offsetY }));
    },

    panBy(dx: number, dy: number): void {
      update((s) => ({ ...s, offsetX: s.offsetX + dx, offsetY: s.offsetY + dy }));
    },

    setPanMode(panMode: boolean): void {
      update((s) => (s.panMode === panMode ? s : { ...s, panMode }));
    },

    setPage(index: number, total: number): void {
      update((s) => {
        if (total <= 0) return { ...s, currentPageIndex: 0 };
        const clamped = Math.max(0, Math.min(total - 1, index));
        return { ...s, currentPageIndex: clamped };
      });
    },

    nextPage(total: number): void {
      update((s) => {
        if (total <= 0) return { ...s, currentPageIndex: 0 };
        const next = Math.min(total - 1, s.currentPageIndex + 1);
        return { ...s, currentPageIndex: next };
      });
    },

    prevPage(): void {
      update((s) => ({ ...s, currentPageIndex: Math.max(0, s.currentPageIndex - 1) }));
    },

    snapshot(): ViewportState {
      return get(store);
    },
  };
}

export const viewport = createViewport();

export const viewportStore: Readable<ViewportState> = { subscribe: viewport.subscribe };
