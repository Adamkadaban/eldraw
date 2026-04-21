<script lang="ts">
  import { onMount } from 'svelte';
  import GraphStyleSection from './GraphStyleSection.svelte';

  interface Props {
    onClose?: () => void;
  }

  let { onClose }: Props = $props();
  let dialog: HTMLDivElement | null = $state(null);

  function onKeyDown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose?.();
    }
  }

  onMount(() => {
    dialog?.focus();
  });
</script>

<button
  type="button"
  class="backdrop"
  aria-label="Close appearance settings"
  onclick={() => onClose?.()}
></button>

<div
  class="dialog"
  role="dialog"
  aria-modal="true"
  aria-labelledby="appearance-title"
  bind:this={dialog}
  tabindex="-1"
  onkeydown={onKeyDown}
>
  <header class="dialog-header">
    <h2 id="appearance-title">Appearance</h2>
    <button type="button" class="close" onclick={() => onClose?.()} aria-label="Close"> ✕ </button>
  </header>
  <div class="body">
    <GraphStyleSection />
  </div>
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
    width: min(520px, 90vw);
    max-height: 85vh;
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
    padding: 10px 14px;
    border-bottom: 1px solid #2a2a2a;
  }
  .dialog-header h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 0.02em;
  }
  .close {
    background: transparent;
    color: #ddd;
    border: 1px solid #333;
    border-radius: 4px;
    padding: 2px 8px;
    cursor: pointer;
    font: inherit;
  }
  .close:hover {
    border-color: #666;
  }
  .body {
    padding: 14px;
    overflow-y: auto;
  }
</style>
