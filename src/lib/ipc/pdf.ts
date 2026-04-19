import { openPdf } from '$lib/ipc';
import type { PdfMeta } from '$lib/types';
import { setError, setLoading, setMeta } from '$lib/store/pdf';

export async function openAndLoadPdf(path: string): Promise<PdfMeta | null> {
  setLoading(true);
  try {
    const meta = await openPdf(path);
    setMeta(meta);
    return meta;
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err));
    return null;
  }
}
