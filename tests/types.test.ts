import { describe, it, expect } from 'vitest';
import type { EldrawDocument } from '$lib/types';

describe('types', () => {
  it('accepts a minimal EldrawDocument shape', () => {
    const doc: EldrawDocument = {
      version: 1,
      pdfHash: '',
      pdfPath: null,
      pages: [],
      palettes: [],
      prefs: {
        sidebarPinned: true,
        defaultTool: 'pen',
        toolDefaults: {
          pen: { color: '#000', width: 2, dash: 'solid', opacity: 1 },
          highlighter: { color: '#ff0', width: 14, dash: 'solid', opacity: 0.3 },
          line: { color: '#000', width: 2, dash: 'solid', opacity: 1 },
        },
      },
    };
    expect(doc.version).toBe(1);
  });
});
