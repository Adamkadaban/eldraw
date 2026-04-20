<script lang="ts">
  import type { TextObject } from '$lib/types';
  import { renderLatex } from '$lib/text/latex';

  interface Props {
    objects: TextObject[];
    ptToPx: number;
    interactive?: boolean;
    onpick?: (obj: TextObject, screen: { x: number; y: number }) => void;
    onemptyclick?: (at: { x: number; y: number }, screen: { x: number; y: number }) => void;
  }

  let { objects, ptToPx, interactive = false, onpick, onemptyclick }: Props = $props();

  interface Rendered {
    obj: TextObject;
    html: string;
    errored: boolean;
  }

  const rendered = $derived<Rendered[]>(
    objects.map((obj) => {
      if (!obj.latex) {
        return { obj, html: '', errored: false };
      }
      const r = renderLatex(obj.content);
      return { obj, html: r.html, errored: !r.ok };
    }),
  );

  function onEmpty(event: MouseEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const at = {
      x: (event.clientX - rect.left) / ptToPx,
      y: (event.clientY - rect.top) / ptToPx,
    };
    onemptyclick?.(at, { x: event.clientX, y: event.clientY });
  }

  function onPick(event: MouseEvent, obj: TextObject) {
    event.stopPropagation();
    onpick?.(obj, { x: event.clientX, y: event.clientY });
  }
</script>

<div class="text-layer" class:interactive>
  {#if interactive}
    <button
      type="button"
      class="empty-catcher"
      aria-label="Create text at click position"
      onclick={onEmpty}
    ></button>
  {/if}

  {#each rendered as item (item.obj.id)}
    {@const o = item.obj}
    {#if interactive}
      <button
        type="button"
        class="text-obj text-button"
        class:latex={o.latex}
        class:errored={item.errored}
        style="left: {o.at.x * ptToPx}px; top: {o.at.y *
          ptToPx}px; color: {o.color}; font-size: {o.fontSize * ptToPx}px;"
        onclick={(e) => onPick(e, o)}
      >
        {#if o.latex && !item.errored}
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {@html item.html}
        {:else if o.latex && item.errored}
          <span class="raw">{o.content}</span>
        {:else}
          {o.content}
        {/if}
      </button>
    {:else if o.latex}
      <div
        class="text-obj latex"
        class:errored={item.errored}
        style="left: {o.at.x * ptToPx}px; top: {o.at.y *
          ptToPx}px; color: {o.color}; font-size: {o.fontSize * ptToPx}px;"
      >
        {#if item.errored}
          <span class="raw">{o.content}</span>
        {:else}
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          {@html item.html}
        {/if}
      </div>
    {:else}
      <div
        class="text-obj plain"
        style="left: {o.at.x * ptToPx}px; top: {o.at.y *
          ptToPx}px; color: {o.color}; font-size: {o.fontSize * ptToPx}px;"
      >
        {o.content}
      </div>
    {/if}
  {/each}
</div>

<style>
  .text-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .text-layer.interactive {
    pointer-events: auto;
  }
  .empty-catcher {
    position: absolute;
    inset: 0;
    background: transparent;
    border: 0;
    padding: 0;
    margin: 0;
    cursor: text;
    z-index: 0;
  }
  .text-obj {
    position: absolute;
    white-space: pre;
    line-height: 1.2;
    user-select: none;
    transform-origin: top left;
    pointer-events: none;
  }
  .text-button {
    background: transparent;
    border: 1px dashed transparent;
    padding: 0 2px;
    margin: 0;
    font: inherit;
    text-align: left;
    color: inherit;
    cursor: pointer;
    pointer-events: auto;
    z-index: 1;
  }
  .text-button:hover,
  .text-button:focus-visible {
    border-color: #7ab7ff;
    outline: none;
  }
  .text-obj.errored {
    color: #c0392b;
    text-decoration: underline dotted;
  }
  .text-obj.errored .raw,
  .text-button.errored .raw {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
</style>
