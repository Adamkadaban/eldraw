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
      'Mapping diagram',
      'Relation practice',
      'Function machine',
      'Labelled expression',
      'Number line',
      'Sub-numbered steps',
      'Data table',
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

  it('builds the mapping templates with their intended teaching structures', () => {
    expect(applyTemplate('mapping-diagram')).toMatchObject({
      layout: 'content',
      blocks: [{ kind: 'mapping' }, { kind: 'text' }],
    });
    expect(applyTemplate('relation-practice')).toMatchObject({
      layout: 'columns',
      columnCount: 2,
      blocks: [
        { kind: 'mapping' },
        {
          kind: 'list',
          marker: 'decimal',
          items: [
            { text: 'Find the domain.' },
            { text: 'Find the range.' },
            { text: 'Is it a function?' },
          ],
        },
      ],
    });
  });

  it('builds the extended math-teaching structures', () => {
    expect(applyTemplate('function-machine')).toMatchObject({
      blocks: [{ kind: 'diagram', nodes: expect.any(Array), edges: expect.any(Array) }],
    });
    expect(applyTemplate('labelled-expression')).toMatchObject({
      blocks: [{ kind: 'math' }, { kind: 'diagram' }],
    });
    expect(applyTemplate('number-line')).toMatchObject({
      blocks: [{ kind: 'numberline' }, { kind: 'text' }],
    });
    expect(applyTemplate('sub-numbered-steps')).toMatchObject({
      blocks: [
        {
          kind: 'list',
          marker: 'decimal',
          markerByLevel: ['decimal', 'alpha'],
        },
      ],
    });
    expect(applyTemplate('data-table')).toMatchObject({
      blocks: [
        { kind: 'table', headerOrientation: 'column' },
        { kind: 'text' },
        { kind: 'text' },
        { kind: 'spacer' },
      ],
    });
  });
});
