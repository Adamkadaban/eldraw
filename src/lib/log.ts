/**
 * Toggleable debug logger. Enable with `localStorage.ELDRAW_DEBUG=1` or
 * `?eldrawDebug=1` in the URL. Off by default so production is quiet.
 *
 * Output goes to the webview console; in a Tauri build the user can open
 * devtools (Ctrl+Shift+I) or pipe logs through `tauri-plugin-log` later.
 */

type Scope = 'tool' | 'live' | 'shape' | 'temp-ink' | 'laser' | 'render' | 'page' | 'doc' | 'ipc';

let enabled = false;

function detect(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.localStorage?.getItem('ELDRAW_DEBUG') === '1') return true;
  } catch {
    // localStorage may be disabled.
  }
  const qs = new URLSearchParams(window.location.search);
  return qs.get('eldrawDebug') === '1';
}

export function initDebugLogger(): void {
  enabled = detect();
  if (enabled && typeof window !== 'undefined') {
    // Expose a runtime toggle so the user can flip it in devtools.
    (window as unknown as { eldrawDebug: (on: boolean) => void }).eldrawDebug = (on: boolean) => {
      enabled = on;
      try {
        window.localStorage.setItem('ELDRAW_DEBUG', on ? '1' : '0');
      } catch {
        // ignore
      }
      console.info(`[eldraw] debug logging ${on ? 'ON' : 'OFF'}`);
    };
    console.info('[eldraw] debug logging ON (set window.eldrawDebug(false) to stop)');
  }
}

export function log(scope: Scope, message: string, data?: unknown): void {
  if (!enabled) return;
  if (data === undefined) {
    console.log(`[eldraw:${scope}] ${message}`);
  } else {
    console.log(`[eldraw:${scope}] ${message}`, data);
  }
}

export function warn(scope: Scope, message: string, data?: unknown): void {
  if (data === undefined) {
    console.warn(`[eldraw:${scope}] ${message}`);
  } else {
    console.warn(`[eldraw:${scope}] ${message}`, data);
  }
}

export function isDebugEnabled(): boolean {
  return enabled;
}
