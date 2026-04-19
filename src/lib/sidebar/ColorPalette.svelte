<script lang="ts">
  import { sidebar } from '$lib/store/sidebar';
  import type { ColorPalette as Palette } from '$lib/types';

  interface Props {
    palettes: Palette[];
    activeColor: string;
    onChange?: (color: string) => void;
  }

  let { palettes, activeColor, onChange }: Props = $props();

  let colorInput: HTMLInputElement | undefined = $state();

  function select(color: string) {
    sidebar.setActiveColor(color);
    onChange?.(color);
  }

  function openPicker() {
    colorInput?.click();
  }

  function onPicked(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    sidebar.addCustomColor(value);
    select(value);
  }

  function onContext(e: MouseEvent, paletteId: string, color: string) {
    if (paletteId !== 'custom') return;
    e.preventDefault();
    sidebar.removeCustomColor(color);
  }
</script>

<div class="palette">
  {#each palettes as palette (palette.id)}
    {#if palette.colors.length > 0}
      <div class="row" role="group" aria-label={palette.name}>
        {#each palette.colors as color (color)}
          <button
            type="button"
            class="swatch"
            class:active={color === activeColor}
            style="background: {color}"
            title={color}
            aria-label={`${palette.name} ${color}`}
            oncontextmenu={(e) => onContext(e, palette.id, color)}
            onclick={() => select(color)}
          ></button>
        {/each}
      </div>
    {/if}
  {/each}

  <button type="button" class="add" title="Add custom color" onclick={openPicker}> + </button>
  <input
    bind:this={colorInput}
    type="color"
    class="hidden-color"
    aria-hidden="true"
    tabindex="-1"
    onchange={onPicked}
  />
</div>

<style>
  .palette {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .swatch {
    width: 22px;
    height: 22px;
    border-radius: 4px;
    border: 1px solid #3a3a3a;
    padding: 0;
    cursor: pointer;
    box-sizing: border-box;
  }
  .swatch:hover {
    transform: scale(1.08);
  }
  .swatch.active {
    outline: 2px solid #7ab7ff;
    outline-offset: 1px;
  }
  .add {
    width: 22px;
    height: 22px;
    border-radius: 4px;
    border: 1px dashed #666;
    background: transparent;
    color: #bbb;
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
  }
  .add:hover {
    color: #fff;
    border-color: #aaa;
  }
  .hidden-color {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
  }
</style>
