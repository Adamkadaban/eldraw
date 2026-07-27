import { describe, expect, it } from 'vitest';
import { sanitizeSlide } from '$lib/slides/deck';
import { applyTemplate, slideTemplates } from '$lib/slides/templates';

describe('slide templates', () => {
  it('ships the complete teaching template set', () => {
    expect(slideTemplates.map((template) => template.name)).toEqual([
      'Title slide',
      'Agenda / topics',
      'Section divider',
      'Definitions',
      'Bulleted concept',
      'Numbered steps',
      'Table',
      'Two tables',
      'Equation + graph',
      'Graph trio',
      'Worked example',
      'Practice grid',
      'Concept + tip callout',
      'Blank workspace',
    ]);
  });

  it.each(slideTemplates)('$name builds unique ids and round-trips cleanly', (template) => {
    const slide = template.build();
    const ids = [...slide.blocks, ...(slide.aside ?? [])].map((block) => block.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(sanitizeSlide(slide)).toEqual(slide);
  });

  it('builds fresh slide data on each invocation', () => {
    for (const template of slideTemplates) {
      const first = template.build();
      const second = template.build();
      expect(second).not.toBe(first);
      expect(second.blocks).not.toBe(first.blocks);
      for (let index = 0; index < first.blocks.length; index += 1) {
        expect(second.blocks[index]).not.toBe(first.blocks[index]);
      }
    }
  });

  it('applies known templates and rejects unknown ids', () => {
    expect(applyTemplate('worked-example')?.title).toBe('Worked example');
    expect(applyTemplate('missing')).toBeNull();
  });
});
