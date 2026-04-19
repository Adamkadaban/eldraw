import { invoke } from '@tauri-apps/api/core';
import type { EldrawDocument, PdfMeta } from '$lib/types';

export async function openPdf(path: string): Promise<PdfMeta> {
  return invoke('open_pdf', { path });
}

export async function renderPage(pageIndex: number, scale: number): Promise<Uint8Array> {
  return invoke('render_page', { pageIndex, scale });
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
