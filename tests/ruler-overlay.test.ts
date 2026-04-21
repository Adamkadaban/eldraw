import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('../src/lib/canvas/RulerOverlay.svelte', import.meta.url)),
  'utf8',
);

function styleRule(selector: string): string {
  const re = new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`);
  const m = source.match(re);
  if (!m) throw new Error(`no rule for ${selector}`);
  return m[1];
}

describe('RulerOverlay pointer-events (regression for #112)', () => {
  it('outer .ruler SVG is pointer-events: none so events pass through', () => {
    expect(styleRule('.ruler')).toMatch(/pointer-events:\s*none/);
  });

  for (const sel of ['.body', '.end-handle', '.close'] as const) {
    it(`${sel} opts back in with pointer-events: auto`, () => {
      expect(styleRule(sel)).toMatch(/pointer-events:\s*auto/);
    });
  }

  it('decorative close-button strokes keep pointer-events="none"', () => {
    const decorativeLines = source.match(/<line[^>]*pointer-events="none"/g) ?? [];
    expect(decorativeLines.length).toBeGreaterThanOrEqual(2);
  });
});
