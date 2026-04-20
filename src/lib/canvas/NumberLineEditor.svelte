<script lang="ts">
  import type { NumberLineMarkKind, NumberLineObject } from '$lib/types';

  interface Props {
    nl: NumberLineObject;
    ptToPx: number;
    onchange?: (patch: Partial<NumberLineObject>) => void;
    onclose?: () => void;
  }

  let { nl, ptToPx, onchange, onclose }: Props = $props();

  let newMarkValue = $state(0);
  let newMarkKind: NumberLineMarkKind = $state('closed');

  const left = $derived(nl.from.x * ptToPx);
  const top = $derived(nl.from.y * ptToPx + 28);

  function setField<K extends 'min' | 'max' | 'tickStep' | 'labelStep'>(key: K, value: number) {
    if (!Number.isFinite(value)) return;
    onchange?.({ [key]: value } as Partial<NumberLineObject>);
  }

  function addMark() {
    onchange?.({ marks: [...nl.marks, { value: newMarkValue, kind: newMarkKind }] });
  }

  function removeMark(idx: number) {
    onchange?.({ marks: nl.marks.filter((_, i) => i !== idx) });
  }
</script>

<div class="editor" style="left: {left}px; top: {top}px;">
  <div class="row">
    <label
      >min<input
        type="number"
        value={nl.min}
        oninput={(e) => setField('min', Number(e.currentTarget.value))}
      /></label
    >
    <label
      >max<input
        type="number"
        value={nl.max}
        oninput={(e) => setField('max', Number(e.currentTarget.value))}
      /></label
    >
  </div>
  <div class="row">
    <label
      >tick<input
        type="number"
        min="0"
        step="0.1"
        value={nl.tickStep}
        oninput={(e) => setField('tickStep', Number(e.currentTarget.value))}
      /></label
    >
    <label
      >label<input
        type="number"
        min="0"
        step="0.1"
        value={nl.labelStep}
        oninput={(e) => setField('labelStep', Number(e.currentTarget.value))}
      /></label
    >
  </div>
  <div class="marks">
    <span class="head">Marks</span>
    {#each nl.marks as m, i (i)}
      <div class="mark-row">
        <span>{m.value}</span>
        <span class="kind">{m.kind}</span>
        <button type="button" onclick={() => removeMark(i)} aria-label="Remove mark">×</button>
      </div>
    {/each}
    <div class="add-row">
      <input type="number" bind:value={newMarkValue} aria-label="Mark value" step="0.1" />
      <select bind:value={newMarkKind} aria-label="Mark kind">
        <option value="closed">closed</option>
        <option value="open">open</option>
        <option value="arrow-left">arrow ←</option>
        <option value="arrow-right">arrow →</option>
      </select>
      <button type="button" onclick={addMark}>Add</button>
    </div>
  </div>
  <div class="foot">
    <button type="button" onclick={() => onclose?.()}>Done</button>
  </div>
</div>

<style>
  .editor {
    position: absolute;
    background: #2a2a2a;
    border: 1px solid #444;
    border-radius: 6px;
    padding: 8px;
    color: #eee;
    font-size: 12px;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5);
    pointer-events: auto;
    min-width: 220px;
    z-index: 10;
  }
  .row {
    display: flex;
    gap: 8px;
    margin-bottom: 6px;
  }
  label {
    display: flex;
    flex-direction: column;
    flex: 1;
    font-size: 10px;
    color: #aaa;
  }
  input,
  select {
    background: #1c1c1c;
    color: #eee;
    border: 1px solid #444;
    border-radius: 3px;
    padding: 2px 4px;
    width: 100%;
    box-sizing: border-box;
  }
  .marks {
    display: flex;
    flex-direction: column;
    gap: 4px;
    border-top: 1px solid #333;
    padding-top: 6px;
  }
  .head {
    font-size: 10px;
    color: #aaa;
    text-transform: uppercase;
  }
  .mark-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .mark-row .kind {
    color: #aaa;
    font-size: 11px;
    flex: 1;
  }
  .mark-row button {
    background: transparent;
    border: 1px solid #555;
    color: #eee;
    border-radius: 3px;
    cursor: pointer;
    padding: 0 6px;
  }
  .add-row {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    gap: 4px;
  }
  .add-row button {
    background: #2f4a6e;
    border: 1px solid #4a6a90;
    color: #fff;
    border-radius: 3px;
    cursor: pointer;
    padding: 2px 8px;
  }
  .foot {
    margin-top: 6px;
    text-align: right;
  }
  .foot button {
    background: #1b1b1b;
    border: 1px solid #444;
    color: #eee;
    padding: 2px 10px;
    border-radius: 3px;
    cursor: pointer;
  }
</style>
