import { escapeHtml, renderLatex } from '$lib/text/latex';
import { segmentLatex } from '$lib/text/segment';

type SharedRenderer = {
  renderMixed?: (source: string, mode: 'auto') => unknown;
};

const sharedModules = import.meta.glob('../../text/render.ts', { eager: true });
const sharedRenderer = Object.values(sharedModules)[0] as SharedRenderer | undefined;

function sharedHtml(result: unknown): string | null {
  if (typeof result === 'string') return result;
  if (typeof result !== 'object' || result === null) return null;
  const html = (result as Record<string, unknown>).html;
  return typeof html === 'string' ? html : null;
}

/**
 * Narrow compatibility seam for the shared mixed-text renderer. The local
 * fallback keeps this branch standalone until `$lib/text/render` is present.
 */
export function renderInlineMath(source: string): string {
  if (sharedRenderer?.renderMixed) {
    const html = sharedHtml(sharedRenderer.renderMixed(source, 'auto'));
    if (html !== null) return html;
  }

  return segmentLatex(source)
    .map((segment) => {
      if (segment.kind === 'text') return escapeHtml(segment.value);
      return renderLatex(segment.value, { displayMode: segment.display }).html;
    })
    .join('');
}
