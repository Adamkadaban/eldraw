import { invoke } from '@tauri-apps/api/core';
import { log, warn } from '$lib/log';

export async function fetchSlidesPdf(url: string): Promise<string> {
  const t = performance.now();
  try {
    const path = await invoke<string>('fetch_slides_pdf', { url });
    log('ipc', `fetch_slides_pdf ok path=${path} in ${(performance.now() - t).toFixed(1)}ms`);
    return path;
  } catch (err) {
    warn('ipc', `fetch_slides_pdf failed after ${(performance.now() - t).toFixed(1)}ms`, err);
    throw err;
  }
}
