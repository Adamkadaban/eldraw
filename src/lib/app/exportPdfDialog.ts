import { save } from '@tauri-apps/plugin-dialog';
import { get } from 'svelte/store';
import { currentDocument } from '$lib/store/document';
import { exportFlattenedPdf } from '$lib/ipc';

export async function exportAnnotatedPdfDialog(): Promise<void> {
  const doc = get(currentDocument);
  if (!doc) {
    window.alert('Open a document before exporting.');
    return;
  }
  // Rendering pdf pages needs the source file. Catching this here gives a
  // actionable message instead of a low-level "cannot read source PDF".
  const needsSource = doc.pages.some((page) => page.type === 'pdf');
  if (needsSource && !doc.pdfPath) {
    window.alert(
      'This document has PDF pages but its source file is not available.\n\n' +
        'Re-open the original PDF, then export again.',
    );
    return;
  }
  const outPath = await save({
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    defaultPath: suggestedFilename(doc.pdfPath),
  });
  if (outPath === null) return;

  try {
    await exportFlattenedPdf(doc.pdfPath ?? '', doc, outPath);
    window.alert(`Annotated PDF exported to:\n${outPath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    window.alert(`Could not export annotated PDF:\n${message}`);
  }
}

function suggestedFilename(pdfPath: string | null): string {
  if (!pdfPath) return 'annotated.pdf';
  const filename = pdfPath.split(/[\\/]/).pop() ?? 'document.pdf';
  const stem = filename.toLowerCase().endsWith('.pdf') ? filename.slice(0, -4) : filename;
  return `${stem}-annotated.pdf`;
}
