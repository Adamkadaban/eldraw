import { get } from 'svelte/store';
import { currentDocument } from '$lib/store/document';
import { viewportStore } from '$lib/store/viewport';
import { presenterSync } from '$lib/ipc/presenter';
import { warn } from '$lib/log';

/**
 * Start mirroring document + current page to the presenter window. Returns
 * a stop function. Emits an initial sync immediately so the presenter picks
 * up the existing state on open.
 */
export function startPresenterBridge(): () => void {
  let stopped = false;

  async function push(): Promise<void> {
    if (stopped) return;
    const doc = get(currentDocument);
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
  }

  void push();
  const unsubDoc = currentDocument.subscribe(() => void push());
  const unsubView = viewportStore.subscribe(() => void push());

  return () => {
    stopped = true;
    unsubDoc();
    unsubView();
  };
}
