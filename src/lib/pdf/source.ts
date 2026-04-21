/**
 * Abstraction over where a PDF came from so load and reload share one path.
 *
 * Only `file` is supported today. A `url` variant is reserved for the Slides
 * import feature (#114); when it lands, extending `loadPdfFromSource` to
 * handle it is the only place the reload flow needs to change.
 */

import type { PdfMeta } from '$lib/types';
import { openPdf } from '$lib/ipc';

export type PdfSource = { kind: 'file'; path: string };

export function describeSource(source: PdfSource): string {
  return source.path;
}

export async function fetchPdfMeta(source: PdfSource): Promise<PdfMeta> {
  return openPdf(source.path);
}
