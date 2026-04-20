/**
 * Recursive-descent parser for real-valued expressions of one or two
 * variables.
 *
 * Grammar (precedence low → high):
 *   expr   := term (('+' | '-') term)*
 *   term   := unary (('*' | '/') unary)*
 *   unary  := ('+' | '-') unary | factor
 *   factor := primary ('^' factor)?         // right-associative and tighter
 *                                           // than unary minus so `-2^2 == -4`.
 *   primary := number | ident | call | '(' expr ')'
 *   call   := ident '(' expr ')'
 *
 * `parseExpression` compiles a single-variable expression in `x`.
 * `parseExpressionXY` compiles a two-variable expression in `x` and `y`;
 * an optional `lhs = rhs` is normalized to `lhs - rhs` so that the curve
 * `{ (x,y) : f(x,y) = 0 }` can be traced by marching squares.
 *
 * Scientific notation is intentionally unsupported to avoid clashing with the
 * constant `e`; write `2*10^3` instead of `2e3`.
 */

export type CompiledFn = (x: number) => number;
export type CompiledFnXY = (x: number, y: number) => number;

export type ParseResult = { ok: true; fn: CompiledFn } | { ok: false; error: string };
export type ParseResultXY = { ok: true; fn: CompiledFnXY } | { ok: false; error: string };

type BinOp = '+' | '-' | '*' | '/' | '^';

type Tok =
  | { k: 'num'; v: number; pos: number }
  | { k: 'ident'; v: string; pos: number }
  | { k: 'op'; v: BinOp; pos: number }
  | { k: 'eq'; pos: number }
  | { k: 'lp'; pos: number }
  | { k: 'rp'; pos: number };

type NodeFn = (vars: number[]) => number;

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
      tokens.push({ k: 'num', v, pos: i });
      i = j;
      continue;
    }
    if (isAlpha(c)) {
      let j = i;
      while (j < src.length && isAlphaNum(src[j])) j += 1;
      tokens.push({ k: 'ident', v: src.slice(i, j), pos: i });
      i = j;
      continue;
    }
    if (c === '+' || c === '-' || c === '*' || c === '/' || c === '^') {
      tokens.push({ k: 'op', v: c, pos: i });
      i += 1;
      continue;
    }
    if (c === '=') {
      tokens.push({ k: 'eq', pos: i });
      i += 1;
      continue;
    }
    if (c === '(') {
      tokens.push({ k: 'lp', pos: i });
      i += 1;
      continue;
    }
    if (c === ')') {
      tokens.push({ k: 'rp', pos: i });
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
  varIndex: Record<string, number>;
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

function parseExpr(c: Cursor): NodeFn {
  let left = parseTerm(c);
  while (true) {
    const t = peek(c);
    if (!t || t.k !== 'op' || (t.v !== '+' && t.v !== '-')) break;
    consume(c);
    const right = parseTerm(c);
    const op = t.v;
    const l = left;
    left = op === '+' ? (v) => l(v) + right(v) : (v) => l(v) - right(v);
  }
  return left;
}

function parseTerm(c: Cursor): NodeFn {
  let left = parseUnary(c);
  while (true) {
    const t = peek(c);
    if (!t || t.k !== 'op' || (t.v !== '*' && t.v !== '/')) break;
    consume(c);
    const right = parseUnary(c);
    const op = t.v;
    const l = left;
    left = op === '*' ? (v) => l(v) * right(v) : (v) => l(v) / right(v);
  }
  return left;
}

function parseUnary(c: Cursor): NodeFn {
  const t = peek(c);
  if (t && t.k === 'op' && (t.v === '+' || t.v === '-')) {
    consume(c);
    const inner = parseUnary(c);
    return t.v === '-' ? (v) => -inner(v) : inner;
  }
  return parseFactor(c);
}

function parseFactor(c: Cursor): NodeFn {
  const base = parsePrimary(c);
  const t = peek(c);
  if (t && t.k === 'op' && t.v === '^') {
    consume(c);
    const exp = parseFactor(c);
    return (v) => Math.pow(base(v), exp(v));
  }
  return base;
}

function parsePrimary(c: Cursor): NodeFn {
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
      return (v) => fn(arg(v));
    }
    const idx = c.varIndex[name];
    if (idx !== undefined) return (v) => v[idx];
    const constant = CONSTANTS[name];
    if (constant !== undefined) return () => constant;
    throw new ParseError(`unknown identifier '${name}'`);
  }
  throw new ParseError('unexpected token');
}

function compile(src: string, varIndex: Record<string, number>, allowEquation: boolean): NodeFn {
  const trimmed = src.trim();
  if (trimmed.length === 0) throw new ParseError('empty expression');
  const toks = tokenize(trimmed);
  const cursor: Cursor = { toks, pos: 0, varIndex };
  const lhs = parseExpr(cursor);
  let root = lhs;
  const eqTok = peek(cursor);
  if (eqTok && eqTok.k === 'eq') {
    if (!allowEquation) throw new ParseError(`unexpected '=' at position ${eqTok.pos}`);
    consume(cursor);
    const rhs = parseExpr(cursor);
    root = (v) => lhs(v) - rhs(v);
  }
  if (cursor.pos !== toks.length) {
    const charPos = toks[cursor.pos].pos;
    throw new ParseError(`unexpected token at position ${charPos}`);
  }
  return root;
}

export function parseExpression(src: string): ParseResult {
  try {
    const node = compile(src, { x: 0 }, false);
    return { ok: true, fn: (x) => node([x]) };
  } catch (err) {
    if (err instanceof ParseError) return { ok: false, error: err.message };
    throw err;
  }
}

export function parseExpressionXY(src: string): ParseResultXY {
  try {
    const node = compile(src, { x: 0, y: 1 }, true);
    const buf = [0, 0];
    return {
      ok: true,
      fn: (x, y) => {
        buf[0] = x;
        buf[1] = y;
        return node(buf);
      },
    };
  } catch (err) {
    if (err instanceof ParseError) return { ok: false, error: err.message };
    throw err;
  }
}
