import { segmentLatex, type TextSegment } from './segment';

const FUNCTION_NAMES = new Set([
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
]);

const GREEK_NAMES = new Set([
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
]);

const CONSTANT_NAMES = new Set(['oo', 'infty']);
const RELATIONS = new Set(['=', '<', '>', '<=', '>=', '!=', '=>', '≠', '≤', '≥']);
const OPERATORS = [
  '<=',
  '>=',
  '!=',
  '=>',
  '->',
  '+-',
  '+',
  '-',
  '*',
  '/',
  '^',
  '_',
  '=',
  '<',
  '>',
  '≤',
  '≥',
  '≠',
  '±',
];

type TokenKind =
  | 'number'
  | 'word'
  | 'control'
  | 'operator'
  | 'bracket'
  | 'punctuation'
  | 'space'
  | 'other';

interface Token {
  kind: TokenKind;
  value: string;
  start: number;
  end: number;
  recognizedWord?: boolean;
  scriptOperand?: boolean;
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const start = index;
    const char = source[index];

    if (char === '\n' || char === '\r') {
      tokens.push({ kind: 'other', value: char, start, end: ++index });
      continue;
    }

    if (char === ' ' || char === '\t') {
      while (source[index] === ' ' || source[index] === '\t') index += 1;
      tokens.push({ kind: 'space', value: source.slice(start, index), start, end: index });
      continue;
    }

    if (char === '\\' && /[A-Za-z]/.test(source[index + 1] ?? '')) {
      index += 2;
      while (/[A-Za-z]/.test(source[index] ?? '')) index += 1;
      tokens.push({ kind: 'control', value: source.slice(start, index), start, end: index });
      continue;
    }

    if (/\d/.test(char) || (char === '.' && /\d/.test(source[index + 1] ?? ''))) {
      if (char === '.') index += 1;
      while (/\d/.test(source[index] ?? '')) index += 1;
      if (source[index] === '.' && /\d/.test(source[index + 1] ?? '')) {
        index += 1;
        while (/\d/.test(source[index] ?? '')) index += 1;
      }
      tokens.push({ kind: 'number', value: source.slice(start, index), start, end: index });
      continue;
    }

    if (/[A-Za-z]/.test(char)) {
      index += 1;
      while (/[A-Za-z]/.test(source[index] ?? '')) index += 1;
      const value = source.slice(start, index);
      const lower = value.toLowerCase();
      tokens.push({
        kind: 'word',
        value,
        start,
        end: index,
        recognizedWord:
          value.length === 1 ||
          FUNCTION_NAMES.has(lower) ||
          GREEK_NAMES.has(lower) ||
          CONSTANT_NAMES.has(lower),
      });
      continue;
    }

    const operator = OPERATORS.find((candidate) => source.startsWith(candidate, index));
    if (operator) {
      index += operator.length;
      tokens.push({ kind: 'operator', value: operator, start, end: index });
      continue;
    }

    if ('()[]{}'.includes(char)) {
      tokens.push({ kind: 'bracket', value: char, start, end: ++index });
      continue;
    }

    if (char === ',' || char === '.') {
      tokens.push({ kind: 'punctuation', value: char, start, end: ++index });
      continue;
    }

    tokens.push({ kind: 'other', value: char, start, end: ++index });
  }

  return tokens;
}

function previousSignificant(tokens: Token[], from: number): Token | undefined {
  for (let index = from; index >= 0; index -= 1) {
    if (tokens[index].kind !== 'space' && tokens[index].kind !== 'punctuation') {
      return tokens[index];
    }
  }
  return undefined;
}

function nextSignificant(tokens: Token[], from: number): Token | undefined {
  for (let index = from; index < tokens.length; index += 1) {
    if (tokens[index].kind !== 'space' && tokens[index].kind !== 'punctuation') {
      return tokens[index];
    }
  }
  return undefined;
}

function isLeftOperand(token: Token | undefined): boolean {
  if (!token) return false;
  if (token.kind === 'number' || token.kind === 'control') return true;
  if (token.kind === 'word') return token.recognizedWord === true || token.scriptOperand === true;
  return token.kind === 'bracket' && ')]}'.includes(token.value);
}

function isRightOperand(token: Token | undefined): boolean {
  if (!token) return false;
  if (token.kind === 'number' || token.kind === 'control') return true;
  if (token.kind === 'word') return token.recognizedWord === true || token.scriptOperand === true;
  return token.kind === 'bracket' && '([{'.includes(token.value);
}

function hasOperandAfter(tokens: Token[], from: number): boolean {
  let token = nextSignificant(tokens, from);
  if (token?.kind === 'operator' && (token.value === '+' || token.value === '-')) {
    const signIndex = tokens.indexOf(token);
    token = nextSignificant(tokens, signIndex + 1);
  }
  return isRightOperand(token);
}

function hasStrongSignal(source: string, tokens: Token[]): boolean {
  if (tokens.some((token) => token.kind === 'control')) return true;
  if (/\d[A-Za-z]/.test(source) || source.includes(')(')) return true;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.kind !== 'operator') continue;

    if (
      RELATIONS.has(token.value) &&
      isLeftOperand(previousSignificant(tokens, index - 1)) &&
      hasOperandAfter(tokens, index + 1)
    ) {
      return true;
    }

    if (
      (token.value === '^' || token.value === '_') &&
      isLeftOperand(previousSignificant(tokens, index - 1)) &&
      hasOperandAfter(tokens, index + 1)
    ) {
      return true;
    }
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const callable =
      token.kind === 'control' ||
      (token.kind === 'word' &&
        (token.value.length === 1 || FUNCTION_NAMES.has(token.value.toLowerCase())));
    if (!callable) continue;
    const next = nextSignificant(tokens, index + 1);
    if (next?.kind === 'bracket' && next.value === '(') return true;
  }

  return false;
}

function hasProseSequence(tokens: Token[]): boolean {
  let consecutive = 0;
  for (const token of tokens) {
    if (
      token.kind === 'word' &&
      token.value.length >= 3 &&
      token.recognizedWord !== true &&
      token.scriptOperand !== true
    ) {
      consecutive += 1;
      if (consecutive >= 2) return true;
    } else if (token.kind !== 'space') {
      consecutive = 0;
    }
  }
  return false;
}

function candidateLooksLikeMath(source: string, tokens: Token[]): boolean {
  const meaningful = tokens.filter(
    (token) =>
      token.kind !== 'space' &&
      token.kind !== 'punctuation' &&
      !(token.kind === 'bracket' && '()[]{}'.includes(token.value)),
  );
  if (meaningful.length === 0 || hasProseSequence(tokens) || !hasBalancedBrackets(tokens)) {
    return false;
  }
  return hasStrongSignal(source, tokens);
}

function hasBalancedBrackets(tokens: Token[]): boolean {
  const stack: string[] = [];
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  for (const token of tokens) {
    if (token.kind !== 'bracket') continue;
    if ('([{'.includes(token.value)) {
      stack.push(token.value);
    } else if (stack.pop() !== pairs[token.value]) {
      return false;
    }
  }
  return stack.length === 0;
}

function trimCandidate(tokens: Token[]): Token[] {
  let start = 0;
  let end = tokens.length;

  while (start < end && (tokens[start].kind === 'space' || tokens[start].kind === 'punctuation')) {
    start += 1;
  }
  while (
    end > start &&
    (tokens[end - 1].kind === 'space' || tokens[end - 1].kind === 'punctuation')
  ) {
    end -= 1;
  }

  return tokens.slice(start, end);
}

function canJoinCandidate(token: Token, candidate: Token[]): boolean {
  if (token.kind === 'other') return false;
  if (token.kind !== 'word' || token.recognizedWord) return true;

  const previous = previousSignificant(candidate, candidate.length - 1);
  if (previous?.kind === 'operator' && (previous.value === '^' || previous.value === '_')) {
    token.scriptOperand = true;
    return true;
  }
  const significant = candidate.filter(
    (candidateToken) => candidateToken.kind !== 'space' && candidateToken.kind !== 'punctuation',
  );
  const beforePrevious = significant[significant.length - 2];
  if (
    previous?.kind === 'bracket' &&
    previous.value === '{' &&
    beforePrevious?.kind === 'operator' &&
    (beforePrevious.value === '^' || beforePrevious.value === '_')
  ) {
    token.scriptOperand = true;
    return true;
  }
  return false;
}

function pushSegment(out: TextSegment[], segment: TextSegment): void {
  if (segment.value.length === 0) return;
  const previous = out[out.length - 1];
  if (previous?.kind === 'text' && segment.kind === 'text') {
    previous.value += segment.value;
    return;
  }
  out.push(segment);
}

/** Detect conservative, undelimited math runs while leaving prose untouched. */
export function detectMathSegments(source: string): TextSegment[] {
  const tokens = tokenize(source);
  const ranges: Array<{ start: number; end: number }> = [];
  let candidate: Token[] = [];

  const flush = () => {
    const trimmed = trimCandidate(candidate);
    if (trimmed.length > 0) {
      const start = trimmed[0].start;
      const end = trimmed[trimmed.length - 1].end;
      if (candidateLooksLikeMath(source.slice(start, end), trimmed)) ranges.push({ start, end });
    }
    candidate = [];
  };

  for (const token of tokens) {
    if (canJoinCandidate(token, candidate)) {
      if (token.kind !== 'space' || candidate.length > 0) candidate.push(token);
    } else {
      flush();
    }
  }
  flush();

  if (ranges.length === 0) return source.length === 0 ? [] : [{ kind: 'text', value: source }];

  const out: TextSegment[] = [];
  let cursor = 0;
  for (const range of ranges) {
    pushSegment(out, { kind: 'text', value: source.slice(cursor, range.start) });
    pushSegment(out, {
      kind: 'math',
      value: source.slice(range.start, range.end),
      display: false,
    });
    cursor = range.end;
  }
  pushSegment(out, { kind: 'text', value: source.slice(cursor) });
  return out;
}

/** Explicit delimiters take precedence; auto-detection only visits literal runs. */
export function autoSegment(source: string): TextSegment[] {
  const out: TextSegment[] = [];
  for (const segment of segmentLatex(source)) {
    if (segment.kind === 'math') {
      pushSegment(out, segment);
      continue;
    }
    for (const detected of detectMathSegments(segment.value)) pushSegment(out, detected);
  }
  return out;
}

export function looksLikeMath(candidate: string): boolean {
  const trimmed = candidate.trim();
  const segments = detectMathSegments(trimmed);
  return segments.length === 1 && segments[0].kind === 'math' && segments[0].value === trimmed;
}
