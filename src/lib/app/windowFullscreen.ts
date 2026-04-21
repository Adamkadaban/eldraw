import { getCurrentWindow } from '@tauri-apps/api/window';
import { warn } from '$lib/log';

/**
 * Belt-and-braces helper for true OS-level fullscreen. Strips decorations
 * before toggling fullscreen so the titlebar/taskbar animation cannot flash
 * into view on the way in, and reverses the order on the way out.
 *
 * The Rust window builder already applies these flags, but some platforms
 * (notably GNOME/Wayland) drop them when the window is re-presented, so we
 * re-apply from the webview as well.
 */
export async function setWindowFullscreenChromeless(on: boolean): Promise<void> {
  let w: ReturnType<typeof getCurrentWindow>;
  try {
    w = getCurrentWindow();
  } catch (err) {
    warn('ipc', 'getCurrentWindow unavailable', err);
    return;
  }
  try {
    if (on) {
      await w.setDecorations(false);
      await w.setFullscreen(true);
    } else {
      await w.setFullscreen(false);
      await w.setDecorations(true);
    }
  } catch (err) {
    warn('ipc', `setWindowFullscreenChromeless(${on}) failed`, err);
  }
}

/**
 * Exits OS fullscreen without restoring window decorations.
 *
 * Use this for windows that will be closed immediately after (e.g. the
 * presenter window, whose teardown is handled by Rust's
 * `close_presenter_window`). Restoring decorations here causes a brief
 * decorated-window flash between the fullscreen exit and the close.
 */
export async function exitWindowFullscreen(): Promise<void> {
  let w: ReturnType<typeof getCurrentWindow>;
  try {
    w = getCurrentWindow();
  } catch (err) {
    warn('ipc', 'getCurrentWindow unavailable', err);
    return;
  }
  try {
    await w.setFullscreen(false);
  } catch (err) {
    warn('ipc', 'exitWindowFullscreen failed', err);
  }
}
