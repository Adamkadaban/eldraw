import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const setDecorations = vi.fn().mockResolvedValue(undefined);
const setFullscreen = vi.fn().mockResolvedValue(undefined);
const getCurrentWindow = vi.fn(() => ({ setDecorations, setFullscreen }));

vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow }));

describe('setWindowFullscreenChromeless', () => {
  beforeEach(() => {
    setDecorations.mockClear();
    setFullscreen.mockClear();
    getCurrentWindow.mockClear();
  });
  afterEach(() => vi.resetModules());

  it('on enter: strips decorations before entering fullscreen', async () => {
    const { setWindowFullscreenChromeless } = await import('../src/lib/app/windowFullscreen');
    await setWindowFullscreenChromeless(true);
    expect(setDecorations).toHaveBeenCalledWith(false);
    expect(setFullscreen).toHaveBeenCalledWith(true);
    const decorationsOrder = setDecorations.mock.invocationCallOrder[0];
    const fullscreenOrder = setFullscreen.mock.invocationCallOrder[0];
    expect(decorationsOrder).toBeLessThan(fullscreenOrder);
  });

  it('on exit: leaves fullscreen before restoring decorations (zen-mode regression guard)', async () => {
    const { setWindowFullscreenChromeless } = await import('../src/lib/app/windowFullscreen');
    await setWindowFullscreenChromeless(false);
    expect(setFullscreen).toHaveBeenCalledWith(false);
    expect(setDecorations).toHaveBeenCalledWith(true);
    const fullscreenOrder = setFullscreen.mock.invocationCallOrder[0];
    const decorationsOrder = setDecorations.mock.invocationCallOrder[0];
    expect(fullscreenOrder).toBeLessThan(decorationsOrder);
  });

  it('swallows errors from the window API', async () => {
    setFullscreen.mockRejectedValueOnce(new Error('boom'));
    const { setWindowFullscreenChromeless } = await import('../src/lib/app/windowFullscreen');
    await expect(setWindowFullscreenChromeless(true)).resolves.toBeUndefined();
  });

  it('returns early if the window API is unavailable', async () => {
    getCurrentWindow.mockImplementationOnce(() => {
      throw new Error('no window');
    });
    const { setWindowFullscreenChromeless } = await import('../src/lib/app/windowFullscreen');
    await expect(setWindowFullscreenChromeless(true)).resolves.toBeUndefined();
    expect(setDecorations).not.toHaveBeenCalled();
    expect(setFullscreen).not.toHaveBeenCalled();
  });
});

describe('exitWindowFullscreen', () => {
  beforeEach(() => {
    setDecorations.mockClear();
    setFullscreen.mockClear();
    getCurrentWindow.mockClear();
  });
  afterEach(() => vi.resetModules());

  it('exits fullscreen without restoring decorations', async () => {
    const { exitWindowFullscreen } = await import('../src/lib/app/windowFullscreen');
    await exitWindowFullscreen();
    expect(setFullscreen).toHaveBeenCalledWith(false);
    expect(setDecorations).not.toHaveBeenCalled();
  });

  it('swallows errors from the window API', async () => {
    setFullscreen.mockRejectedValueOnce(new Error('boom'));
    const { exitWindowFullscreen } = await import('../src/lib/app/windowFullscreen');
    await expect(exitWindowFullscreen()).resolves.toBeUndefined();
  });

  it('returns early if the window API is unavailable', async () => {
    getCurrentWindow.mockImplementationOnce(() => {
      throw new Error('no window');
    });
    const { exitWindowFullscreen } = await import('../src/lib/app/windowFullscreen');
    await expect(exitWindowFullscreen()).resolves.toBeUndefined();
    expect(setFullscreen).not.toHaveBeenCalled();
  });
});

describe('presenter window teardown', () => {
  const presenterSource = readFileSync(
    fileURLToPath(new URL('../src/routes/presenter/+page.svelte', import.meta.url)),
    'utf8',
  );

  it('does not restore window decorations from JS on Escape or destroy', () => {
    // Restoring decorations (via setWindowFullscreenChromeless(false)) between
    // the fullscreen exit and window close produces a brief decorated-window
    // flash. The Rust `close_presenter_window` command exits fullscreen
    // before closing, so the JS side must not re-chrome the window.
    expect(presenterSource).not.toMatch(/setWindowFullscreenChromeless\(\s*false\s*\)/);
    expect(presenterSource).not.toMatch(/exitWindowFullscreen\s*\(/);
  });

  it('still enters chromeless fullscreen on mount', () => {
    expect(presenterSource).toMatch(/setWindowFullscreenChromeless\(\s*true\s*\)/);
  });
});
