<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { renderLatex } from '$lib/text/latex';

  interface Props {
    initialContent: string;
    initialLatex: boolean;
    initialFontSize: number;
    initialColor: string;
    screenX: number;
    screenY: number;
    onok: (result: { content: string; latex: boolean; fontSize: number; color: string }) => void;
    oncancel: () => void;
  }

  let {
    initialContent,
    initialLatex,
    initialFontSize,
    initialColor,
    screenX,
    screenY,
    onok,
    oncancel,
  }: Props = $props();

  let content = $state(untrack(() => initialContent));
  let latex = $state(untrack(() => initialLatex));
  let fontSize = $state(untrack(() => initialFontSize));
  let color = $state(untrack(() => initialColor));
  let textarea: HTMLTextAreaElement | null = $state(null);

  const preview = $derived.by(() => {
    if (!latex || content.length === 0) return null;
    return renderLatex(content);
  });

  onMount(() => {
    textarea?.focus();
    textarea?.select();
  });

  function commit() {
    onok({ content, latex, fontSize, color });
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      oncancel();
      return;
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      commit();
    }
  }
</script>

<div
  class="editor"
  style="left: {screenX}px; top: {screenY}px;"
  role="dialog"
  tabindex="-1"
  aria-label="Edit text"
  onkeydown={onKeyDown}
>
  <textarea
    bind:this={textarea}
    bind:value={content}
    class="content"
    rows="3"
    placeholder={latex ? 'e.g. x^2 + y^2 = r^2' : 'Enter text…'}
  ></textarea>

  {#if latex && preview}
    <div class="preview" class:errored={!preview.ok} aria-live="polite">
      {#if preview.ok}
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        <span>{@html preview.html}</span>
      {:else}
        <span class="raw">{content}</span>
        <span class="err">{preview.error}</span>
      {/if}
    </div>
  {/if}

  <div class="row">
    <label class="check">
      <input type="checkbox" bind:checked={latex} />
      LaTeX
    </label>
    <label class="size">
      Size
      <input
        type="number"
        min="6"
        max="200"
        step="1"
        bind:value={fontSize}
        aria-label="Font size in points"
      />
    </label>
    <label class="color">
      Color
      <input type="color" bind:value={color} aria-label="Text color" />
    </label>
  </div>

  <div class="actions">
    <button type="button" class="cancel" onclick={oncancel}>Cancel</button>
    <button type="button" class="ok" onclick={commit}>OK</button>
  </div>
</div>

<style>
  .editor {
    position: fixed;
    z-index: 50;
    background: #2a2a2a;
    color: #eee;
    border: 1px solid #444;
    border-radius: 6px;
    padding: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
    width: 280px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 12px;
  }
  .content {
    width: 100%;
    box-sizing: border-box;
    background: #1b1b1b;
    color: #eee;
    border: 1px solid #3a3a3a;
    border-radius: 4px;
    padding: 6px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    resize: vertical;
  }
  .preview {
    min-height: 24px;
    background: #fff;
    color: #111;
    border-radius: 4px;
    padding: 6px;
    overflow-x: auto;
  }
  .preview.errored {
    background: #2a1717;
    color: #f5b6b6;
  }
  .preview .err {
    display: block;
    font-size: 10px;
    margin-top: 4px;
    opacity: 0.8;
  }
  .preview .raw {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .row {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }
  .row label {
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .row input[type='number'] {
    width: 50px;
    background: #1b1b1b;
    color: #eee;
    border: 1px solid #3a3a3a;
    border-radius: 3px;
    padding: 2px 4px;
  }
  .row input[type='color'] {
    width: 28px;
    height: 22px;
    padding: 0;
    border: 1px solid #3a3a3a;
    background: #1b1b1b;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }
  .actions button {
    background: #2a2a2a;
    border: 1px solid #3a3a3a;
    color: #ddd;
    border-radius: 4px;
    padding: 4px 12px;
    cursor: pointer;
  }
  .actions .ok {
    background: #2a4a78;
    border-color: #3a6aa0;
    color: #fff;
  }
  .actions button:hover {
    border-color: #888;
  }
</style>
