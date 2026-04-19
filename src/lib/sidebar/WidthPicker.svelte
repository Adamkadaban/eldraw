<script lang="ts">
  interface Props {
    value: number;
    color: string;
    min?: number;
    max?: number;
    onChange?: (width: number) => void;
  }

  let { value, color, min = 1, max = 40, onChange }: Props = $props();

  const dotSize = $derived(Math.min(max, Math.max(min, value)));

  function onInput(e: Event) {
    const next = Number((e.target as HTMLInputElement).value);
    onChange?.(next);
  }
</script>

<div class="width-picker">
  <div class="header">
    <span class="label">Width</span>
    <span class="value">{value}px</span>
  </div>
  <div class="row">
    <input type="range" {min} {max} {value} oninput={onInput} aria-label="Stroke width" />
    <div class="preview" aria-hidden="true">
      <span class="dot" style="width: {dotSize}px; height: {dotSize}px; background: {color};"
      ></span>
    </div>
  </div>
</div>

<style>
  .width-picker {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .header {
    display: flex;
    justify-content: space-between;
    color: #bbb;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .value {
    color: #eee;
    text-transform: none;
    letter-spacing: 0;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  input[type='range'] {
    flex: 1;
    accent-color: #7ab7ff;
  }
  .preview {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border: 1px solid #333;
    border-radius: 4px;
    background: #1b1b1b;
  }
  .dot {
    display: block;
    border-radius: 50%;
    max-width: 40px;
    max-height: 40px;
  }
</style>
