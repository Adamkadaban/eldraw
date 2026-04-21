export interface ParsedKey {
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  /** If true, either Ctrl or Meta satisfies the match (mapped from `Mod`/`CmdOrCtrl`). */
  modOrMeta: boolean;
}

const MOD_NAMES = new Set([
  'ctrl',
  'control',
  'shift',
  'alt',
  'meta',
  'cmd',
  'command',
  'mod',
  'cmdorctrl',
]);

/**
 * Parse a human-readable shortcut string like "Ctrl+Shift+Z" into a structured key.
 * Non-modifier segments after the last `+` are treated as the key (case-preserved for
 * named keys like ArrowLeft, lowercased for single characters).
 *
 * The `Mod` (alias `CmdOrCtrl`) modifier matches either Ctrl or Meta, so a single
 * binding works on both Windows/Linux and macOS.
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
  let modOrMeta = false;
  let key: string | null = null;

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (MOD_NAMES.has(lower)) {
      if (lower === 'ctrl' || lower === 'control') ctrl = true;
      else if (lower === 'shift') shift = true;
      else if (lower === 'alt') alt = true;
      else if (lower === 'mod' || lower === 'cmdorctrl') modOrMeta = true;
      else meta = true;
    } else if (lower === 'space') {
      key = ' ';
    } else {
      key = part.length === 1 ? part.toLowerCase() : part;
    }
  }

  if (key === null) {
    throw new Error(`shortcut "${spec}" has no non-modifier key`);
  }
  return { key, ctrl, shift, alt, meta, modOrMeta };
}

/** Does a DOM KeyboardEvent match the parsed shortcut? */
export function matchesEvent(parsed: ParsedKey, event: KeyboardEvent): boolean {
  if (parsed.modOrMeta) {
    if (!(event.ctrlKey || event.metaKey)) return false;
  } else {
    if (parsed.ctrl !== event.ctrlKey) return false;
    if (parsed.meta !== event.metaKey) return false;
  }
  if (parsed.shift !== event.shiftKey) return false;
  if (parsed.alt !== event.altKey) return false;
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

/**
 * Format a KeyboardEvent back into a canonical shortcut spec (e.g. "Ctrl+Shift+Z").
 * Single-character keys are uppercased for display; named keys (ArrowLeft, F5, Tab)
 * keep their canonical name.
 */
export function formatEvent(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.metaKey) parts.push('Meta');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');

  let key = event.key;
  if (key === ' ') key = 'Space';
  if (key.length === 1) key = key.toUpperCase();
  parts.push(key);
  return parts.join('+');
}

/** Pretty-print a stored spec (normalizes case on modifiers). */
export function formatSpec(spec: string): string {
  try {
    const parsed = parseShortcut(spec);
    const parts: string[] = [];
    if (parsed.modOrMeta) parts.push('Mod');
    if (parsed.ctrl) parts.push('Ctrl');
    if (parsed.meta) parts.push('Meta');
    if (parsed.alt) parts.push('Alt');
    if (parsed.shift) parts.push('Shift');
    const key =
      parsed.key === ' '
        ? 'Space'
        : parsed.key.length === 1
          ? parsed.key.toUpperCase()
          : parsed.key;
    parts.push(key);
    return parts.join('+');
  } catch {
    return spec;
  }
}
