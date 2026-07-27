import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const page = readFileSync(
  fileURLToPath(new URL('../src/routes/+page.svelte', import.meta.url)),
  'utf8',
);

describe('overlay slot does not swallow canvas input', () => {
  /**
   * The ruler's SVG spans the whole canvas so its ticks can render anywhere,
   * and it sets `pointer-events: none` for exactly that reason. A blanket rule
   * on the slot re-enabled events for every child SVG, so whenever the ruler
   * was visible it captured all input and the pen, laser and temp-ink tools
   * silently stopped working.
   */
  it('has no blanket pointer-events rule for overlay SVGs', () => {
    expect(page).not.toMatch(/\.overlay-slot\s+:global\(svg\)\s*\{[^}]*pointer-events:\s*auto/);
  });

  it('keeps the slot itself transparent to pointer events', () => {
    const rule = page.match(/\.overlay-slot\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toMatch(/pointer-events:\s*none/);
  });
});

describe('ruler auto-show effect', () => {
  /**
   * Reading `rulerVisible` inside the effect that shows the ruler created a
   * loop: closing set it false, which re-ran the effect, which set it true
   * again. The ruler could never be dismissed while its tool was selected.
   */
  it('does not re-show the ruler by reading its own visibility', () => {
    const effect = page.match(
      /\$effect\(\(\) => \{[^}]*setRulerVisible\(true\)[\s\S]{0,200}?\}\);/,
    );
    expect(effect, 'ruler auto-show effect not found').not.toBeNull();
    expect(effect?.[0]).not.toMatch(/rulerVisible/);
  });

  it('shows the ruler only when the tool changes to ruler', () => {
    expect(page).toMatch(/lastToolForRuler/);
  });
});
