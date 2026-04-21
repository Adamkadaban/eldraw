<script lang="ts">
  import type { AnyObject, DashStyle } from '$lib/types';
  import { PRESET_COLORS } from '$lib/store/sidebar';
  import { supportsColor, supportsDash, supportsWidth } from './transform';

  interface Props {
    selectedObjects: AnyObject[];
    anchor: { left: number; top: number };
    onColorChange?: (color: string) => void;
    onWidthChange?: (width: number) => void;
    onDashChange?: (dash: DashStyle) => void;
    onDelete?: () => void;
    onDuplicate?: () => void;
    onBringForward?: () => void;
    onSendBackward?: () => void;
  }

  let {
    selectedObjects,
    anchor,
    onColorChange,
    onWidthChange,
    onDashChange,
    onDelete,
    onDuplicate,
    onBringForward,
    onSendBackward,
  }: Props = $props();

  const canColor = $derived(selectedObjects.some(supportsColor));
  const canWidth = $derived(selectedObjects.some(supportsWidth));
  const canDash = $derived(selectedObjects.some(supportsDash));

  const currentWidth = $derived.by(() => {
    for (const o of selectedObjects) {
      if (
        o.type === 'stroke' ||
        o.type === 'line' ||
        o.type === 'shape' ||
        o.type === 'numberline'
      ) {
        return o.style.width;
      }
      if (o.type === 'angleMark') return o.width;
    }
    return 2;
  });

  function pickColor(color: string) {
    onColorChange?.(color);
  }

  function changeWidth(e: Event) {
    const n = Number((e.target as HTMLInputElement).value);
    if (!Number.isFinite(n)) return;
    onWidthChange?.(n);
  }

  function changeDash(dash: DashStyle) {
    onDashChange?.(dash);
  }
</script>

<div
  class="selection-toolbar"
  role="toolbar"
  aria-label="Selection tools"
  style="left: {anchor.left}px; top: {anchor.top}px;"
>
  {#if canColor}
    <div class="group colors" role="group" aria-label="Color">
      {#each PRESET_COLORS as color (color)}
        <button
          type="button"
          class="swatch"
          style="background: {color};"
          aria-label={`Color ${color}`}
          onclick={() => pickColor(color)}
        ></button>
      {/each}
    </div>
  {/if}

  {#if canWidth}
    <div class="group" role="group" aria-label="Width">
      <input
        type="range"
        min="1"
        max="40"
        step="1"
        value={currentWidth}
        aria-label="Stroke width"
        oninput={changeWidth}
      />
    </div>
  {/if}

  {#if canDash}
    <div class="group dashes" role="group" aria-label="Dash style">
      <button type="button" aria-label="Solid" onclick={() => changeDash('solid')}>—</button>
      <button type="button" aria-label="Dashed" onclick={() => changeDash('dashed')}>- -</button>
      <button type="button" aria-label="Dotted" onclick={() => changeDash('dotted')}>···</button>
    </div>
  {/if}

  <div class="group ops" role="group" aria-label="Selection operations">
    <button type="button" aria-label="Duplicate" title="Duplicate (Ctrl+D)" onclick={onDuplicate}>
      ⎘
    </button>
    <button type="button" aria-label="Bring forward" title="Bring forward" onclick={onBringForward}>
      ↑
    </button>
    <button type="button" aria-label="Send backward" title="Send backward" onclick={onSendBackward}>
      ↓
    </button>
    <button type="button" class="danger" aria-label="Delete" title="Delete" onclick={onDelete}>
      🗑
    </button>
  </div>
</div>

<style>
  .selection-toolbar {
    position: absolute;
    z-index: 30;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px;
    background: #222;
    border: 1px solid #444;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.45);
    font-size: 12px;
    color: #eee;
    pointer-events: auto;
    user-select: none;
  }
  .group {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 4px;
    border-right: 1px solid #333;
  }
  .group:last-child {
    border-right: none;
  }
  .colors {
    flex-wrap: wrap;
    max-width: 220px;
  }
  .swatch {
    width: 16px;
    height: 16px;
    border-radius: 3px;
    border: 1px solid #555;
    cursor: pointer;
    padding: 0;
  }
  .swatch:hover {
    border-color: #fff;
  }
  .dashes button,
  .ops button {
    background: #2a2a2a;
    border: 1px solid #3a3a3a;
    color: #ddd;
    border-radius: 4px;
    padding: 2px 8px;
    cursor: pointer;
    min-width: 24px;
    height: 22px;
  }
  .dashes button:hover,
  .ops button:hover {
    border-color: #7ab7ff;
  }
  .ops .danger:hover {
    border-color: #e05555;
    color: #e05555;
  }
  input[type='range'] {
    width: 100px;
  }
</style>
