<script lang="ts">
  import { tick } from 'svelte';
  import { pdf } from '$lib/store/pdf';
  import { listSessions, readSession, readSessionAudio, deleteSession } from './ipc';
  import { replay, replayState } from './store';
  import { recorderState } from './recorder';
  import type { SessionListEntry } from './types';
  import { formatDurationMs } from './types';
  import { log } from '$lib/log';

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  const pdfState = $derived($pdf);
  const replaySt = $derived($replayState);
  const rec = $derived($recorderState);
  let entries = $state<SessionListEntry[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let panelEl = $state<HTMLDivElement | null>(null);
  let previousFocus: HTMLElement | null = null;

  async function refresh() {
    const path = pdfState.source?.path;
    if (!path) {
      entries = [];
      return;
    }
    loading = true;
    error = null;
    try {
      entries = await listSessions(path);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    void open;
    void pdfState.source?.path;
    void rec.status;
    if (open) void refresh();
  });

  $effect(() => {
    if (!open) return;
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void tick().then(() => {
      const first = panelEl?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      first?.focus();
    });
    return () => {
      previousFocus?.focus();
      previousFocus = null;
    };
  });

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  }

  async function onOpenReplay(entry: SessionListEntry) {
    const path = pdfState.source?.path;
    if (!path) return;
    if (rec.status === 'recording' || rec.status === 'paused') {
      error = 'Stop recording before replaying';
      return;
    }
    try {
      const session = await readSession(path, entry.id);
      const bytes = await readSessionAudio(path, entry.id);
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: session.audioMime });
      const url = URL.createObjectURL(blob);
      replay.enter(entry, url);
      onClose();
      // Player is wired up by the ReplayBar / ReplayLayer via the audio element.
      // We pass `session` through window custom event so ReplayBar picks it up.
      window.dispatchEvent(new CustomEvent('eldraw:replay-load', { detail: { session, url } }));
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      log('session', `replay load failed ${String(err)}`);
    }
  }

  async function onDelete(entry: SessionListEntry, evt: MouseEvent) {
    evt.stopPropagation();
    const path = pdfState.source?.path;
    if (!path) return;
    if (!window.confirm(`Delete session "${entry.name}"?`)) return;
    try {
      await deleteSession(path, entry.id);
      await refresh();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  function formatDate(ms: number): string {
    const d = new Date(ms);
    return d.toLocaleString();
  }
</script>

{#if open}
  <div
    class="overlay"
    role="dialog"
    aria-label="Sessions"
    aria-modal="true"
    bind:this={panelEl}
    onkeydown={onKeydown}
    tabindex="-1"
  >
    <div class="panel">
      <header>
        <h2>Sessions</h2>
        <button type="button" class="close" onclick={onClose} aria-label="Close">×</button>
      </header>
      <div class="body">
        {#if !pdfState.source}
          <p class="dim">Open a PDF to see its sessions.</p>
        {:else if loading}
          <p class="dim">Loading…</p>
        {:else if entries.length === 0}
          <p class="dim">No sessions yet. Press Record in the toolbar to create one.</p>
        {:else}
          <ul>
            {#each entries as entry (entry.id)}
              <li>
                <button
                  type="button"
                  class="row"
                  onclick={() => onOpenReplay(entry)}
                  disabled={!entry.hasAudio || replaySt.active}
                >
                  <span class="name">{entry.name}</span>
                  <span class="meta">
                    {formatDate(entry.createdAt)} · {formatDurationMs(entry.durationMs)}
                    {#if !entry.hasAudio}· <span class="warn">no audio</span>{/if}
                  </span>
                </button>
                <button
                  type="button"
                  class="del"
                  aria-label="Delete session"
                  title="Delete session"
                  onclick={(e) => onDelete(entry, e)}>🗑</button
                >
              </li>
            {/each}
          </ul>
        {/if}
        {#if error}<p class="error">{error}</p>{/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }
  .panel {
    background: #1e1e1e;
    border: 1px solid #333;
    border-radius: 6px;
    width: min(560px, 90vw);
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    color: #ddd;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid #333;
  }
  header h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
  }
  .close {
    background: none;
    border: none;
    color: #aaa;
    font-size: 20px;
    cursor: pointer;
    padding: 0 6px;
  }
  .body {
    padding: 10px 14px;
    overflow-y: auto;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 0;
  }
  .row {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    background: #252525;
    border: 1px solid #333;
    color: #ddd;
    padding: 8px 10px;
    border-radius: 4px;
    cursor: pointer;
    text-align: left;
  }
  .row:hover:not(:disabled) {
    border-color: #666;
  }
  .row:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .name {
    font-size: 13px;
  }
  .meta {
    font-size: 11px;
    color: #888;
  }
  .warn {
    color: #e0a040;
  }
  .del {
    background: transparent;
    border: 1px solid transparent;
    color: #888;
    cursor: pointer;
    font-size: 14px;
    border-radius: 4px;
    padding: 4px 6px;
  }
  .del:hover {
    color: #ff8080;
    border-color: #553;
  }
  .dim {
    color: #777;
    font-size: 12px;
  }
  .error {
    color: #ff8080;
    font-size: 12px;
  }
</style>
