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

  it('capturePreset stores the current tool + style and caps at 9', () => {
    sidebar.setTool('pen');
    sidebar.setActiveColor('#ff00aa');
    sidebar.setWidth(5);
    const p = sidebar.capturePreset();
    expect(p).not.toBeNull();
    expect(p?.tool).toBe('pen');
    expect(p?.style.color).toBe('#ff00aa');
    expect(p?.style.width).toBe(5);
    expect(sidebar.snapshot().presets).toHaveLength(1);

    for (let i = 0; i < 20; i += 1) sidebar.capturePreset();
    expect(sidebar.snapshot().presets).toHaveLength(9);
  });

  it('capturePreset refuses tools without a style key', () => {
    sidebar.setTool('laser');
    expect(sidebar.capturePreset()).toBeNull();
    expect(sidebar.snapshot().presets).toHaveLength(0);
  });

  it('applyPreset restores tool + style; applyPresetSlot is 1-indexed', () => {
    sidebar.setTool('pen');
    sidebar.setActiveColor('#112233');
    sidebar.setWidth(3);
    sidebar.capturePreset();
    sidebar.setTool('highlighter');
    sidebar.setActiveColor('#fdd835');
    sidebar.setWidth(20);
    sidebar.capturePreset();

    sidebar.setTool('pen');
    sidebar.setActiveColor('#000000');
    sidebar.setWidth(1);

    sidebar.applyPresetSlot(2);
    const s = sidebar.snapshot();
    expect(s.activeTool).toBe('highlighter');
    expect(s.activeColor).toBe('#fdd835');
    expect(s.toolStyles.highlighter.width).toBe(20);
  });

  it('removePreset drops by id', () => {
    sidebar.setTool('pen');
    const p = sidebar.capturePreset();
    expect(sidebar.snapshot().presets).toHaveLength(1);
    if (p) sidebar.removePreset(p.id);
    expect(sidebar.snapshot().presets).toHaveLength(0);
  });
});
