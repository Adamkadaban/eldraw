<script lang="ts">
  import type { DashStyle } from '$lib/types';

  interface Props {
    value: DashStyle;
    onChange?: (dash: DashStyle) => void;
  }

  let { value, onChange }: Props = $props();

  const order: DashStyle[] = ['solid', 'dashed', 'dotted'];

  function cycle() {
    const idx = order.indexOf(value);
    const next = order[(idx + 1) % order.length];
    onChange?.(next);
  }

  function select(dash: DashStyle) {
    if (dash !== value) onChange?.(dash);
  }
</script>

<div class="dash">
  <div class="header">
    <span class="label">Dash</span>
    <button
      type="button"
      class="cycle"
      aria-label="Cycle dash style"
      title="Cycle dash (D)"
      onclick={cycle}>{value}</button
    >
  </div>
  <div class="row" role="group" aria-label="Dash style">
    {#each order as style (style)}
      <button
        type="button"
        class="option"
        class:active={style === value}
        title={style}
        aria-pressed={style === value}
        onclick={() => select(style)}
      >
        <svg viewBox="0 0 60 12" width="60" height="12" aria-hidden="true">
          <line
            x1="2"
            y1="6"
            x2="58"
            y2="6"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-dasharray={style === 'solid' ? undefined : style === 'dashed' ? '8 5' : '1 5'}
          />
        </svg>
      </button>
    {/each}
  </div>
</div>

<style>
  .dash {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: #bbb;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .cycle {
    background: transparent;
    border: none;
    color: #eee;
    text-transform: none;
    font: inherit;
    cursor: pointer;
    letter-spacing: 0;
  }
  .row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  .option {
    background: #1b1b1b;
    border: 1px solid #333;
    color: #ccc;
    border-radius: 4px;
    padding: 6px 4px;
    cursor: pointer;
    display: grid;
    place-items: center;
  }
  .option:hover {
    border-color: #555;
    color: #fff;
  }
  .option.active {
    border-color: #7ab7ff;
    color: #fff;
    background: #2a3847;
  }
</style>
