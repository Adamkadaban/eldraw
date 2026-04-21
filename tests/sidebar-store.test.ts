import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  currentStyle,
  PRESET_COLORS,
  sidebar,
  streamlineFromSmoothing,
  pickSyncable,
  DEFAULT_SMOOTHING_PEN,
  DEFAULT_SMOOTHING_HIGHLIGHTER,
  DEFAULT_SMOOTHING_TEMP_INK,
} from '$lib/store/sidebar';

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

  it('setFloatingPos accepts finite coords and rejects non-finite', () => {
    expect(sidebar.snapshot().floatingPos).toBeNull();
    sidebar.setFloatingPos({ x: 10, y: 20 });
    expect(sidebar.snapshot().floatingPos).toEqual({ x: 10, y: 20 });
    sidebar.setFloatingPos({ x: Number.NaN, y: 20 });
    expect(sidebar.snapshot().floatingPos).toEqual({ x: 10, y: 20 });
    sidebar.setFloatingPos({ x: 5, y: Number.POSITIVE_INFINITY });
    expect(sidebar.snapshot().floatingPos).toEqual({ x: 10, y: 20 });
    sidebar.setFloatingPos({ x: -5, y: 7 });
    expect(sidebar.snapshot().floatingPos).toEqual({ x: -5, y: 7 });
  });

  it('resetFloatingPos clears the saved position', () => {
    sidebar.setFloatingPos({ x: 42, y: 84 });
    expect(sidebar.snapshot().floatingPos).not.toBeNull();
    sidebar.resetFloatingPos();
    expect(sidebar.snapshot().floatingPos).toBeNull();
  });

  it('setFloatingPos(null) clears the saved position', () => {
    sidebar.setFloatingPos({ x: 1, y: 2 });
    sidebar.setFloatingPos(null);
    expect(sidebar.snapshot().floatingPos).toBeNull();
  });

  it('smoothing defaults: 50/50/30', () => {
    const s = sidebar.snapshot();
    expect(s.smoothingPen).toBe(DEFAULT_SMOOTHING_PEN);
    expect(s.smoothingHighlighter).toBe(DEFAULT_SMOOTHING_HIGHLIGHTER);
    expect(s.smoothingTempInk).toBe(DEFAULT_SMOOTHING_TEMP_INK);
    expect(DEFAULT_SMOOTHING_PEN).toBe(50);
    expect(DEFAULT_SMOOTHING_HIGHLIGHTER).toBe(50);
    expect(DEFAULT_SMOOTHING_TEMP_INK).toBe(30);
  });

  it('setSmoothing persists per-tool and clamps to 0..100', () => {
    sidebar.setSmoothing('pen', 80);
    sidebar.setSmoothing('highlighter', 10);
    sidebar.setSmoothing('temp-ink', 65);
    let s = sidebar.snapshot();
    expect(s.smoothingPen).toBe(80);
    expect(s.smoothingHighlighter).toBe(10);
    expect(s.smoothingTempInk).toBe(65);

    sidebar.setSmoothing('pen', -20);
    sidebar.setSmoothing('highlighter', 150);
    sidebar.setSmoothing('temp-ink', Number.NaN);
    s = sidebar.snapshot();
    expect(s.smoothingPen).toBe(0);
    expect(s.smoothingHighlighter).toBe(100);
    expect(s.smoothingTempInk).toBe(0);
  });

  it('streamlineFromSmoothing maps 0 -> 0 and 100 -> 0.99', () => {
    expect(streamlineFromSmoothing(0)).toBe(0);
    expect(streamlineFromSmoothing(100)).toBeCloseTo(0.99, 10);
    expect(streamlineFromSmoothing(50)).toBeCloseTo(0.495, 10);
    expect(streamlineFromSmoothing(-5)).toBe(0);
    expect(streamlineFromSmoothing(250)).toBeCloseTo(0.99, 10);
    expect(streamlineFromSmoothing(Number.NaN)).toBe(0);
  });

  it('pickSyncable includes per-tool smoothing for cross-window sync', () => {
    sidebar.setSmoothing('pen', 77);
    sidebar.setSmoothing('highlighter', 22);
    sidebar.setSmoothing('temp-ink', 4);
    const sync = pickSyncable(sidebar.snapshot());
    expect(sync.smoothingPen).toBe(77);
    expect(sync.smoothingHighlighter).toBe(22);
    expect(sync.smoothingTempInk).toBe(4);
  });

  it('applyRemote round-trips smoothing values', () => {
    sidebar.setSmoothing('pen', 11);
    const snap = pickSyncable(sidebar.snapshot());
    sidebar.reset();
    sidebar.applyRemote(snap);
    const after = sidebar.snapshot();
    expect(after.smoothingPen).toBe(11);
    expect(after.smoothingHighlighter).toBe(DEFAULT_SMOOTHING_HIGHLIGHTER);
    expect(after.smoothingTempInk).toBe(DEFAULT_SMOOTHING_TEMP_INK);
  });
});
