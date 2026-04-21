<script lang="ts">
  import { closeConfigDialog, configDialog } from './dialog';
  import { applyConfig } from './import';
  import { shortcutsStore } from '$lib/store/shortcuts';
  import { sidebar } from '$lib/store/sidebar';

  function confirmImport(): void {
    const state = $configDialog;
    if (state.kind !== 'import-preview') return;
    applyConfig(state.incoming);
    closeConfigDialog();
  }

  function escalateReset(): void {
    const state = $configDialog;
    if (state.kind !== 'reset-confirm') return;
    if (state.step === 1) {
      configDialog.set({ kind: 'reset-confirm', step: 2 });
      return;
    }
    shortcutsStore.resetAll();
    sidebar.reset();
    closeConfigDialog();
  }
</script>

{#if $configDialog.kind !== 'closed'}
  <div class="backdrop" role="presentation" onclick={closeConfigDialog}>
    <div
      class="modal"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => {
        if (e.key === 'Escape') closeConfigDialog();
      }}
    >
      {#if $configDialog.kind === 'import-preview'}
        <h2>Import settings from {$configDialog.filename}</h2>
        {#if $configDialog.diff.hasChanges}
          <ul class="diff">
            {#each $configDialog.diff.sections as section (section.section)}
              <li>
                <strong>{section.section}</strong> — {section.summary}
                <ul>
                  {#each section.changes as change}
                    <li><code>{change}</code></li>
                  {/each}
                </ul>
              </li>
            {/each}
          </ul>
        {:else}
          <p>Nothing to change — the incoming config matches your current settings.</p>
        {/if}
        <div class="actions">
          <button type="button" onclick={closeConfigDialog}>Cancel</button>
          <button
            type="button"
            class="primary"
            disabled={!$configDialog.diff.hasChanges}
            onclick={confirmImport}>Apply</button
          >
        </div>
      {:else if $configDialog.kind === 'import-error'}
        <h2>Couldn't import settings</h2>
        <p class="error">{$configDialog.error.message}</p>
        <div class="actions">
          <button type="button" class="primary" onclick={closeConfigDialog}>Close</button>
        </div>
      {:else if $configDialog.kind === 'reset-confirm'}
        <h2>Reset settings to defaults?</h2>
        {#if $configDialog.step === 1}
          <p>This will clear all shortcut customizations and sidebar tool presets.</p>
        {:else}
          <p><strong>Are you sure?</strong> This cannot be undone from this dialog.</p>
        {/if}
        <div class="actions">
          <button type="button" onclick={closeConfigDialog}>Cancel</button>
          <button type="button" class="danger" onclick={escalateReset}>
            {$configDialog.step === 1 ? 'Continue…' : 'Reset everything'}
          </button>
        </div>
      {/if}
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
    max-height: 80vh;
    overflow-y: auto;
  }
  h2 {
    margin: 0 0 10px;
    font-size: 15px;
  }
  .diff {
    list-style: none;
    padding: 0;
    margin: 0 0 12px;
  }
  .diff > li {
    margin-bottom: 8px;
  }
  .diff ul {
    margin: 4px 0 0 16px;
    padding: 0;
    list-style: disc;
  }
  code {
    font-size: 12px;
    color: #bcd;
  }
  .error {
    color: #f88;
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
  button:hover {
    background: #3a3a3a;
  }
  button.primary {
    background: #3a5a9a;
    border-color: #4d77c4;
  }
  button.primary:disabled {
    opacity: 0.5;
    cursor: default;
  }
  button.danger {
    background: #8a2d2d;
    border-color: #b14343;
  }
</style>
