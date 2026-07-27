import { derived, get } from 'svelte/store';
import { currentDocument } from '$lib/store/document';
import { graphPreview } from '$lib/store/graphPreview';
import { viewportStore } from '$lib/store/viewport';
import { presenterSync } from '$lib/ipc/presenter';
import { warn } from '$lib/log';
import type { EldrawDocument } from '$lib/types';

function documentWithGraphPreview(doc: EldrawDocument | null): EldrawDocument | null {
  const preview = get(graphPreview);
  if (!doc || !preview) return doc;
  const page = doc.pages[preview.pageIndex];
  if (!page || !page.objects.some((object) => object.id === preview.graph.id)) return doc;
  return {
    ...doc,
    pages: doc.pages.map((candidate, index) =>
      index === preview.pageIndex
        ? {
            ...candidate,
            objects: candidate.objects.map((object) =>
              object.id === preview.graph.id ? preview.graph : object,
            ),
          }
        : candidate,
    ),
  };
}

/**
 * Start mirroring document + current page to the presenter window. Returns
 * a stop function. Emits an initial sync immediately so the presenter picks
 * up the existing state on open.
 *
 * Pushes are serialized: if a push is already in flight, the latest state
 * is coalesced into a single trailing push so out-of-order resolution can't
 * leave the presenter with a stale snapshot.
 */
export function startPresenterBridge(): () => void {
  let stopped = false;
  let pushInFlight = false;
  let pushPending = false;

  async function push(): Promise<void> {
    if (stopped) return;
    if (pushInFlight) {
      pushPending = true;
      return;
    }
    pushInFlight = true;
    try {
      while (!stopped) {
        pushPending = false;
        const doc = documentWithGraphPreview(get(currentDocument));
        const view = get(viewportStore);
        try {
          await presenterSync({
            pdfId: doc?.pdfHash ?? null,
            pageIndex: view.currentPageIndex,
            document: doc,
          });
        } catch (err) {
          warn('ipc', 'presenter_sync failed', err);
        }
        if (!pushPending) break;
      }
    } finally {
      pushInFlight = false;
    }
  }

  const pageIndexStore = derived(viewportStore, (v) => v.currentPageIndex);

  void push();
  const unsubDoc = currentDocument.subscribe(() => void push());
  const unsubPage = pageIndexStore.subscribe(() => void push());
  const unsubGraphPreview = graphPreview.subscribe(() => void push());

  return () => {
    stopped = true;
    unsubDoc();
    unsubPage();
    unsubGraphPreview();
  };
}
