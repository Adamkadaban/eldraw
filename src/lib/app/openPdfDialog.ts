import { open } from '@tauri-apps/plugin-dialog';

export async function openPdfDialog(): Promise<string | null> {
  const selection = await open({
    multiple: false,
    directory: false,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (selection === null) return null;
  return Array.isArray(selection) ? (selection[0] ?? null) : selection;
}
