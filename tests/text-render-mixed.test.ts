import { describe, expect, it, vi } from 'vitest';
import { renderMixed } from '$lib/text/render';

const render = vi.fn((input: string, opts: { displayMode?: boolean }) => {
  if (input.includes('BROKEN')) throw new Error('broken math');
  return `<katex data-display="${String(opts.displayMode)}">${input}</katex>`;
});

describe('renderMixed', () => {
  it('does not call KaTeX in plain mode', () => {
    render.mockClear();
    expect(renderMixed('x = 2', 'plain', render)).toEqual({
      runs: [{ kind: 'text', value: 'x = 2' }],
      errored: false,
    });
    expect(render).not.toHaveBeenCalled();
  });

  it('renders the whole string in latex mode', () => {
    const result = renderMixed('x^2', 'latex', render);
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0]).toMatchObject({ kind: 'math', source: 'x^2', errored: false });
  });

  it('renders only explicitly delimited runs in mixed mode', () => {
    const result = renderMixed('The line $y = mx + b$ has slope $m$.', 'mixed', render);
    expect(result.runs.map((run) => run.kind)).toEqual(['text', 'math', 'text', 'math', 'text']);
    expect(result.runs[1]).toMatchObject({ source: 'y = mx + b', display: false });
  });

  it('preserves display math from bracket delimiters', () => {
    const result = renderMixed('Before \\[x = 2\\] after', 'mixed', render);
    expect(result.runs[1]).toMatchObject({ kind: 'math', source: 'x = 2', display: true });
  });

  it('normalizes auto-detected math but not explicit LaTeX', () => {
    render.mockClear();
    renderMixed('Bare x <= 2 and $x <= 3$.', 'auto', render);
    expect(render.mock.calls.map(([input]) => input)).toEqual(['x \\le 2', 'x <= 3']);
  });

  it('keeps escaped dollars literal', () => {
    expect(renderMixed('It costs \\$5 today', 'auto', render).runs).toEqual([
      { kind: 'text', value: 'It costs $5 today' },
    ]);
  });

  it('does not truncate percent prose', () => {
    expect(renderMixed('Get 50% off today', 'auto', render).runs).toEqual([
      { kind: 'text', value: 'Get 50% off today' },
    ]);
  });

  it('isolates failures and HTML-escapes fallback math', () => {
    const result = renderMixed(
      'Good $x = 2$ bad $BROKEN <script>alert(1)</script>$ end',
      'mixed',
      render,
    );
    expect(result.errored).toBe(true);
    expect(result.runs).toHaveLength(5);
    const failed = result.runs[3];
    expect(failed).toMatchObject({ kind: 'math', errored: true });
    if (failed.kind === 'math') {
      expect(failed.html).toContain('&lt;script&gt;');
      expect(failed.html).not.toContain('<script>');
    }
    expect(result.runs[1]).toMatchObject({ kind: 'math', errored: false });
  });
});
