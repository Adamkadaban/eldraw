import { escapeHtml } from '$lib/text/latex';
import { renderMixed } from '$lib/text/render';

/**
 * Render a slide string as HTML with inline math typeset.
 *
 * Slide strings are authored as prose, so they use `auto` mode: explicitly
 * delimited runs are honored and bare math is detected heuristically.
 *
 * The result is injected with `{@html}`, so every text run is escaped here and
 * every math run carries either KaTeX output or an escaped fallback.
 */
export function renderInlineMath(source: string): string {
  return renderMixed(source, 'auto')
    .runs.map((run) => (run.kind === 'text' ? escapeHtml(run.value) : run.html))
    .join('');
}
