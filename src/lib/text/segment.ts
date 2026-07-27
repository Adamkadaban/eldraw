/**
 * Splits text containing LaTeX delimiters into literal and math runs.
 *
 * Supported delimiters, in precedence order:
 *   `$$ … $$`  and  `\[ … \]`  -> display math
 *   `$ … $`    and  `\( … \)`  -> inline math
 *
 * A backslash-escaped `\$` is a literal dollar sign and never opens a run.
 * An unterminated delimiter is treated as literal text rather than swallowing
 * the rest of the string, so a stray `$` in prose stays readable.
 */

export type TextSegment =
  | { kind: 'text'; value: string }
  | { kind: 'math'; value: string; display: boolean };

interface Delimiter {
  open: string;
  close: string;
  display: boolean;
}

const DELIMITERS: Delimiter[] = [
  { open: '$$', close: '$$', display: true },
  { open: '\\[', close: '\\]', display: true },
  { open: '\\(', close: '\\)', display: false },
  { open: '$', close: '$', display: false },
];

/** True when the character at `index` is escaped by an odd run of backslashes. */
function isEscaped(source: string, index: number): boolean {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && source[i] === '\\'; i -= 1) backslashes += 1;
  return backslashes % 2 === 1;
}

function matchDelimiterAt(source: string, index: number): Delimiter | null {
  for (const delim of DELIMITERS) {
    if (!source.startsWith(delim.open, index)) continue;
    // `\(` and `\[` are themselves backslash sequences, so only the bare
    // dollar forms can be escaped by a preceding backslash.
    if (delim.open.startsWith('$') && isEscaped(source, index)) continue;
    return delim;
  }
  return null;
}

function findClose(source: string, from: number, delim: Delimiter): number {
  for (let i = from; i <= source.length - delim.close.length; i += 1) {
    if (!source.startsWith(delim.close, i)) continue;
    if (delim.close.startsWith('$') && isEscaped(source, i)) continue;
    return i;
  }
  return -1;
}

function pushText(out: TextSegment[], value: string): void {
  if (value.length === 0) return;
  const last = out[out.length - 1];
  if (last && last.kind === 'text') {
    last.value += value;
    return;
  }
  out.push({ kind: 'text', value });
}

/**
 * Replace `\$` with a literal `$` in text runs. Math runs keep their source
 * verbatim because KaTeX has its own escaping rules.
 */
export function unescapeDollars(value: string): string {
  return value.replace(/\\\$/g, '$');
}

export function segmentLatex(source: string): TextSegment[] {
  const out: TextSegment[] = [];
  let literalStart = 0;
  let i = 0;

  while (i < source.length) {
    const delim = matchDelimiterAt(source, i);
    if (!delim) {
      i += 1;
      continue;
    }

    const contentStart = i + delim.open.length;
    const closeAt = findClose(source, contentStart, delim);
    if (closeAt === -1) {
      // Unterminated: treat the opener as literal and keep scanning after it.
      i += delim.open.length;
      continue;
    }

    const content = source.slice(contentStart, closeAt);
    if (content.trim().length === 0) {
      // `$$` / `$ $` with nothing inside is almost certainly literal currency.
      i = closeAt + delim.close.length;
      continue;
    }

    pushText(out, unescapeDollars(source.slice(literalStart, i)));
    out.push({ kind: 'math', value: content, display: delim.display });
    i = closeAt + delim.close.length;
    literalStart = i;
  }

  pushText(out, unescapeDollars(source.slice(literalStart)));
  return out;
}

/** True when the source contains at least one explicit math delimiter run. */
export function hasExplicitMath(source: string): boolean {
  return segmentLatex(source).some((s) => s.kind === 'math');
}
