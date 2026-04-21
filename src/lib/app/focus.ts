const TEXT_INPUT_TYPES = new Set(['text', 'number', 'search', 'url', 'email', 'password', 'tel']);

/**
 * True when `target` is an element that accepts free-form text entry: a text-like
 * `<input>`, a `<textarea>`, or anything with `isContentEditable`. Non-text inputs
 * (checkbox, color, range, file, ...) and `<select>` are intentionally excluded so
 * the caller can decide how to treat them separately from typing surfaces.
 */
export function isTextInput(target: EventTarget | null): boolean {
  if (target === null) return false;
  const t = target as { tagName?: unknown; type?: unknown; isContentEditable?: unknown };
  if (t.isContentEditable === true) return true;
  if (typeof t.tagName !== 'string') return false;
  if (t.tagName === 'TEXTAREA') return true;
  if (t.tagName === 'INPUT') {
    const type = typeof t.type === 'string' ? t.type.toLowerCase() : 'text';
    return TEXT_INPUT_TYPES.has(type);
  }
  return false;
}
