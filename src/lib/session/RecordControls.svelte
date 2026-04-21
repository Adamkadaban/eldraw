<script lang="ts">
  import { recorder, recorderState } from './recorder';
  import { replayState } from './store';
  import { pdf } from '$lib/store/pdf';
  import { formatDurationMs } from './types';
  import { log } from '$lib/log';

  const r = $derived($recorderState);
  const rp = $derived($replayState);
  const pdfState = $derived($pdf);
  const canRecord = $derived(!!pdfState.source && !rp.active);

  async function onStart() {
    const path = pdfState.source?.path ?? null;
    if (!path) return;
    try {
      await recorder.start(path);
    } catch (err) {
      log('session', `record start failed ${String(err)}`);
    }
  }

  async function onStop() {
    try {
      await recorder.stop();
    } catch (err) {
      log('session', `record stop failed ${String(err)}`);
    }
  }
</script>

{#if r.status === 'idle' || r.status === 'error'}
  <button
    type="button"
    class="rec-btn"
    disabled={!canRecord}
    title={rp.active ? 'Stop replay to record' : 'Record session'}
    aria-label="Record session"
    onclick={onStart}
  >
    <span class="dot" aria-hidden="true"></span>
    <span>Record</span>
  </button>
  {#if r.error}
    <span class="rec-err" title={r.error}>mic err</span>
  {/if}
{:else if r.status === 'requesting'}
  <button type="button" class="rec-btn" disabled>
    <span class="dot pending" aria-hidden="true"></span>
    <span>…</span>
  </button>
{:else}
  <button
    type="button"
    class="rec-btn recording"
    onclick={onStop}
    title="Stop recording"
    aria-label="Stop recording"
  >
    <span class="dot active" aria-hidden="true"></span>
    <span>{formatDurationMs(r.elapsedMs)}</span>
  </button>
{/if}

<style>
  .rec-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: #2a2a2a;
    border: 1px solid #3a3a3a;
    color: #ddd;
    border-radius: 4px;
    padding: 3px 10px;
    cursor: pointer;
    font: inherit;
    font-size: 12px;
  }
  .rec-btn:hover:not(:disabled) {
    border-color: #666;
  }
  .rec-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    border: 1.5px solid #c84040;
    background: transparent;
  }
  .dot.active {
    background: #c84040;
    border-color: #c84040;
    animation: rec-pulse 1.2s ease-in-out infinite;
  }
  .dot.pending {
    background: #888;
    border-color: #888;
  }
  .rec-btn.recording {
    border-color: #c84040;
    color: #ffd8d8;
  }
  .rec-err {
    color: #ff8080;
    font-size: 11px;
  }
  @keyframes rec-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.55;
    }
  }
</style>
