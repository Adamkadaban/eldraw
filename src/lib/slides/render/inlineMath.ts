import { escapeHtml } from '$lib/text/latex';
import { renderMixed } from '$lib/text/render';

const inlineMathCache = new Map<string, string>();
const CACHE_MAX = 512;

/**
 * Render a slide string as HTML with inline math typeset.
 *
 * Results are cached by source string. Slides rarely have more than a few
 * hundred unique strings, so the cache is bounded at 512 entries and evicts
 * the oldest on overflow.
 */
export function renderInlineMath(source: string): string {
  const cached = inlineMathCache.get(source);
  if (cached !== undefined) return cached;

  const html = renderMixed(source, 'auto')
    .runs.map((run) => (run.kind === 'text' ? escapeHtml(run.value) : run.html))
    .join('');

  if (inlineMathCache.size >= CACHE_MAX) {
    const firstKey = inlineMathCache.keys().next().value!;
    inlineMathCache.delete(firstKey);
  }
  inlineMathCache.set(source, html);
  return html;
}

/** Clear the inline math cache. Exposed for testing. */
export function clearInlineMathCache(): void {
  inlineMathCache.clear();
}

/** Current cache size. Exposed for testing. */
export function inlineMathCacheSize(): number {
  return inlineMathCache.size;
}
