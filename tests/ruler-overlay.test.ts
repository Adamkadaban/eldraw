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

  for (const sel of ['.body', '.end-handle'] as const) {
    it(`${sel} only opts into pointer-events when interactive (ruler tool active)`, () => {
      expect(styleRule(`${sel}.interactive`)).toMatch(/pointer-events:\s*auto/);
      expect(() => styleRule(sel)).toThrow();
    });
  }

  // Gating close on the ruler tool made the ruler impossible to dismiss: once
  // another tool was selected the button went inert and the overlay stayed up.
  it('.close always opts into pointer-events so the ruler can be dismissed', () => {
    expect(styleRule('.close')).toMatch(/pointer-events:\s*auto/);
    expect(() => styleRule('.close.interactive')).toThrow();
  });

  for (const sel of ['body', 'end-handle'] as const) {
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

  it('close button handlers stay active regardless of the selected tool', () => {
    expect(source).toMatch(/onclick=\{onClose\}/);
    expect(source).toMatch(/onpointerdown=\{onClose\}/);
    expect(source).toMatch(/onkeydown=\{onCloseKey\}/);
  });

  it('closing while the ruler tool is active also leaves the ruler tool', () => {
    expect(source).toMatch(/sidebar\.setTool\(/);
  });

  it('outer ruler SVG is aria-hidden when the ruler tool is inactive', () => {
    expect(source).toMatch(/aria-hidden\s*=\s*\{\s*!\s*isRulerTool\s*\}/);
  });

  it('drag handles gate tabindex on isRulerTool', () => {
    const matches = source.match(/tabindex\s*=\s*\{\s*isRulerTool\s*\?\s*0\s*:\s*-1\s*\}/g) ?? [];
    // The body and end handle. Close stays focusable so it can always be reached.
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(source).toMatch(/tabindex="0"/);
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
