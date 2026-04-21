import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { EldrawDocument } from '$lib/types';

export const PRESENTER_SYNC_EVENT = 'presenter-sync';

export interface MonitorInfo {
  index: number;
  name: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
  isPrimary: boolean;
}

export interface PresenterSyncPayload {
  pdfId: string | null;
  pageIndex: number;
  document: EldrawDocument | null;
}

export async function openPresenterWindow(monitorIndex: number | null): Promise<void> {
  return invoke('open_presenter_window', { monitorIndex });
}

export async function closePresenterWindow(): Promise<void> {
  return invoke('close_presenter_window');
}

export async function presenterSync(payload: PresenterSyncPayload): Promise<void> {
  return invoke('presenter_sync', { payload });
}

export async function listMonitors(): Promise<MonitorInfo[]> {
  return invoke('list_monitors');
}

export function onPresenterSync(
  handler: (payload: PresenterSyncPayload) => void,
): Promise<UnlistenFn> {
  return listen<PresenterSyncPayload>(PRESENTER_SYNC_EVENT, (event) => handler(event.payload));
}
