<script lang="ts">
  import { onMount } from 'svelte';
  import { shortcutsStore, shortcutBindings } from '$lib/store/shortcuts';
  import { SHORTCUT_COMMANDS, type ShortcutId } from '$lib/app/shortcutRegistry';
  import { formatEvent, formatSpec } from '$lib/app/shortcutParser';

  interface Props {
    onClose?: () => void;
  }

  let { onClose }: Props = $props();

  const bindings = $derived($shortcutBindings);
  let recordingId: ShortcutId | null = $state(null);
  let dialog: HTMLDivElement | null = $state(null);

  function startRecording(id: ShortcutId): void {
    recordingId = id;
  }

  function cancelRecording(): void {
    recordingId = null;
  }

  function onDialogKeyDown(event: KeyboardEvent): void {
    event.stopPropagation();

    if (event.key === 'Escape') {
      event.preventDefault();
      if (recordingId) {
        recordingId = null;
      } else {
        onClose?.();
      }
      return;
    }

    if (!recordingId) return;
    event.preventDefault();

    if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return;

    const spec = formatEvent(event);
    shortcutsStore.setBinding(recordingId, spec);
    recordingId = null;
  }

  function reset(id: ShortcutId): void {
    shortcutsStore.resetBinding(id);
  }

  function resetAll(): void {
    shortcutsStore.resetAll();
  }

  onMount(() => {
    dialog?.focus();
  });
</script>

<button
  type="button"
  class="backdrop"
  aria-label="Close shortcuts settings"
  onclick={() => onClose?.()}
></button>

<div
  class="dialog"
  role="dialog"
  aria-modal="true"
  aria-labelledby="shortcuts-title"
  bind:this={dialog}
  tabindex="-1"
  onkeydown={onDialogKeyDown}
>
  <header class="dialog-header">
    <h2 id="shortcuts-title">Keyboard shortcuts</h2>
    <div class="header-actions">
      <button type="button" class="secondary" onclick={resetAll}>Reset all</button>
      <button type="button" class="secondary" onclick={() => onClose?.()} aria-label="Close">
        ✕
      </button>
    </div>
  </header>

  <ul class="list">
    {#each SHORTCUT_COMMANDS as cmd (cmd.id)}
      {@const current = bindings[cmd.id]}
      {@const isRecording = recordingId === cmd.id}
      {@const isDefault = current === cmd.defaultSpec}
      <li class="row">
        <span class="label">{cmd.label}</span>
        <div class="controls">
          <button
            type="button"
            class="binding"
            class:recording={isRecording}
            aria-pressed={isRecording}
            onclick={() => (isRecording ? cancelRecording() : startRecording(cmd.id))}
          >
            {#if isRecording}
              Press a key…
            {:else}
              {formatSpec(current)}
            {/if}
          </button>
          <button
            type="button"
            class="reset"
            disabled={isDefault}
            title={isDefault ? 'Already default' : `Reset to ${formatSpec(cmd.defaultSpec)}`}
            onclick={() => reset(cmd.id)}
          >
            Reset
          </button>
        </div>
      </li>
    {/each}
  </ul>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    z-index: 1000;
    border: 0;
    padding: 0;
  }
  .dialog {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(620px, 90vw);
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    background: #1b1b1b;
    color: #ddd;
    border: 1px solid #333;
    border-radius: 8px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
    z-index: 1001;
  }
  .dialog:focus {
    outline: none;
  }
  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid #333;
  }
  .dialog-header h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0.02em;
  }
  .header-actions {
    display: flex;
    gap: 8px;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 8px 0;
    overflow-y: auto;
    flex: 1;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 6px 16px;
  }
  .row:hover {
    background: #222;
  }
  .label {
    font-size: 13px;
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  button {
    font: inherit;
    background: #2a2a2a;
    color: #ddd;
    border: 1px solid #444;
    border-radius: 4px;
    padding: 4px 10px;
    cursor: pointer;
  }
  button:hover:not(:disabled) {
    border-color: #666;
  }
  button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .binding {
    min-width: 140px;
    text-align: center;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
  }
  .binding.recording {
    border-color: #7ab7ff;
    background: #2a3847;
    color: #fff;
  }
  .secondary {
    background: transparent;
  }
  .reset {
    font-size: 12px;
  }
</style>
