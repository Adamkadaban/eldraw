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

  it('on exit: leaves fullscreen before restoring decorations', async () => {
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
