import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { currentStyle, PRESET_COLORS, sidebar } from '$lib/store/sidebar';

describe('sidebar store', () => {
  beforeEach(() => sidebar.reset());

  it('switches tools while preserving per-tool width, dash, opacity', () => {
    sidebar.setTool('pen');
    sidebar.setWidth(7);
    sidebar.setDash('dashed');

    sidebar.setTool('highlighter');
    expect(sidebar.snapshot().toolStyles.highlighter.width).toBe(14);
    expect(sidebar.snapshot().toolStyles.highlighter.dash).toBe('solid');
    expect(sidebar.snapshot().toolStyles.highlighter.opacity).toBe(0.3);

    sidebar.setWidth(20);
    sidebar.setDash('dotted');

    sidebar.setTool('pen');
    const pen = sidebar.snapshot().toolStyles.pen;
    expect(pen.width).toBe(7);
    expect(pen.dash).toBe('dashed');
    expect(pen.opacity).toBe(1);

    const hl = sidebar.snapshot().toolStyles.highlighter;
    expect(hl.width).toBe(20);
    expect(hl.dash).toBe('dotted');
  });

  it('adds and removes custom colors; refuses to remove presets', () => {
    sidebar.addCustomColor('#123456');
    sidebar.addCustomColor('#abcdef');
    sidebar.addCustomColor('#123456');
    const custom = sidebar.snapshot().palettes.find((p) => p.id === 'custom');
    expect(custom?.colors).toEqual(['#123456', '#abcdef']);

    sidebar.removeCustomColor('#123456');
    expect(sidebar.snapshot().palettes.find((p) => p.id === 'custom')?.colors).toEqual(['#abcdef']);

    sidebar.removeCustomColor(PRESET_COLORS[0]);
    const presets = sidebar.snapshot().palettes.find((p) => p.id === 'presets');
    expect(presets?.colors).toEqual([...PRESET_COLORS]);
  });

  it('refuses to add a color that is already a preset', () => {
    sidebar.addCustomColor(PRESET_COLORS[1]);
    expect(sidebar.snapshot().palettes.find((p) => p.id === 'custom')?.colors).toEqual([]);
  });

  it('cycleDash walks solid -> dashed -> dotted -> solid', () => {
    sidebar.setTool('pen');
    expect(sidebar.snapshot().toolStyles.pen.dash).toBe('solid');
    sidebar.cycleDash();
    expect(sidebar.snapshot().toolStyles.pen.dash).toBe('dashed');
    sidebar.cycleDash();
    expect(sidebar.snapshot().toolStyles.pen.dash).toBe('dotted');
    sidebar.cycleDash();
    expect(sidebar.snapshot().toolStyles.pen.dash).toBe('solid');
  });

  it('currentStyle reflects the active color', () => {
    sidebar.setTool('pen');
    sidebar.setActiveColor('#ff00aa');
    expect(get(currentStyle).color).toBe('#ff00aa');
    expect(sidebar.snapshot().toolStyles.pen.color).toBe('#ff00aa');

    sidebar.setTool('highlighter');
    expect(get(currentStyle).color).toBe(sidebar.snapshot().toolStyles.highlighter.color);
  });

  it('togglePin flips pinned', () => {
    expect(sidebar.snapshot().pinned).toBe(true);
    sidebar.togglePin();
    expect(sidebar.snapshot().pinned).toBe(false);
  });
});
