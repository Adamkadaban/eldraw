/**
 * Recursive-descent parser for real-valued expressions of a single variable x.
 *
 * Grammar (precedence low → high):
 *   expr   := term (('+' | '-') term)*
 *   term   := unary (('*' | '/') unary)*
 *   unary  := ('+' | '-') unary | factor
 *   factor := primary ('^' factor)?         // '^' is right-associative and
 *                                           // binds tighter than unary minus
 *                                           // so that `-2^2 == -4`.
 *   primary := number | ident | call | '(' expr ')'
 *   call   := ident '(' expr ')'
 *
 * Scientific notation is intentionally unsupported to avoid clashing with the
 * constant `e`; write `2*10^3` instead of `2e3`.
 */

export type CompiledFn = (x: number) => number;

export type ParseResult = { ok: true; fn: CompiledFn } | { ok: false; error: string };

type BinOp = '+' | '-' | '*' | '/' | '^';

type Tok =
  | { k: 'num'; v: number }
  | { k: 'ident'; v: string }
  | { k: 'op'; v: BinOp }
  | { k: 'lp' }
  | { k: 'rp' };

const FUNCTIONS: Record<string, (n: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  log: Math.log10,
  ln: Math.log,
  exp: Math.exp,
  sqrt: Math.sqrt,
  abs: Math.abs,
};

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

class ParseError extends Error {}

function isDigit(c: string): boolean {
  return c >= '0' && c <= '9';
}

function isAlpha(c: string): boolean {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
}

function isAlphaNum(c: string): boolean {
  return isAlpha(c) || isDigit(c);
}

function tokenize(src: string): Tok[] {
  const tokens: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i += 1;
      continue;
    }
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1] ?? ''))) {
      let j = i;
      let sawDot = false;
      while (j < src.length) {
        const ch = src[j];
        if (ch === '.') {
          if (sawDot) throw new ParseError(`invalid number at position ${i}`);
          sawDot = true;
          j += 1;
        } else if (isDigit(ch)) {
          j += 1;
        } else {
          break;
        }
      }
      const v = Number(src.slice(i, j));
      if (!Number.isFinite(v)) throw new ParseError(`invalid number at position ${i}`);
      tokens.push({ k: 'num', v });
      i = j;
      continue;
    }
    if (isAlpha(c)) {
      let j = i;
      while (j < src.length && isAlphaNum(src[j])) j += 1;
      tokens.push({ k: 'ident', v: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === '+' || c === '-' || c === '*' || c === '/' || c === '^') {
      tokens.push({ k: 'op', v: c });
      i += 1;
      continue;
    }
    if (c === '(') {
      tokens.push({ k: 'lp' });
      i += 1;
      continue;
    }
    if (c === ')') {
      tokens.push({ k: 'rp' });
      i += 1;
      continue;
    }
    throw new ParseError(`unexpected character '${c}' at position ${i}`);
  }
  return tokens;
}

interface Cursor {
  toks: Tok[];
  pos: number;
}

function peek(c: Cursor): Tok | undefined {
  return c.toks[c.pos];
}

function consume(c: Cursor): Tok {
  const t = c.toks[c.pos];
  if (!t) throw new ParseError('unexpected end of expression');
  c.pos += 1;
  return t;
}

function parseExpr(c: Cursor): CompiledFn {
  let left = parseTerm(c);
  while (true) {
    const t = peek(c);
    if (!t || t.k !== 'op' || (t.v !== '+' && t.v !== '-')) break;
    consume(c);
    const right = parseTerm(c);
    const op = t.v;
    const l = left;
    left = op === '+' ? (x) => l(x) + right(x) : (x) => l(x) - right(x);
  }
  return left;
}

function parseTerm(c: Cursor): CompiledFn {
  let left = parseUnary(c);
  while (true) {
    const t = peek(c);
    if (!t || t.k !== 'op' || (t.v !== '*' && t.v !== '/')) break;
    consume(c);
    const right = parseUnary(c);
    const op = t.v;
    const l = left;
    left = op === '*' ? (x) => l(x) * right(x) : (x) => l(x) / right(x);
  }
  return left;
}

function parseUnary(c: Cursor): CompiledFn {
  const t = peek(c);
  if (t && t.k === 'op' && (t.v === '+' || t.v === '-')) {
    consume(c);
    const inner = parseUnary(c);
    return t.v === '-' ? (x) => -inner(x) : inner;
  }
  return parseFactor(c);
}

function parseFactor(c: Cursor): CompiledFn {
  const base = parsePrimary(c);
  const t = peek(c);
  if (t && t.k === 'op' && t.v === '^') {
    consume(c);
    const exp = parseFactor(c);
    return (x) => Math.pow(base(x), exp(x));
  }
  return base;
}

function parsePrimary(c: Cursor): CompiledFn {
  const t = consume(c);
  if (t.k === 'num') {
    const v = t.v;
    return () => v;
  }
  if (t.k === 'lp') {
    const inner = parseExpr(c);
    const close = consume(c);
    if (close.k !== 'rp') throw new ParseError("expected ')'");
    return inner;
  }
  if (t.k === 'ident') {
    const name = t.v;
    const next = peek(c);
    if (next && next.k === 'lp') {
      consume(c);
      const arg = parseExpr(c);
      const close = consume(c);
      if (close.k !== 'rp') throw new ParseError("expected ')'");
      const fn = FUNCTIONS[name];
      if (!fn) throw new ParseError(`unknown function '${name}'`);
      return (x) => fn(arg(x));
    }
    if (name === 'x') return (x) => x;
    const constant = CONSTANTS[name];
    if (constant !== undefined) return () => constant;
    throw new ParseError(`unknown identifier '${name}'`);
  }
  throw new ParseError('unexpected token');
}

export function parseExpression(src: string): ParseResult {
  try {
    const trimmed = src.trim();
    if (trimmed.length === 0) return { ok: false, error: 'empty expression' };
    const toks = tokenize(trimmed);
    const cursor: Cursor = { toks, pos: 0 };
    const fn = parseExpr(cursor);
    if (cursor.pos !== toks.length) {
      return { ok: false, error: `unexpected token at position ${cursor.pos}` };
    }
    return { ok: true, fn };
  } catch (err) {
    if (err instanceof ParseError) return { ok: false, error: err.message };
    throw err;
  }
}
