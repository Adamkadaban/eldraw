<script lang="ts">
  import { eraseDebug } from '$lib/store/eraseDebug';

  const stats = $derived($eraseDebug);
  let nowMs = $state(performance.now());

  $effect(() => {
    if (!stats.enabled) return;
    const id = window.setInterval(() => (nowMs = performance.now()), 100);
    return () => window.clearInterval(id);
  });

  const sinceLastMove = $derived(
    stats.lastPointerMoveAt > 0 ? Math.round(nowMs - stats.lastPointerMoveAt) : null,
  );
</script>

{#if stats.enabled}
  <div class="erase-debug" role="status" aria-label="Eraser debug overlay">
    <div class="row">erase hits/s: <strong>{stats.eraseHitsPerSec}</strong></div>
    <div class="row">pointermove/s: <strong>{stats.pointerMovesPerSec}</strong></div>
    <div class="row">
      last move: <strong>{sinceLastMove === null ? '—' : `${sinceLastMove}ms`}</strong>
    </div>
    <div class="row dim">
      total moves {stats.pointerMoves} · total hits {stats.eraseHits}
    </div>
  </div>
{/if}

<style>
  .erase-debug {
    position: fixed;
    bottom: 12px;
    right: 12px;
    background: rgba(10, 10, 10, 0.78);
    border: 1px solid #333;
    border-radius: 6px;
    color: #ddd;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    padding: 8px 10px;
    min-width: 180px;
    z-index: 1100;
    pointer-events: none;
  }
  .row {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .dim {
    color: #888;
    margin-top: 4px;
    border-top: 1px solid #2a2a2a;
    padding-top: 4px;
  }
</style>
