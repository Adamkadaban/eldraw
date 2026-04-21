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

export async function renderPage(pageIndex: number, scale: number): Promise<ArrayBuffer> {
  const t = performance.now();
  try {
    const bytes = await invoke<ArrayBuffer>('render_page', { pageIndex, scale });
    log(
      'ipc',
      `render_page idx=${pageIndex} scale=${scale.toFixed(3)} bytes=${bytes.byteLength} in ${(performance.now() - t).toFixed(1)}ms`,
    );
    return bytes;
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
