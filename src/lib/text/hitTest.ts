import type { TextObject } from '$lib/types';

export interface TextBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Approximate bounds (in PDF points) of a TextObject, using a rough character-
 * width heuristic. Sufficient for hit-testing a click on the object; accurate
 * layout is done by the browser when rendered.
 *
 * For LaTeX objects we fall back to a generous estimate because their rendered
 * width depends on KaTeX output and fonts.
 */
export function estimateTextBounds(obj: TextObject): TextBounds {
  const fontSize = obj.fontSize;
  const lines = obj.content.length === 0 ? [''] : obj.content.split('\n');
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const avgCharWidth = fontSize * (obj.latex ? 0.7 : 0.55);
  const width = Math.max(fontSize, longest * avgCharWidth);
  const height = Math.max(fontSize, lines.length * fontSize * 1.2);
  return { x: obj.at.x, y: obj.at.y, width, height };
}

export function hitTestTextObject(
  obj: TextObject,
  at: { x: number; y: number },
  padding = 0,
): boolean {
  const b = estimateTextBounds(obj);
  return (
    at.x >= b.x - padding &&
    at.x <= b.x + b.width + padding &&
    at.y >= b.y - padding &&
    at.y <= b.y + b.height + padding
  );
}

export function hitTestTextObjects(
  objects: readonly TextObject[],
  at: { x: number; y: number },
  padding = 0,
): TextObject | null {
  for (let i = objects.length - 1; i >= 0; i -= 1) {
    if (hitTestTextObject(objects[i], at, padding)) return objects[i];
  }
  return null;
}
