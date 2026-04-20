import { describe, it, expect } from 'vitest';
import { renderLatex, escapeHtml } from '$lib/text/latex';

describe('renderLatex', () => {
  it('returns ok with rendered HTML from the injected katex function', () => {
    const result = renderLatex('x^2', {}, () => '<span class="katex">x^2</span>');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.html).toContain('katex');
    }
  });

  it('passes displayMode option through to katex', () => {
    let captured: { displayMode?: boolean } | null = null;
    renderLatex('x', { displayMode: true }, (_input, opts) => {
      captured = opts;
      return 'ok';
    });
    expect(captured).not.toBeNull();
    expect(captured!.displayMode).toBe(true);
  });

  it('defaults displayMode to false', () => {
    let captured: { displayMode?: boolean } | null = null;
    renderLatex('x', {}, (_input, opts) => {
      captured = opts;
      return 'ok';
    });
    expect(captured!.displayMode).toBe(false);
  });

  it('returns a tagged failure with escaped fallback when katex throws', () => {
    const result = renderLatex('<bad>', {}, () => {
      throw new Error('ParseError: undefined control sequence');
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/ParseError/);
      expect(result.html).toBe('&lt;bad&gt;');
    }
  });

  it('coerces non-Error throws into string error messages', () => {
    const result = renderLatex('x', {}, () => {
      throw 'boom';
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('boom');
    }
  });

  it('uses real katex for valid input by default', () => {
    const result = renderLatex('x^2 + y^2');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.html.length).toBeGreaterThan(0);
    }
  });

  it('uses real katex and reports failure for invalid input by default', () => {
    const result = renderLatex('\\frac{1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.html).toContain('\\frac{1');
    }
  });
});

describe('escapeHtml', () => {
  it('escapes the five core HTML entities', () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;',
    );
  });
});
