import { invoke } from '@tauri-apps/api/core';
import type { EldrawDocument, PdfMeta } from '$lib/types';
import { log, warn } from '$lib/log';

export async function openPdf(path: string): Promise<PdfMeta> {
  const t = performance.now();
  try {
    const meta = await invoke<PdfMeta>('open_pdf', { path });
    log('ipc', `open_pdf ok pages=${meta.pages.length} in ${(performance.now() - t).toFixed(1)}ms`);
    return meta;
  } catch (err) {
    warn('ipc', `open_pdf failed after ${(performance.now() - t).toFixed(1)}ms`, err);
    throw err;
  }
}

export interface RenderedPage {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

/**
 * Render a PDF page. Returns a raw RGBA bitmap prefixed on the wire by a
 * two-`u32` (little-endian) header `[width, height]`; the rest of the buffer
 * is `width * height * 4` pixel bytes suitable for `new ImageData(...)`.
 *
 * `pdfId` is the hash reported by `open_pdf`. When provided, the backend
 * rejects the call if the currently-open document has a different hash,
 * preventing a stale navigation from drawing the wrong PDF's pages.
 */
export async function renderPage(
  pageIndex: number,
  scale: number,
  pdfId?: string,
): Promise<RenderedPage> {
  const t = performance.now();
  try {
    const bytes = await invoke<ArrayBuffer>('render_page', { pageIndex, scale, pdfId });
    const header = new DataView(bytes, 0, 8);
    const width = header.getUint32(0, true);
    const height = header.getUint32(4, true);
    const expected = width * height * 4;
    const payload = bytes.byteLength - 8;
    if (payload !== expected) {
      throw new Error(`render_page payload ${payload} != expected ${expected}`);
    }
    const rgba = new Uint8ClampedArray(bytes, 8, expected);
    log(
      'ipc',
      `render_page idx=${pageIndex} scale=${scale.toFixed(3)} ${width}x${height} in ${(performance.now() - t).toFixed(1)}ms`,
    );
    return { width, height, rgba };
  } catch (err) {
    warn('ipc', `render_page idx=${pageIndex} failed`, err);
    throw err;
  }
}

export async function renderPdfThumbnail(
  pdfId: string,
  pageIndex: number,
  maxDim: number,
): Promise<ArrayBuffer> {
  const t = performance.now();
  try {
    const bytes = await invoke<ArrayBuffer>('render_pdf_thumbnail', {
      pdfId,
      pageIndex,
      maxDim,
    });
    log(
      'ipc',
      `render_pdf_thumbnail idx=${pageIndex} max=${maxDim} bytes=${bytes.byteLength} in ${(performance.now() - t).toFixed(1)}ms`,
    );
    return bytes;
  } catch (err) {
    warn('ipc', `render_pdf_thumbnail idx=${pageIndex} failed`, err);
    throw err;
  }
}

export async function loadSidecar(pdfPath: string): Promise<EldrawDocument | null> {
  return invoke('load_sidecar', { pdfPath });
}

export async function saveSidecar(pdfPath: string, doc: EldrawDocument): Promise<void> {
  return invoke('save_sidecar', { pdfPath, doc });
}

export async function acquireLock(pdfPath: string): Promise<boolean> {
  return invoke('acquire_lock', { pdfPath });
}

export async function releaseLock(pdfPath: string): Promise<void> {
  return invoke('release_lock', { pdfPath });
}

export async function exportFlattenedPdf(
  pdfPath: string,
  doc: EldrawDocument,
  outPath: string,
): Promise<void> {
  return invoke('export_flattened_pdf', { pdfPath, doc, outPath });
}
