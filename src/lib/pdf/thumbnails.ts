import { renderPdfThumbnail } from '$lib/ipc';

/** Default longest-side pixel bound for thumbnails. */
export const DEFAULT_MAX_DIM = 200;

type Key = string;

function keyOf(pdfId: string, pageIndex: number, maxDim: number): Key {
  return `${pdfId}\u0000${pageIndex}\u0000${maxDim}`;
}

const urls = new Map<Key, string>();
const inflight = new Map<Key, Promise<string>>();

/**
 * Resolve a blob URL for a page thumbnail, rendered on-demand by the Rust
 * backend and cached there via LRU. Identical calls are de-duplicated; the
 * backing blob URL is reused across repeated calls until `revokeThumbnails`
 * is invoked.
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

  const task = (async () => {
    try {
      const bytes = await renderPdfThumbnail(pdfId, pageIndex, maxDim);
      const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
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
 * or omit to clear everything. Callers should invoke this on component
 * teardown or when the active document changes.
 */
export function revokeThumbnails(pdfId?: string): void {
  const prefix = pdfId ? `${pdfId}\u0000` : undefined;
  for (const [k, url] of urls) {
    if (!prefix || k.startsWith(prefix)) {
      URL.revokeObjectURL(url);
      urls.delete(k);
    }
  }
}
