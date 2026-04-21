import { renderPdfThumbnail } from '$lib/ipc';

/** Default longest-side pixel bound for thumbnails. */
export const DEFAULT_MAX_DIM = 200;

type Key = string;

function keyOf(pdfId: string, pageIndex: number, maxDim: number): Key {
  return `${pdfId}\u0000${pageIndex}\u0000${maxDim}`;
}

function pageKey(pdfId: string, pageIndex: number): Key {
  return `${pdfId}\u0000${pageIndex}`;
}

const urls = new Map<Key, string>();
const inflight = new Map<Key, Promise<string>>();
const generations = new Map<string, number>();
const pageGenerations = new Map<Key, number>();
const pageListeners = new Map<Key, Set<(generation: number) => void>>();

function generation(pdfId: string): number {
  return generations.get(pdfId) ?? 0;
}

/**
 * Resolve a blob URL for a page thumbnail, rendered on-demand by the Rust
 * backend and cached there via LRU. Identical calls are de-duplicated; the
 * backing blob URL is reused across repeated calls until `revokeThumbnails`
 * is invoked.
 *
 * Each `pdfId` carries a generation counter that is bumped by
 * `revokeThumbnails`. An in-flight render whose generation is stale on
 * completion revokes the freshly-minted blob URL instead of caching it, so a
 * late response can't resurrect a dropped document's thumbnails.
 */
export async function getThumbnail(
  pdfId: string,
  pageIndex: number,
  maxDim: number = DEFAULT_MAX_DIM,
): Promise<string> {
  const k = keyOf(pdfId, pageIndex, maxDim);
  const cached = urls.get(k);
  if (cached) return cached;
  const pending = inflight.get(k);
  if (pending) return pending;

  const token = generation(pdfId);
  const task = (async () => {
    try {
      const bytes = await renderPdfThumbnail(pdfId, pageIndex, maxDim);
      const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
      if (generation(pdfId) !== token) {
        URL.revokeObjectURL(url);
        throw new Error('thumbnail request superseded');
      }
      urls.set(k, url);
      return url;
    } finally {
      inflight.delete(k);
    }
  })();
  inflight.set(k, task);
  return task;
}

/**
 * Revoke cached blob URLs. Pass `pdfId` to drop only that document's entries,
 * or omit to clear everything. Bumps the per-`pdfId` generation token so
 * in-flight requests started before the call drop their results instead of
 * repopulating the cache.
 */
export function revokeThumbnails(pdfId?: string): void {
  if (pdfId) {
    generations.set(pdfId, generation(pdfId) + 1);
  } else {
    for (const id of generations.keys()) {
      generations.set(id, generation(id) + 1);
    }
  }
  const prefix = pdfId ? `${pdfId}\u0000` : undefined;
  for (const [k, url] of urls) {
    if (!prefix || k.startsWith(prefix)) {
      URL.revokeObjectURL(url);
      urls.delete(k);
    }
  }
  for (const k of pageGenerations.keys()) {
    if (!prefix || k.startsWith(prefix)) pageGenerations.delete(k);
  }
  for (const k of pageListeners.keys()) {
    if (!prefix || k.startsWith(prefix)) pageListeners.delete(k);
  }
}

/**
 * Revoke cached thumbnails for `pdfId` whose page index is not in
 * `keepPageIndexes`. Used to clean up when pages are deleted/reordered so
 * orphaned blob URLs don't accumulate for the lifetime of the document.
 */
export function retainThumbnails(pdfId: string, keepPageIndexes: ReadonlySet<number>): void {
  const prefix = `${pdfId}\u0000`;
  for (const [k, url] of urls) {
    if (!k.startsWith(prefix)) continue;
    const rest = k.slice(prefix.length);
    const sep = rest.indexOf('\u0000');
    if (sep < 0) continue;
    const pageIndex = Number(rest.slice(0, sep));
    if (!keepPageIndexes.has(pageIndex)) {
      URL.revokeObjectURL(url);
      urls.delete(k);
    }
  }
  for (const k of pageGenerations.keys()) {
    if (!k.startsWith(prefix)) continue;
    const pageIndex = Number(k.slice(prefix.length));
    if (!keepPageIndexes.has(pageIndex)) {
      pageGenerations.delete(k);
      pageListeners.delete(k);
    }
  }
}

/**
 * Per-page generation counter. Bumped on each committed annotation change
 * so thumbnail consumers can re-composite only the affected page.
 */
export function pageGeneration(pdfId: string, pageIndex: number): number {
  return pageGenerations.get(pageKey(pdfId, pageIndex)) ?? 0;
}

export function bumpPageGeneration(pdfId: string, pageIndex: number): void {
  const k = pageKey(pdfId, pageIndex);
  const next = (pageGenerations.get(k) ?? 0) + 1;
  pageGenerations.set(k, next);
  const listeners = pageListeners.get(k);
  if (listeners) {
    for (const cb of listeners) cb(next);
  }
}

export function subscribePageGeneration(
  pdfId: string,
  pageIndex: number,
  listener: (generation: number) => void,
): () => void {
  const k = pageKey(pdfId, pageIndex);
  let set = pageListeners.get(k);
  if (!set) {
    set = new Set();
    pageListeners.set(k, set);
  }
  set.add(listener);
  return () => {
    const s = pageListeners.get(k);
    if (!s) return;
    s.delete(listener);
    if (s.size === 0) pageListeners.delete(k);
  };
}
