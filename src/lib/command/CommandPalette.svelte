<script lang="ts">
  import { tick } from 'svelte';
  import { commandPaletteStore, closeCommandPalette } from './store';
  import { getCommands, type Command } from './commands';
  import { score } from './fuzzy';

  let query = $state('');
  let selected = $state(0);
  let inputEl: HTMLInputElement | null = $state(null);
  let listEl: HTMLUListElement | null = $state(null);

  let allCommands: Command[] = $state([]);

  const filtered = $derived.by<Array<{ cmd: Command; score: number }>>(() => {
    if (query.trim() === '') return allCommands.map((cmd) => ({ cmd, score: 0 }));
    const results: Array<{ cmd: Command; score: number }> = [];
    for (const cmd of allCommands) {
      const s = score(query, cmd.title);
      if (s !== null) results.push({ cmd, score: s });
    }
    results.sort((a, b) => b.score - a.score);
    return results;
  });

  $effect(() => {
    if ($commandPaletteStore.open) {
      query = '';
      selected = 0;
      allCommands = getCommands();
      void tick().then(() => inputEl?.focus());
    }
  });

  $effect(() => {
    void query;
    selected = 0;
  });

  $effect(() => {
    if (!$commandPaletteStore.open) return;
    const item = listEl?.querySelector<HTMLElement>(`[data-index="${selected}"]`);
    item?.scrollIntoView({ block: 'nearest' });
  });

  function runAt(index: number) {
    const entry = filtered[index];
    if (!entry) return;
    closeCommandPalette();
    entry.cmd.run();
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeCommandPalette();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (filtered.length === 0) return;
      selected = (selected + 1) % filtered.length;
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (filtered.length === 0) return;
      selected = (selected - 1 + filtered.length) % filtered.length;
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      runAt(selected);
    }
  }

  function onBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) closeCommandPalette();
  }
</script>

{#if $commandPaletteStore.open}
  <div
    class="backdrop"
    onclick={onBackdropClick}
    onkeydown={onKey}
    role="presentation"
    tabindex="-1"
  >
    <div class="palette" role="dialog" aria-modal="true" aria-label="Command palette">
      <input
        bind:this={inputEl}
        bind:value={query}
        type="text"
        class="input"
        placeholder="Type a command…"
        spellcheck="false"
        autocomplete="off"
      />
      {#if filtered.length === 0}
        <div class="empty">No matching commands</div>
      {:else}
        <ul bind:this={listEl} class="list" role="listbox">
          {#each filtered as entry, i (entry.cmd.id)}
            <li
              role="option"
              aria-selected={i === selected}
              class:selected={i === selected}
              data-index={i}
            >
              <button
                type="button"
                class="row"
                onmousemove={() => (selected = i)}
                onclick={() => runAt(i)}
              >
                <span class="title">{entry.cmd.title}</span>
                {#if entry.cmd.shortcut}
                  <span class="shortcut">{entry.cmd.shortcut}</span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 12vh;
    z-index: 1000;
  }
  .palette {
    width: min(560px, 92vw);
    max-height: 60vh;
    background: #252525;
    color: #eee;
    border: 1px solid #3a3a3a;
    border-radius: 8px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .input {
    background: transparent;
    border: none;
    border-bottom: 1px solid #3a3a3a;
    color: #eee;
    font: inherit;
    font-size: 15px;
    padding: 12px 14px;
    outline: none;
  }
  .input::placeholder {
    color: #888;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 4px 0;
    overflow-y: auto;
  }
  .row {
    width: 100%;
    background: transparent;
    border: none;
    color: inherit;
    font: inherit;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 14px;
    cursor: pointer;
    text-align: left;
  }
  .selected .row,
  .row:hover {
    background: #2f3a4a;
  }
  .title {
    color: #eee;
  }
  .shortcut {
    color: #9aa;
    font-size: 12px;
    letter-spacing: 0.02em;
  }
  .empty {
    padding: 16px;
    color: #888;
    text-align: center;
    font-size: 13px;
  }
</style>
