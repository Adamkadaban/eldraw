import { describe, expect, it } from 'vitest';
import { renderInlineMath } from '$lib/slides/render/inlineMath';

describe('renderInlineMath', () => {
  it('typesets bare math detected inside a heading', () => {
    const html = renderInlineMath('Difference of Squares a^2-b^2=(a+b)(a-b)');
    expect(html).toContain('katex');
    expect(html).toContain('Difference of Squares');
  });

  it('typesets explicitly delimited math', () => {
    expect(renderInlineMath('The line $y = mx + b$')).toContain('katex');
  });

  it('leaves prose untouched', () => {
    const html = renderInlineMath('Check your answer');
    expect(html).not.toContain('katex');
    expect(html).toBe('Check your answer');
  });

  it('escapes html in text runs', () => {
    expect(renderInlineMath('<script>alert(1)</script>')).not.toContain('<script>');
  });

  it('escapes html in a failed math run rather than emitting it raw', () => {
    const html = renderInlineMath('$\\frac{<script>alert(1)</script>$');
    expect(html).not.toContain('<script>');
  });

  it('returns an empty string for empty input', () => {
    expect(renderInlineMath('')).toBe('');
  });
});
