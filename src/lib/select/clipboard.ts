import type { AnyObject } from '$lib/types';
import { translateObject } from './transform';
import { boundsOfObjects } from './selection';

interface ClipboardEntry {
  objects: AnyObject[];
}

let clipboard: ClipboardEntry | null = null;

export function hasClipboardContents(): boolean {
  return clipboard !== null && clipboard.objects.length > 0;
}

export function setClipboard(objects: readonly AnyObject[]): void {
  clipboard = { objects: objects.map(cloneObject) };
}

export function readClipboard(): AnyObject[] | null {
  if (!clipboard || clipboard.objects.length === 0) return null;
  return clipboard.objects.map(cloneObject);
}

function cloneObject(o: AnyObject): AnyObject {
  return structuredClone(o);
}

/**
 * Produce a list of objects positioned for paste. `target` is where the
 * paste origin should land (cursor position, or page center). The original
 * selection's top-left is rewritten to `target`; new ids are assigned.
 */
export function stampForPaste(
  source: readonly AnyObject[],
  target: { x: number; y: number },
): AnyObject[] {
  if (source.length === 0) return [];
  const bounds = boundsOfObjects(source);
  const originX = bounds?.x ?? 0;
  const originY = bounds?.y ?? 0;
  const dx = target.x - originX;
  const dy = target.y - originY;
  return source.map((o) => {
    const moved = translateObject(o, dx, dy);
    return { ...moved, id: crypto.randomUUID(), createdAt: Date.now() } as AnyObject;
  });
}

export function duplicateInPlace(source: readonly AnyObject[], offset = 16): AnyObject[] {
  return source.map((o) => {
    const moved = translateObject(o, offset, offset);
    return { ...moved, id: crypto.randomUUID(), createdAt: Date.now() } as AnyObject;
  });
}

/** Test-only escape hatch to reset clipboard state between tests. */
export function __resetClipboardForTests(): void {
  clipboard = null;
}
