import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('../src/lib/canvas/RulerOverlay.svelte', import.meta.url)),
  'utf8',
);

function styleRule(selector: string): string {
  const re = new RegExp(`${selector.replace(/\./g, '\\.')}\\s*\\{([^}]*)\\}`);
  const m = source.match(re);
  if (!m) throw new Error(`no rule for ${selector}`);
  return m[1];
}

describe('RulerOverlay pointer-events (regression for #112)', () => {
  it('outer .ruler SVG is pointer-events: none so events pass through', () => {
    expect(styleRule('.ruler')).toMatch(/pointer-events:\s*none/);
  });

  it('decorative close-button strokes keep pointer-events="none"', () => {
    const decorativeLines = source.match(/<line[^>]*pointer-events="none"/g) ?? [];
    expect(decorativeLines.length).toBeGreaterThanOrEqual(2);
  });
});

describe('RulerOverlay snap-only mode (regression for #123)', () => {
  it('derives isRulerTool from toolStore', () => {
    expect(source).toMatch(/toolStore/);
    expect(source).toMatch(
      /isRulerTool\s*=\s*\$derived\(\s*\$toolStore\.tool\s*===\s*'ruler'\s*\)/,
    );
  });

  for (const sel of ['.body', '.end-handle', '.close'] as const) {
    it(`${sel} only opts into pointer-events when interactive (ruler tool active)`, () => {
      expect(styleRule(`${sel}.interactive`)).toMatch(/pointer-events:\s*auto/);
      expect(() => styleRule(sel)).toThrow();
    });
  }

  for (const sel of ['body', 'end-handle', 'close'] as const) {
    it(`${sel} element gets class:interactive bound to isRulerTool`, () => {
      const re = new RegExp(
        `<[^>]*class="${sel}"[^>]*class:interactive=\\{\\s*isRulerTool\\s*\\}[^>]*>`,
      );
      expect(source).toMatch(re);
    });
  }

  it('body pointer handler is gated on isRulerTool', () => {
    expect(source).toMatch(
      /onpointerdown\s*=\s*\{\s*isRulerTool\s*\?\s*onBodyPointerDown\s*:\s*null\s*\}/,
    );
  });

  it('end-handle pointer handler is gated on isRulerTool', () => {
    expect(source).toMatch(
      /onpointerdown\s*=\s*\{\s*isRulerTool\s*\?\s*onEndPointerDown\s*:\s*null\s*\}/,
    );
  });

  it('close button handlers are gated on isRulerTool', () => {
    expect(source).toMatch(/onclick\s*=\s*\{\s*isRulerTool\s*\?\s*onClose\s*:\s*null\s*\}/);
    expect(source).toMatch(/onpointerdown\s*=\s*\{\s*isRulerTool\s*\?\s*onClose\s*:\s*null\s*\}/);
    expect(source).toMatch(/onkeydown\s*=\s*\{\s*isRulerTool\s*\?\s*onCloseKey\s*:\s*null\s*\}/);
  });

  it('outer ruler SVG is aria-hidden when the ruler tool is inactive', () => {
    expect(source).toMatch(/aria-hidden\s*=\s*\{\s*!\s*isRulerTool\s*\}/);
  });

  it('focusable ruler elements gate tabindex on isRulerTool', () => {
    const matches = source.match(/tabindex\s*=\s*\{\s*isRulerTool\s*\?\s*0\s*:\s*-1\s*\}/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });
});

describe('RulerOverlay snap math is independent of active tool', () => {
  it('snap geometry lives in $lib/geometry/ruler, not in the overlay', async () => {
    const ruler = await import('../src/lib/geometry/ruler');
    expect(typeof ruler.snapPointToRuler).toBe('function');
    expect(typeof ruler.snapStrokeToRuler).toBe('function');
    const overlaySnapMatches = source.match(/snapPointToRuler|snapStrokeToRuler/g) ?? [];
    expect(overlaySnapMatches.length).toBe(0);
  });
});
