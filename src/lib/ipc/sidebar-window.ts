import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export const SIDEBAR_SYNC_EVENT = 'sidebar-sync';
export const SIDEBAR_SYNC_BACK_EVENT = 'sidebar-sync-back';
export const SIDEBAR_WINDOW_CLOSED_EVENT = 'sidebar-window-closed';

export type SidebarSyncPayload = Record<string, unknown>;

export async function openSidebarWindow(): Promise<void> {
  return invoke('open_sidebar_window');
}

export async function closeSidebarWindow(): Promise<void> {
  return invoke('close_sidebar_window');
}

export async function sidebarSync(payload: SidebarSyncPayload): Promise<void> {
  return invoke('sidebar_sync', { payload });
}

export async function sidebarSyncBack(payload: SidebarSyncPayload): Promise<void> {
  return invoke('sidebar_sync_back', { payload });
}

export function onSidebarSync(handler: (payload: SidebarSyncPayload) => void): Promise<UnlistenFn> {
  return listen<SidebarSyncPayload>(SIDEBAR_SYNC_EVENT, (event) => handler(event.payload));
}

export function onSidebarSyncBack(
  handler: (payload: SidebarSyncPayload) => void,
): Promise<UnlistenFn> {
  return listen<SidebarSyncPayload>(SIDEBAR_SYNC_BACK_EVENT, (event) => handler(event.payload));
}

export function onSidebarWindowClosed(handler: () => void): Promise<UnlistenFn> {
  return listen(SIDEBAR_WINDOW_CLOSED_EVENT, () => handler());
}
