import katex from 'katex';

export type LatexRender = { ok: true; html: string } | { ok: false; html: string; error: string };

export interface RenderLatexOptions {
  /** Display mode (block) vs inline mode. Inline keeps text flowing. */
  displayMode?: boolean;
}

export type KatexRenderFn = (input: string, opts: katex.KatexOptions) => string;

/**
 * Render a LaTeX source string to safe HTML via KaTeX.
 *
 * Errors from KaTeX (usually ParseError) are converted into a tagged failure
 * that carries a plain-text fallback, so callers can render the original
 * content with an error class instead of throwing.
 */
export function renderLatex(
  source: string,
  opts: RenderLatexOptions = {},
  render: KatexRenderFn = katex.renderToString,
): LatexRender {
  try {
    const html = render(source, {
      displayMode: opts.displayMode ?? false,
      throwOnError: true,
      strict: 'ignore',
      output: 'html',
    });
    return { ok: true, html };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, html: escapeHtml(source), error: message };
  }
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
