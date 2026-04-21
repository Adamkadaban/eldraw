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
