import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { zen, chromeVisibility, registerZenFullscreenBridge } from '../src/lib/store/zen';

describe('zen store', () => {
  beforeEach(() => zen.reset());

  it('starts inactive', () => {
    expect(get(zen).active).toBe(false);
    expect(zen.isActive()).toBe(false);
  });

  it('enter activates and is idempotent', () => {
    zen.enter();
    expect(zen.isActive()).toBe(true);
    zen.enter();
    expect(zen.isActive()).toBe(true);
  });

  it('exit deactivates and is idempotent', () => {
    zen.enter();
    zen.exit();
    expect(zen.isActive()).toBe(false);
    zen.exit();
    expect(zen.isActive()).toBe(false);
  });

  it('toggle flips state', () => {
    zen.toggle();
    expect(zen.isActive()).toBe(true);
    zen.toggle();
    expect(zen.isActive()).toBe(false);
  });

  it('reset returns to inactive', () => {
    zen.enter();
    zen.reset();
    expect(zen.isActive()).toBe(false);
  });

  it('toggle emits to subscribers on each state change', () => {
    const observed: boolean[] = [];
    const unsubscribe = zen.subscribe((s) => observed.push(s.active));
    zen.toggle();
    zen.toggle();
    unsubscribe();
    expect(observed).toEqual([false, true, false]);
  });
});

describe('zen fullscreen bridge', () => {
  const setFullscreen = vi.fn();

  beforeEach(() => {
    zen.reset();
    setFullscreen.mockClear();
    registerZenFullscreenBridge({ setFullscreen });
  });
  afterEach(() => registerZenFullscreenBridge(null));

  it('enter calls the bridge with true', () => {
    zen.enter();
    expect(setFullscreen).toHaveBeenCalledTimes(1);
    expect(setFullscreen).toHaveBeenCalledWith(true);
  });

  it('enter is idempotent and only calls the bridge on state change', () => {
    zen.enter();
    zen.enter();
    expect(setFullscreen).toHaveBeenCalledTimes(1);
  });

  it('exit calls the bridge with false', () => {
    zen.enter();
    setFullscreen.mockClear();
    zen.exit();
    expect(setFullscreen).toHaveBeenCalledTimes(1);
    expect(setFullscreen).toHaveBeenCalledWith(false);
  });

  it('toggle drives the bridge on every flip', () => {
    zen.toggle();
    zen.toggle();
    expect(setFullscreen.mock.calls.map((c) => c[0])).toEqual([true, false]);
  });

  it('reset exits fullscreen when zen was active', () => {
    zen.enter();
    setFullscreen.mockClear();
    zen.reset();
    expect(setFullscreen).toHaveBeenCalledWith(false);
  });

  it('reset does not call the bridge when zen was already inactive', () => {
    zen.reset();
    expect(setFullscreen).not.toHaveBeenCalled();
  });

  it('unregistering the bridge stops bridge calls', () => {
    registerZenFullscreenBridge(null);
    zen.toggle();
    expect(setFullscreen).not.toHaveBeenCalled();
  });
});

describe('chromeVisibility', () => {
  it('shows all chrome in default editing view', () => {
    expect(
      chromeVisibility({ zen: false, presenter: false, sidebarDetached: false, hasPages: true }),
    ).toEqual({ topbar: true, sidebar: true, thumbnails: true });
  });

  it('hides everything when zen is active, even with pinned sidebar and pages', () => {
    expect(
      chromeVisibility({ zen: true, presenter: false, sidebarDetached: false, hasPages: true }),
    ).toEqual({ topbar: false, sidebar: false, thumbnails: false });
  });

  it('hides everything when presenter is active', () => {
    expect(
      chromeVisibility({ zen: false, presenter: true, sidebarDetached: false, hasPages: true }),
    ).toEqual({ topbar: false, sidebar: false, thumbnails: false });
  });

  it('hides inline sidebar when detached but keeps topbar and thumbs', () => {
    expect(
      chromeVisibility({ zen: false, presenter: false, sidebarDetached: true, hasPages: true }),
    ).toEqual({ topbar: true, sidebar: false, thumbnails: true });
  });

  it('hides thumbnails when no pages are loaded', () => {
    expect(
      chromeVisibility({ zen: false, presenter: false, sidebarDetached: false, hasPages: false }),
    ).toEqual({ topbar: true, sidebar: true, thumbnails: false });
  });

  it('zen overrides sidebarDetached flag (everything hidden)', () => {
    expect(
      chromeVisibility({ zen: true, presenter: false, sidebarDetached: true, hasPages: true }),
    ).toEqual({ topbar: false, sidebar: false, thumbnails: false });
  });
});
