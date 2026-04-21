import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import ColorPalette from '$lib/sidebar/ColorPalette.svelte';
import DashStyleToggle from '$lib/sidebar/DashStyleToggle.svelte';
import ToolPresets from '$lib/sidebar/ToolPresets.svelte';
import type { ColorPalette as Palette, ToolPreset } from '$lib/types';

function activeButtons(html: string): string[] {
  const re = /<button\b[^>]*aria-pressed="true"[^>]*>/g;
  return html.match(re) ?? [];
}

describe('sidebar preset highlight', () => {
  it('marks the swatch matching activeColor as selected', () => {
    const palettes: Palette[] = [
      { id: 'presets', name: 'Presets', colors: ['#ff0000', '#00ff00', '#0000ff'] },
    ];
    const { body } = render(ColorPalette, {
      props: { palettes, activeColor: '#00ff00' },
    });

    const pressed = activeButtons(body);
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toContain('background: #00ff00');
    expect(pressed[0]).toMatch(/class="swatch[^"]*\bactive\b/);
    expect(body).toContain('data-selected="true"');
  });

  it('marks the dash option matching the value as selected', () => {
    const { body } = render(DashStyleToggle, { props: { value: 'dashed' } });
    const pressed = activeButtons(body);
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toMatch(/class="option[^"]*\bactive\b/);
    expect(pressed[0]).toContain('title="dashed"');
  });

  it('marks the preset chip whose tool + style matches the active style', () => {
    const presets: ToolPreset[] = [
      {
        id: 'a',
        tool: 'pen',
        style: { color: '#ff0000', width: 3, dash: 'solid', opacity: 1 },
      },
      {
        id: 'b',
        tool: 'pen',
        style: { color: '#00ff00', width: 5, dash: 'dashed', opacity: 1 },
      },
      {
        id: 'c',
        tool: 'highlighter',
        style: { color: '#00ff00', width: 5, dash: 'dashed', opacity: 1 },
      },
    ];
    const { body } = render(ToolPresets, {
      props: {
        presets,
        activeTool: 'pen',
        activeStyle: { color: '#00ff00', width: 5, dash: 'dashed', opacity: 1 },
      },
    });
    const pressed = activeButtons(body);
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toMatch(/class="chip[^"]*\bactive\b/);
  });

  it('marks no preset chip when no style matches', () => {
    const presets: ToolPreset[] = [
      {
        id: 'a',
        tool: 'pen',
        style: { color: '#ff0000', width: 3, dash: 'solid', opacity: 1 },
      },
    ];
    const { body } = render(ToolPresets, {
      props: {
        presets,
        activeTool: 'pen',
        activeStyle: { color: '#000000', width: 3, dash: 'solid', opacity: 1 },
      },
    });
    expect(activeButtons(body)).toHaveLength(0);
  });
});
