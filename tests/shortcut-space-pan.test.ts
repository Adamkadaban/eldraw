import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { viewport, viewportStore } from '$lib/store/viewport';
import { get } from 'svelte/store';
import { shortcuts } from '$lib/app/shortcuts';

type Listener = (event: unknown) => void;

class FakeEventTarget {
  listeners = new Map<string, Set<Listener>>();

  addEventListener(type: string, fn: Listener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }

  removeEventListener(type: string, fn: Listener): void {
    this.listeners.get(type)?.delete(fn);
  }

  emit(type: string, event: unknown = {}): void {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn(event);
  }

  count(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;

let fakeWindow: FakeEventTarget;
let fakeDocument: FakeEventTarget & { visibilityState: string };

/** The action reads `window`/`document` when invoked, so stubbing the globals
 *  before calling it is enough; no module cache juggling required. */
function mountShortcuts() {
  return shortcuts(null as never, undefined as never);
}

beforeEach(() => {
  fakeWindow = new FakeEventTarget();
  fakeDocument = Object.assign(new FakeEventTarget(), { visibilityState: 'visible' });
  Object.defineProperty(globalThis, 'window', { value: fakeWindow, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: fakeDocument, configurable: true });
  viewport.setPanMode(false);
});

afterEach(() => {
  Object.defineProperty(globalThis, 'window', { value: originalWindow, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: originalDocument, configurable: true });
  viewport.setPanMode(false);
});

function holdSpace(): void {
  fakeWindow.emit('keydown', { key: ' ', target: null, preventDefault: () => {} });
}

describe('space-hold pan mode', () => {
  it('enters pan mode while space is held and exits on keyup', () => {
    const action = mountShortcuts();
    holdSpace();
    expect(get(viewportStore).panMode).toBe(true);

    fakeWindow.emit('keyup', { key: ' ', target: null });
    expect(get(viewportStore).panMode).toBe(false);
    action?.destroy?.();
  });

  it('releases pan mode when the window loses focus', () => {
    const action = mountShortcuts();
    holdSpace();
    expect(get(viewportStore).panMode).toBe(true);

    // The keyup is delivered to whatever window took focus, never to us.
    fakeWindow.emit('blur');
    expect(get(viewportStore).panMode).toBe(false);
    action?.destroy?.();
  });

  it('releases pan mode when the page becomes hidden', () => {
    const action = mountShortcuts();
    holdSpace();
    fakeDocument.visibilityState = 'hidden';
    fakeDocument.emit('visibilitychange');
    expect(get(viewportStore).panMode).toBe(false);
    action?.destroy?.();
  });

  it('leaves pan mode alone on blur when space was never held', () => {
    const action = mountShortcuts();
    viewport.setPanMode(true);
    fakeWindow.emit('blur');
    expect(get(viewportStore).panMode).toBe(true);
    action?.destroy?.();
  });

  it('removes every listener it registered on destroy', () => {
    const action = mountShortcuts();
    expect(fakeWindow.count('blur')).toBe(1);
    action?.destroy?.();
    expect(fakeWindow.count('keydown')).toBe(0);
    expect(fakeWindow.count('keyup')).toBe(0);
    expect(fakeWindow.count('blur')).toBe(0);
    expect(fakeDocument.count('visibilitychange')).toBe(0);
  });
});
