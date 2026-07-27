const FUNCTION_NAMES = [
  'sin',
  'cos',
  'tan',
  'sec',
  'csc',
  'cot',
  'log',
  'ln',
  'exp',
  'sqrt',
  'abs',
  'min',
  'max',
];
const GREEK_NAMES = [
  'alpha',
  'beta',
  'gamma',
  'delta',
  'epsilon',
  'zeta',
  'eta',
  'theta',
  'iota',
  'kappa',
  'lambda',
  'mu',
  'nu',
  'xi',
  'omicron',
  'pi',
  'rho',
  'sigma',
  'tau',
  'upsilon',
  'phi',
  'chi',
  'psi',
  'omega',
];

function replaceBareWords(
  source: string,
  words: string[],
  replacement: (word: string) => string,
): string {
  const pattern = new RegExp(`(^|[^\\\\A-Za-z])(${words.join('|')})(?![A-Za-z])`, 'g');
  return source.replace(
    pattern,
    (_match, prefix: string, word: string) => prefix + replacement(word),
  );
}

function normalizeBalancedSquareRoots(source: string): string {
  let out = '';
  let index = 0;

  while (index < source.length) {
    const isBareSqrt =
      source.startsWith('sqrt', index) &&
      !/[A-Za-z\\]/.test(source[index - 1] ?? '') &&
      !/[A-Za-z]/.test(source[index + 4] ?? '');
    if (!isBareSqrt) {
      out += source[index++];
      continue;
    }

    let open = index + 4;
    while (/\s/.test(source[open] ?? '')) open += 1;
    if (source[open] !== '(') {
      out += source[index++];
      continue;
    }

    let depth = 0;
    let close = -1;
    for (let cursor = open; cursor < source.length; cursor += 1) {
      if (source[cursor] === '(') depth += 1;
      if (source[cursor] === ')') depth -= 1;
      if (depth === 0) {
        close = cursor;
        break;
      }
    }
    if (close === -1) {
      out += source[index++];
      continue;
    }

    out += `\\sqrt{${normalizeMathSource(source.slice(open + 1, close))}}`;
    index = close + 1;
  }

  return out;
}

/**
 * Wrap multi-character sub/superscripts in braces.
 *
 * Digit runs and letter runs are handled separately and mixed runs are left
 * alone: TeX reads `x^2y` as `x²y`, so greedily wrapping it to `x^{2y}` would
 * silently change the formula's meaning rather than fix it.
 */
function wrapMultiCharacterScripts(source: string): string {
  return source
    .replace(/([_^])(\d{2,})(?![A-Za-z0-9])/g, '$1{$2}')
    .replace(/([_^])([A-Za-z]{2,})(?![A-Za-z0-9])/g, '$1{$2}');
}

/**
 * Replace shorthand with a LaTeX command.
 *
 * A control sequence swallows every letter that follows it, so `x<=y` would
 * become the undefined `\ley`. A separating space is emitted when the next
 * character is a letter; TeX discards it and the command terminates cleanly.
 */
function replaceOperator(source: string, pattern: RegExp, command: string): string {
  return source.replace(pattern, (match, ...rest) => {
    const offset = rest[rest.length - 2] as number;
    const input = rest[rest.length - 1] as string;
    const next = input[offset + match.length] ?? '';
    return /[A-Za-z]/.test(next) ? `${command} ` : command;
  });
}

function normalizeFunctions(source: string): string {
  const pattern = new RegExp(
    `(^|[^\\\\A-Za-z])(${FUNCTION_NAMES.join('|')})(?=\\(|\\s+(?:[({\\\\]|[A-Za-z0-9]))`,
    'g',
  );
  return source.replace(pattern, (_match, prefix: string, name: string) => {
    const command = name === 'abs' ? '\\operatorname{abs}' : `\\${name}`;
    return prefix + command;
  });
}

function escapeSpecialCharacters(source: string): string {
  let out = '';
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if ((char === '%' || char === '#' || char === '&') && source[index - 1] !== '\\') {
      out += '\\';
    }
    out += char;
  }
  return out;
}

/** Convert teacher-typed bare math to conservative, idempotent LaTeX. */
export function normalizeMathSource(raw: string): string {
  let source = normalizeBalancedSquareRoots(raw);
  source = wrapMultiCharacterScripts(source);
  source = replaceOperator(source, /\.\.\./g, '\\dots');
  source = replaceOperator(source, /<=/g, '\\le');
  source = replaceOperator(source, />=/g, '\\ge');
  source = replaceOperator(source, /!=/g, '\\ne');
  source = replaceOperator(source, /\+-/g, '\\pm');
  source = replaceOperator(source, /->/g, '\\to');
  source = replaceOperator(source, /\*/g, '\\cdot');
  source = replaceBareWords(source, ['oo', 'infty'], () => '\\infty');
  source = replaceBareWords(source, GREEK_NAMES, (name) => `\\${name}`);
  source = normalizeFunctions(source);
  return escapeSpecialCharacters(source);
}
