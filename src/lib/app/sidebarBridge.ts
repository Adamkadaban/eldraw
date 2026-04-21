import { get } from 'svelte/store';
import {
  pickSyncable,
  sidebar,
  syncableEqual,
  type SidebarState,
  type SyncableSidebarState,
} from '$lib/store/sidebar';
import {
  onSidebarSync,
  onSidebarSyncBack,
  sidebarSync,
  sidebarSyncBack,
  type SidebarSyncPayload,
} from '$lib/ipc/sidebar-window';
import { warn } from '$lib/log';

type Side = 'main' | 'detached';

/**
 * Start mirroring sidebar state between the main and detached windows.
 *
 * Each window calls this with its own role. The bridge subscribes to the
 * local sidebar store and forwards the syncable subset to the peer on
 * change. Incoming snapshots are tracked via `lastSeen` so the echo
 * (peer applies → re-emits) is dropped without bouncing back. Pushes
 * are coalesced so only the latest snapshot is ever in flight.
 *
 * Returns a stop function.
 */
export function startSidebarBridge(side: Side): () => void {
  let stopped = false;
  let pushInFlight = false;
  let pushPending = false;
  let applyingRemote = false;
  let lastSeen: SyncableSidebarState | null = null;

  const send = side === 'main' ? sidebarSync : sidebarSyncBack;
  const subscribe = side === 'main' ? onSidebarSync : onSidebarSyncBack;

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
        const snap = pickSyncable(get(sidebar));
        if (lastSeen !== null && syncableEqual(snap, lastSeen)) break;
        lastSeen = snap;
        try {
          await send(snap as unknown as SidebarSyncPayload);
        } catch (err) {
          warn('ipc', `sidebar_sync (${side}) failed`, err);
        }
        if (!pushPending) break;
      }
    } finally {
      pushInFlight = false;
    }
  }

  const unsubStore = sidebar.subscribe(() => {
    if (applyingRemote) return;
    void push();
  });
  void push();

  let unsubEvent: (() => void) | null = null;
  void subscribe((payload) => {
    const incoming = pickSyncable(payload as unknown as SidebarState);
    applyingRemote = true;
    try {
      sidebar.applyRemote(incoming);
    } finally {
      applyingRemote = false;
    }
    // Snapshot the post-apply state so partial incoming payloads don't
    // look like a new local change and bounce back.
    lastSeen = pickSyncable(get(sidebar));
  }).then((fn) => {
    if (stopped) fn();
    else unsubEvent = fn;
  });

  return () => {
    stopped = true;
    unsubStore();
    unsubEvent?.();
  };
}
