import { describe, expect, it } from 'vitest';
import { previewImportedSidebarPayload } from '$lib/store/sidebar';

/**
 * Imported config is untrusted and its color values are interpolated straight
 * into `style` attributes, so anything that is not a strict hex color must be
 * rejected rather than passed through.
 */
const INJECTIONS = [
  'red; position:fixed; inset:0; z-index:9999; background:black',
  'url(https://example.com/x.png)',
  'expression(alert(1))',
  '#000; content: "x"',
  'javascript:alert(1)',
  'rgb(0,0,0); opacity: 0',
  '#xyzxyz',
  '#12345',
  '',
  'black',
];

function importState(state: unknown) {
  return previewImportedSidebarPayload({ state });
}

function importPalette(color: unknown) {
  return importState({ palettes: [{ id: 'p', name: 'P', colors: [color] }] });
}

describe('sidebar config import color hardening', () => {
  it('accepts a strict hex palette color', () => {
    const out = importPalette('#1a2b3c');
    expect(out.palettes?.[0].colors).toEqual(['#1a2b3c']);
  });

  it('rejects every CSS injection attempt in a palette', () => {
    for (const bad of INJECTIONS) {
      const out = importPalette(bad);
      const colors = out.palettes?.flatMap((p) => p.colors) ?? [];
      expect(colors).not.toContain(bad);
    }
  });

  it('rejects a non-hex activeColor', () => {
    for (const bad of INJECTIONS) {
      expect(importState({ activeColor: bad }).activeColor).not.toBe(bad);
    }
    expect(importState({ activeColor: '#abcdef' }).activeColor).toBe('#abcdef');
  });

  it('rejects a non-hex laser color', () => {
    for (const bad of INJECTIONS) {
      const out = importState({ laser: { color: bad, radius: 6 } });
      expect(out.laser?.color).not.toBe(bad);
    }
    const ok = importState({ laser: { color: '#ff0000', radius: 6 } });
    expect(ok.laser?.color).toBe('#ff0000');
  });

  it('rejects a non-hex tool style color', () => {
    const style = (color: string) => ({ color, width: 2, dash: 'solid', opacity: 1 });
    const out = importState({
      toolStyles: {
        pen: style(INJECTIONS[0]),
        highlighter: style('#ffff00'),
        line: style('#000000'),
      },
    });
    expect(out.toolStyles?.pen.color).not.toBe(INJECTIONS[0]);
  });

  it('does not throw on malformed input', () => {
    for (const bad of [null, undefined, 42, 'x', [], { palettes: 'nope' }]) {
      expect(() => importState(bad)).not.toThrow();
    }
  });
});
