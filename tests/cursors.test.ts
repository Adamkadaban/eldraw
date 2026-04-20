import { describe, it, expect } from 'vitest';
import { cursorForTool } from '../src/lib/canvas/cursors';
import type { ToolKind } from '../src/lib/types';

describe('cursorForTool', () => {
  it('uses inline SVG cursors for ink tools with explicit hotspots', () => {
    const pen = cursorForTool('pen');
    expect(pen).toMatch(/^url\("data:image\/svg\+xml/);
    expect(pen).toMatch(/2 18/);
    expect(pen).toMatch(/, crosshair$/);

    const highlighter = cursorForTool('highlighter');
    expect(highlighter).toMatch(/fdd835/);
    expect(highlighter).toMatch(/3 19/);

    const eraser = cursorForTool('eraser');
    expect(eraser).toMatch(/12 12/);
    expect(eraser).toMatch(/, cell$/);
  });

  it('maps shape-like tools to crosshair', () => {
    const shapeTools: ToolKind[] = [
      'line',
      'rect',
      'ellipse',
      'numberline',
      'graph',
      'ruler',
      'protractor',
      'laser',
      'temp-ink',
    ];
    for (const t of shapeTools) {
      expect(cursorForTool(t)).toBe('crosshair');
    }
  });

  it('maps navigation/selection tools to native cursors', () => {
    expect(cursorForTool('text')).toBe('text');
    expect(cursorForTool('select')).toBe('default');
    expect(cursorForTool('pan')).toBe('grab');
  });

  it('returns a non-empty string for every tool kind', () => {
    const all: ToolKind[] = [
      'pen',
      'highlighter',
      'eraser',
      'line',
      'rect',
      'ellipse',
      'numberline',
      'graph',
      'text',
      'select',
      'pan',
      'laser',
      'temp-ink',
      'protractor',
      'ruler',
    ];
    for (const t of all) {
      const cursor = cursorForTool(t);
      expect(cursor.length).toBeGreaterThan(0);
    }
  });
});
