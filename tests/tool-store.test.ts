import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  toolStore,
  setTool,
  setStyle,
  setColor,
  setWidth,
  resetToolStoreForTests,
} from '$lib/store/tool';

describe('tool store', () => {
  beforeEach(() => resetToolStoreForTests());

  it('starts with pen + sensible defaults', () => {
    const s = get(toolStore);
    expect(s.tool).toBe('pen');
    expect(s.style.color).toBe('#000000');
    expect(s.style.width).toBe(2);
    expect(s.style.dash).toBe('solid');
    expect(s.style.opacity).toBe(1);
  });

  it('switching tools remembers per-tool style', () => {
    setColor('#ff0000');
    setWidth(5);
    expect(get(toolStore).style.color).toBe('#ff0000');

    setTool('highlighter');
    const hl = get(toolStore);
    expect(hl.tool).toBe('highlighter');
    expect(hl.style.color).toBe('#ffeb3b');
    expect(hl.style.width).toBe(14);

    setColor('#00ff00');
    expect(get(toolStore).style.color).toBe('#00ff00');

    setTool('pen');
    const pen = get(toolStore);
    expect(pen.tool).toBe('pen');
    expect(pen.style.color).toBe('#ff0000');
    expect(pen.style.width).toBe(5);

    setTool('highlighter');
    expect(get(toolStore).style.color).toBe('#00ff00');
  });

  it('setStyle merges partial updates', () => {
    setStyle({ dash: 'dashed', opacity: 0.5 });
    const s = get(toolStore);
    expect(s.style.dash).toBe('dashed');
    expect(s.style.opacity).toBe(0.5);
    expect(s.style.color).toBe('#000000');
  });

  it('switching to a non-stroke tool keeps current style', () => {
    setColor('#123456');
    setTool('eraser');
    expect(get(toolStore).tool).toBe('eraser');
    expect(get(toolStore).style.color).toBe('#123456');
  });
});
