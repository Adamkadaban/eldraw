export interface ParsedKey {
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

const MOD_NAMES = new Set(['ctrl', 'control', 'shift', 'alt', 'meta', 'cmd', 'command']);

/**
 * Parse a human-readable shortcut string like "Ctrl+Shift+Z" into a structured key.
 * Non-modifier segments after the last `+` are treated as the key (case-preserved for
 * named keys like ArrowLeft, lowercased for single characters).
 */
export function parseShortcut(spec: string): ParsedKey {
  const parts = spec
    .split('+')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) {
    throw new Error(`empty shortcut: "${spec}"`);
  }

  let ctrl = false;
  let shift = false;
  let alt = false;
  let meta = false;
  let key: string | null = null;

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (MOD_NAMES.has(lower)) {
      if (lower === 'ctrl' || lower === 'control') ctrl = true;
      else if (lower === 'shift') shift = true;
      else if (lower === 'alt') alt = true;
      else meta = true;
    } else {
      key = part.length === 1 ? part.toLowerCase() : part;
    }
  }

  if (key === null) {
    throw new Error(`shortcut "${spec}" has no non-modifier key`);
  }
  return { key, ctrl, shift, alt, meta };
}

/** Does a DOM KeyboardEvent match the parsed shortcut? */
export function matchesEvent(parsed: ParsedKey, event: KeyboardEvent): boolean {
  if (parsed.ctrl !== event.ctrlKey) return false;
  if (parsed.shift !== event.shiftKey) return false;
  if (parsed.alt !== event.altKey) return false;
  if (parsed.meta !== event.metaKey) return false;
  const eventKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  return eventKey === parsed.key;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (target === null) return false;
  const t = target as { tagName?: unknown; isContentEditable?: unknown };
  if (typeof t.tagName === 'string') {
    const tag = t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  }
  return t.isContentEditable === true;
}
