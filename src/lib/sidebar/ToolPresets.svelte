<script lang="ts">
  import type { ToolKind, ToolPreset } from '$lib/types';
  import { MAX_PRESETS, canPresetTool } from '$lib/store/sidebar';

  interface Props {
    presets: ToolPreset[];
    activeTool: ToolKind;
    onApply?: (id: string) => void;
    onCapture?: () => void;
    onRemove?: (id: string) => void;
  }

  let { presets, activeTool, onApply, onCapture, onRemove }: Props = $props();

  const ICON: Record<string, string> = {
    pen: '✏️',
    highlighter: '🖍️',
    line: '／',
    rect: '▭',
    ellipse: '◯',
    numberline: '↔',
  };

  const canCapture = $derived(presets.length < MAX_PRESETS && canPresetTool(activeTool));

  function dashTitle(dash: string): string {
    return dash === 'solid' ? '' : ` ${dash}`;
  }
</script>

<div class="presets">
  <div class="header">
    <h3 class="section-title">Presets</h3>
    <button
      type="button"
      class="capture"
      aria-label="Save current tool as preset"
      title={canCapture ? 'Save current tool as preset' : 'Presets full or tool not presettable'}
      disabled={!canCapture}
      onclick={onCapture}>+</button
    >
  </div>
  {#if presets.length === 0}
    <p class="empty">
      Configure a tool, then press <kbd>+</kbd> to save it. Recall with <kbd>Ctrl</kbd>+<kbd
        >1-9</kbd
      >.
    </p>
  {:else}
    <div class="grid" role="list">
      {#each presets as preset, i (preset.id)}
        <div class="slot" role="listitem">
          <button
            type="button"
            class="chip"
            title={`${preset.tool} ${preset.style.width}px${dashTitle(preset.style.dash)} — Ctrl+${i + 1}`}
            onclick={() => onApply?.(preset.id)}
          >
            <span class="dot" style="background: {preset.style.color};"></span>
            <span class="icon" aria-hidden="true">{ICON[preset.tool] ?? '?'}</span>
            <span class="w">{preset.style.width}</span>
            <span class="slot-num" aria-hidden="true">{i + 1}</span>
          </button>
          <button
            type="button"
            class="remove"
            aria-label={`Remove preset ${i + 1}`}
            title="Remove preset"
            onclick={() => onRemove?.(preset.id)}>×</button
          >
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .presets {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .section-title {
    font-size: 11px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #bbb;
    margin: 0;
    font-weight: 500;
  }
  .capture {
    background: #1b1b1b;
    border: 1px solid #333;
    color: #ddd;
    border-radius: 4px;
    width: 22px;
    height: 22px;
    line-height: 1;
    cursor: pointer;
    font-size: 14px;
  }
  .capture:hover:not(:disabled) {
    border-color: #7ab7ff;
    color: #fff;
  }
  .capture:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .empty {
    font-size: 10px;
    color: #888;
    margin: 0;
    line-height: 1.4;
  }
  .empty kbd {
    background: #1b1b1b;
    border: 1px solid #333;
    border-radius: 3px;
    padding: 0 3px;
    font-size: 9px;
    font-family: ui-monospace, monospace;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
  }
  .slot {
    position: relative;
  }
  .chip {
    width: 100%;
    background: #1b1b1b;
    border: 1px solid #333;
    color: #ddd;
    border-radius: 4px;
    padding: 6px 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    min-width: 0;
    overflow: hidden;
  }
  .chip:hover {
    border-color: #7ab7ff;
  }
  .dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid #555;
    flex: 0 0 auto;
  }
  .icon {
    font-size: 12px;
  }
  .w {
    font-variant-numeric: tabular-nums;
    color: #aaa;
  }
  .slot-num {
    margin-left: auto;
    font-size: 9px;
    color: #666;
  }
  .remove {
    position: absolute;
    top: -4px;
    right: -4px;
    width: 14px;
    height: 14px;
    line-height: 1;
    background: #2a2a2a;
    border: 1px solid #555;
    color: #ccc;
    border-radius: 50%;
    cursor: pointer;
    font-size: 10px;
    display: none;
    padding: 0;
  }
  .slot:hover .remove {
    display: block;
  }
  .remove:hover {
    border-color: #e53935;
    color: #fff;
    background: #e53935;
  }
</style>
