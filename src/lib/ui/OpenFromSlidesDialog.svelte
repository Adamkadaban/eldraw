<script lang="ts">
  import { tick } from 'svelte';
  import { parseSlidesUrl } from '$lib/slides/url';
  import { fetchSlidesPdf } from '$lib/slides/ipc';

  interface Props {
    open: boolean;
    onCancel: () => void;
    onLoaded: (path: string) => void | Promise<void>;
  }

  const { open, onCancel, onLoaded }: Props = $props();

  let modalEl: HTMLDivElement | null = $state(null);
  let inputEl: HTMLInputElement | null = $state(null);
  let url = $state('');
  let error = $state<string | null>(null);
  let busy = $state(false);

  $effect(() => {
    if (open) {
      url = '';
      error = null;
      busy = false;
      void tick().then(() => inputEl?.focus());
    }
  });

  async function submit(): Promise<void> {
    if (busy) return;
    const parsed = parseSlidesUrl(url);
    if (!parsed.ok) {
      error = parsed.error;
      return;
    }
    error = null;
    busy = true;
    try {
      const path = await fetchSlidesPdf(url.trim());
      await onLoaded(path);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && !busy) onCancel();
  }
</script>

{#if open}
  <div class="backdrop" role="presentation" onclick={() => !busy && onCancel()}>
    <div
      bind:this={modalEl}
      class="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="slides-dialog-title"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={onKeydown}
    >
      <h2 id="slides-dialog-title">Open from Google Slides</h2>
      <p class="hint">
        Paste a public Google Slides link. The deck must be shared with "Anyone with the link" or
        published to the web.
      </p>
      <form
        onsubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          bind:this={inputEl}
          bind:value={url}
          type="url"
          placeholder="https://docs.google.com/presentation/d/…"
          autocomplete="off"
          spellcheck="false"
          disabled={busy}
        />
        {#if error}
          <p class="error" role="alert">{error}</p>
        {/if}
        <div class="actions">
          <button type="button" onclick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" class="primary" disabled={busy || url.trim() === ''}>
            {busy ? 'Fetching…' : 'Open'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1100;
  }
  .modal {
    background: #252525;
    color: #eee;
    border: 1px solid #3a3a3a;
    border-radius: 10px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
    padding: 18px 22px;
    width: min(560px, 92vw);
  }
  h2 {
    margin: 0 0 6px;
    font-size: 15px;
  }
  .hint {
    margin: 0 0 12px;
    font-size: 12px;
    color: #bbb;
  }
  input {
    width: 100%;
    background: #1b1b1b;
    color: #eee;
    border: 1px solid #444;
    border-radius: 6px;
    padding: 8px 10px;
    font: inherit;
    box-sizing: border-box;
  }
  input:focus {
    outline: none;
    border-color: #4d77c4;
  }
  .error {
    margin: 8px 0 0;
    color: #f88;
    font-size: 12px;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 14px;
  }
  button {
    background: #333;
    color: #eee;
    border: 1px solid #444;
    border-radius: 6px;
    padding: 6px 12px;
    cursor: pointer;
    font: inherit;
  }
  button:hover:not(:disabled) {
    background: #3a3a3a;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  button.primary {
    background: #3a5a9a;
    border-color: #4d77c4;
  }
</style>
