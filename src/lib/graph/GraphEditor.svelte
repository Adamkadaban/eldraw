<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { GraphFunction, GraphFunctionKind, GraphObject, GraphParameter } from '$lib/types';
  import { parseExpressionWithParams, parseExpressionXYWithParams } from '$lib/graph/parser';
  import { clampParameter, parametersForGraph } from '$lib/graph/parameters';
  import { createRafBatcher } from '$lib/canvas/inkBatch';
  import { createGraphFunction } from './graphObject';

  interface Props {
    graph: GraphObject;
    onUpdate: (patch: Partial<GraphObject>) => void;
    onPreview?: (patch: Partial<GraphObject>) => void;
    onDelete: () => void;
    onClose: () => void;
  }

  let { graph, onUpdate, onPreview = () => {}, onDelete, onClose }: Props = $props();

  let previewParameters = $state<GraphParameter[] | null>(null);
  const persistedParameters = $derived(parametersForGraph(graph));
  const displayedParameters = $derived(previewParameters ?? persistedParameters);
  const persistedParameterSignature = $derived(
    `${graph.id}:${JSON.stringify(graph.parameters ?? [])}`,
  );

  $effect(() => {
    void persistedParameterSignature;
    previewParameters = null;
  });

  const previewBatcher = createRafBatcher<GraphParameter[]>((batches) => {
    const latest = batches[batches.length - 1];
    if (latest) onPreview({ parameters: latest.map((parameter) => ({ ...parameter })) });
  });

  onDestroy(() => previewBatcher.cancel());

  function applyFunctions(functions: GraphFunction[]): void {
    const parameters = parametersForGraph({ ...graph, functions });
    previewParameters = null;
    onUpdate({ functions, parameters });
  }

  function updateFunction(id: string, patch: Partial<GraphFunction>): void {
    applyFunctions(graph.functions.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  function removeFunction(id: string): void {
    applyFunctions(graph.functions.filter((f) => f.id !== id));
  }

  function addFunction(): void {
    applyFunctions([...graph.functions, createGraphFunction()]);
  }

  function setRange(axis: 'x' | 'y', which: 0 | 1, value: number): void {
    if (!Number.isFinite(value)) return;
    const range = axis === 'x' ? [...graph.xRange] : [...graph.yRange];
    range[which] = value;
    if (range[0] >= range[1]) return;
    onUpdate(
      axis === 'x' ? { xRange: range as [number, number] } : { yRange: range as [number, number] },
    );
  }

  function setGridStep(value: number): void {
    if (!Number.isFinite(value) || value < 0) return;
    onUpdate({ gridStep: value });
  }

  function exprError(
    expr: string,
    kind: GraphFunctionKind,
    parameters: readonly GraphParameter[],
  ): string | null {
    const r =
      kind === 'implicit'
        ? parseExpressionXYWithParams(expr, parameters)
        : parseExpressionWithParams(expr, parameters);
    return r.ok ? null : r.error;
  }

  function parameterWithPatch(
    name: string,
    patch: Partial<Omit<GraphParameter, 'name'>>,
  ): GraphParameter[] {
    return displayedParameters.map((parameter) =>
      parameter.name === name ? clampParameter({ ...parameter, ...patch }) : { ...parameter },
    );
  }

  function previewParameterValue(name: string, value: number): void {
    if (!Number.isFinite(value)) return;
    const next = parameterWithPatch(name, { value });
    previewParameters = next;
    previewBatcher.push(next);
  }

  function commitParameter(name: string, patch: Partial<Omit<GraphParameter, 'name'>>): void {
    const next = parameterWithPatch(name, patch);
    previewParameters = next;
    previewBatcher.flushNow();
    onUpdate({ parameters: next });
  }
</script>

<aside class="graph-editor" aria-label="Graph editor">
  <header class="head">
    <span class="title">Graph</span>
    <button type="button" class="close" aria-label="Close editor" onclick={onClose}>×</button>
  </header>

  <section class="row">
    <label>
      x:
      <input
        type="number"
        step="any"
        value={graph.xRange[0]}
        onchange={(e) => setRange('x', 0, Number((e.currentTarget as HTMLInputElement).value))}
      />
      –
      <input
        type="number"
        step="any"
        value={graph.xRange[1]}
        onchange={(e) => setRange('x', 1, Number((e.currentTarget as HTMLInputElement).value))}
      />
    </label>
  </section>

  <section class="row">
    <label>
      y:
      <input
        type="number"
        step="any"
        value={graph.yRange[0]}
        onchange={(e) => setRange('y', 0, Number((e.currentTarget as HTMLInputElement).value))}
      />
      –
      <input
        type="number"
        step="any"
        value={graph.yRange[1]}
        onchange={(e) => setRange('y', 1, Number((e.currentTarget as HTMLInputElement).value))}
      />
    </label>
  </section>

  <section class="row">
    <label>
      step:
      <input
        type="number"
        step="any"
        min="0"
        value={graph.gridStep}
        onchange={(e) => setGridStep(Number((e.currentTarget as HTMLInputElement).value))}
      />
    </label>
    <label class="checkbox">
      <input
        type="checkbox"
        checked={graph.showGrid}
        onchange={(e) => onUpdate({ showGrid: (e.currentTarget as HTMLInputElement).checked })}
      />
      grid
    </label>
    <label class="checkbox">
      <input
        type="checkbox"
        checked={graph.showAxes}
        onchange={(e) => onUpdate({ showAxes: (e.currentTarget as HTMLInputElement).checked })}
      />
      axes
    </label>
  </section>

  <section class="functions">
    <h4 class="section-title">Functions</h4>
    {#each graph.functions as fn (fn.id)}
      {@const kind = (fn.kind ?? 'explicit') as GraphFunctionKind}
      {@const err = exprError(fn.expr, kind, displayedParameters)}
      <div class="fn">
        <input
          type="color"
          value={fn.color}
          aria-label="Color"
          onchange={(e) =>
            updateFunction(fn.id, { color: (e.currentTarget as HTMLInputElement).value })}
        />
        <select
          class="kind"
          aria-label="Expression kind"
          value={kind}
          onchange={(e) =>
            updateFunction(fn.id, {
              kind: (e.currentTarget as HTMLSelectElement).value as GraphFunctionKind,
            })}
        >
          <option value="explicit">y=</option>
          <option value="implicit">f(x,y)=0</option>
        </select>
        <input
          class="expr"
          class:invalid={err !== null}
          type="text"
          spellcheck="false"
          value={fn.expr}
          placeholder={kind === 'implicit' ? 'e.g. x^2 + y^2 = 4' : 'e.g. sin(x)'}
          oninput={(e) =>
            updateFunction(fn.id, { expr: (e.currentTarget as HTMLInputElement).value })}
        />
        <button
          type="button"
          class="del"
          aria-label="Remove function"
          onclick={() => removeFunction(fn.id)}
          disabled={graph.functions.length <= 1}
        >
          ×
        </button>
        {#if err}
          <small class="err">{err}</small>
        {/if}
      </div>
    {/each}
    <button type="button" class="add" onclick={addFunction}>+ add function</button>
  </section>

  {#if displayedParameters.length > 0}
    <section class="parameters">
      <h4 class="section-title">Parameters</h4>
      {#each displayedParameters as parameter (parameter.name)}
        <div class="parameter">
          <div class="parameter-head">
            <span class="parameter-name">{parameter.name}</span>
            <label class="value-field">
              <span class="sr-only">{parameter.name} value</span>
              <input
                type="number"
                step={parameter.step}
                min={parameter.min}
                max={parameter.max}
                value={parameter.value}
                aria-label={`${parameter.name} value`}
                onchange={(e) =>
                  commitParameter(parameter.name, {
                    value: Number((e.currentTarget as HTMLInputElement).value),
                  })}
              />
            </label>
            <label class="chip-toggle">
              <input
                type="checkbox"
                checked={parameter.showChip === true}
                aria-label={`Show ${parameter.name} value on graph`}
                onchange={(e) =>
                  commitParameter(parameter.name, {
                    showChip: (e.currentTarget as HTMLInputElement).checked,
                  })}
              />
              chip
            </label>
          </div>

          <label class="slider-label">
            <span class="sr-only">{parameter.name} slider</span>
            <input
              type="range"
              min={parameter.min}
              max={parameter.max}
              step={parameter.step}
              value={parameter.value}
              aria-label={`${parameter.name} slider`}
              oninput={(e) =>
                previewParameterValue(
                  parameter.name,
                  Number((e.currentTarget as HTMLInputElement).value),
                )}
              onchange={(e) =>
                commitParameter(parameter.name, {
                  value: Number((e.currentTarget as HTMLInputElement).value),
                })}
            />
          </label>

          <details>
            <summary>range settings</summary>
            <div class="parameter-settings">
              <label>
                min
                <input
                  type="number"
                  step="any"
                  value={parameter.min}
                  aria-label={`${parameter.name} minimum`}
                  onchange={(e) =>
                    commitParameter(parameter.name, {
                      min: Number((e.currentTarget as HTMLInputElement).value),
                    })}
                />
              </label>
              <label>
                max
                <input
                  type="number"
                  step="any"
                  value={parameter.max}
                  aria-label={`${parameter.name} maximum`}
                  onchange={(e) =>
                    commitParameter(parameter.name, {
                      max: Number((e.currentTarget as HTMLInputElement).value),
                    })}
                />
              </label>
              <label>
                step
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={parameter.step}
                  aria-label={`${parameter.name} step`}
                  onchange={(e) =>
                    commitParameter(parameter.name, {
                      step: Number((e.currentTarget as HTMLInputElement).value),
                    })}
                />
              </label>
            </div>
          </details>
        </div>
      {/each}
    </section>
  {/if}

  <footer class="foot">
    <button type="button" class="delete" onclick={onDelete}>Delete graph</button>
  </footer>
</aside>

<style>
  .graph-editor {
    background: #252525;
    color: #e8e8e8;
    border: 1px solid #1a1a1a;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55);
    padding: 10px;
    width: 300px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 12px;
    pointer-events: auto;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .title {
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    font-size: 11px;
    color: #aaa;
  }
  .close {
    background: transparent;
    color: #ccc;
    border: 1px solid #3a3a3a;
    width: 22px;
    height: 22px;
    border-radius: 4px;
    cursor: pointer;
    line-height: 0;
  }
  .row {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .row label {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .row input[type='number'] {
    width: 56px;
    background: #1b1b1b;
    color: #eee;
    border: 1px solid #333;
    border-radius: 3px;
    padding: 2px 4px;
  }
  .checkbox {
    gap: 4px;
  }
  .section-title {
    margin: 0;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #bbb;
    font-weight: 500;
  }
  .functions {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .parameters {
    display: flex;
    flex-direction: column;
    gap: 7px;
    border-top: 1px solid #383838;
    padding-top: 8px;
  }
  .parameter {
    display: flex;
    flex-direction: column;
    gap: 5px;
    background: #202020;
    border: 1px solid #353535;
    border-radius: 5px;
    padding: 6px;
  }
  .parameter-head {
    display: grid;
    grid-template-columns: 24px 1fr auto;
    align-items: center;
    gap: 6px;
  }
  .parameter-name {
    color: #f0f0f0;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-weight: 600;
  }
  .value-field input,
  .parameter-settings input {
    box-sizing: border-box;
    width: 100%;
    background: #171717;
    color: #eee;
    border: 1px solid #3a3a3a;
    border-radius: 3px;
    padding: 2px 4px;
  }
  .chip-toggle {
    display: flex;
    align-items: center;
    gap: 3px;
    color: #bbb;
  }
  .slider-label,
  .slider-label input {
    display: block;
    width: 100%;
  }
  .slider-label input {
    accent-color: #64a6e8;
  }
  .parameter details {
    color: #aaa;
  }
  .parameter summary {
    cursor: pointer;
    font-size: 10px;
  }
  .parameter-settings {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 5px;
    padding-top: 5px;
  }
  .parameter-settings label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    color: #aaa;
    font-size: 10px;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .fn {
    display: grid;
    grid-template-columns: auto auto 1fr auto;
    gap: 6px;
    align-items: center;
  }
  .fn .kind {
    background: #1b1b1b;
    color: #eee;
    border: 1px solid #333;
    border-radius: 3px;
    padding: 2px 4px;
    font-size: 11px;
  }
  .fn .expr {
    background: #1b1b1b;
    color: #eee;
    border: 1px solid #333;
    border-radius: 3px;
    padding: 3px 6px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .fn .expr.invalid {
    border-color: #d32f2f;
  }
  .fn .del {
    background: transparent;
    border: 1px solid #3a3a3a;
    color: #ccc;
    width: 22px;
    height: 22px;
    border-radius: 4px;
    cursor: pointer;
    line-height: 0;
  }
  .fn .del:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .err {
    grid-column: 2 / span 3;
    color: #ef9a9a;
    font-size: 10px;
  }
  .add {
    align-self: flex-start;
    background: #2a2a2a;
    border: 1px solid #3a3a3a;
    color: #ddd;
    border-radius: 4px;
    padding: 3px 8px;
    cursor: pointer;
  }
  .delete {
    background: #3a1f1f;
    border: 1px solid #5a2c2c;
    color: #f3c7c7;
    border-radius: 4px;
    padding: 4px 8px;
    cursor: pointer;
  }
  .delete:hover {
    background: #4a2727;
  }
  .foot {
    display: flex;
    justify-content: flex-end;
  }
</style>
