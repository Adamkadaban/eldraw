<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { player } from './player';
  import { chapterMarkers } from './player';
  import { replay, replayState } from './store';
  import { formatDurationMs, type Session } from './types';
  import { viewport } from '$lib/store/viewport';
  import { currentDocument } from '$lib/store/document';
  import { get } from 'svelte/store';

  const status = $derived($player);
  const replaySt = $derived($replayState);

  let audio: HTMLAudioElement;
  let session = $state<Session | null>(null);
  let markers = $state<{ t: number; page: number }[]>([]);

  function onLoad(event: Event) {
    const detail = (event as CustomEvent<{ session: Session; url: string }>).detail;
    if (!detail) return;
    session = detail.session;
    markers = chapterMarkers(detail.session.events);
    // audio element is bound; wait a microtask for it to exist
    queueMicrotask(() => {
      if (!audio) return;
      audio.src = detail.url;
      player.load(detail.session, audio, {
        onPageChange: (page) => {
          const doc = get(currentDocument);
          const total = doc?.pages.length ?? 0;
          if (total > 0) viewport.setPage(page, total);
        },
      });
    });
  }

  onMount(() => {
    window.addEventListener('eldraw:replay-load', onLoad);
  });

  onDestroy(() => {
    window.removeEventListener('eldraw:replay-load', onLoad);
  });

  function onExit() {
    player.stop();
    replay.exit();
    session = null;
    markers = [];
  }

  function onScrub(e: Event) {
    const target = e.target as HTMLInputElement;
    const ms = Number(target.value);
    player.seek(ms);
  }

  const duration = $derived(status.durationMs || session?.durationMs || 0);
</script>

<audio bind:this={audio} preload="auto" style="display:none"></audio>

{#if replaySt.active}
  <div class="replay-bar" role="region" aria-label="Session replay">
    <button
      type="button"
      class="btn"
      onclick={() => player.toggle()}
      aria-label={status.playing ? 'Pause' : 'Play'}
    >
      {status.playing ? '❚❚' : '▶'}
    </button>
    <span class="time">{formatDurationMs(status.currentTimeMs)} / {formatDurationMs(duration)}</span
    >
    <div class="scrubber">
      <input
        type="range"
        min="0"
        max={Math.max(1, duration)}
        step="10"
        value={status.currentTimeMs}
        oninput={onScrub}
        aria-label="Seek"
      />
      <div class="markers" aria-hidden="true">
        {#each markers as m (m.t)}
          <span
            class="marker"
            title={`Page ${m.page + 1}`}
            style="left: {(duration > 0 ? (m.t / duration) * 100 : 0).toFixed(2)}%"
          ></span>
        {/each}
      </div>
    </div>
    <span class="page">Page {status.currentPage + 1}</span>
    <button type="button" class="btn exit" onclick={onExit} aria-label="Exit replay">Exit</button>
  </div>
{/if}

<style>
  .replay-bar {
    position: fixed;
    left: 16px;
    right: 16px;
    bottom: 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    background: rgba(28, 28, 28, 0.95);
    border: 1px solid #3a3a3a;
    border-radius: 8px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
    z-index: 150;
    color: #ddd;
    font-size: 12px;
  }
  .btn {
    background: #2a2a2a;
    border: 1px solid #3a3a3a;
    color: #ddd;
    border-radius: 4px;
    padding: 4px 10px;
    min-width: 40px;
    cursor: pointer;
  }
  .btn:hover {
    border-color: #666;
  }
  .btn.exit {
    margin-left: auto;
  }
  .time {
    font-variant-numeric: tabular-nums;
    color: #aaa;
    min-width: 100px;
  }
  .scrubber {
    flex: 1 1 auto;
    position: relative;
  }
  .scrubber input[type='range'] {
    width: 100%;
  }
  .markers {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    bottom: 0;
    pointer-events: none;
  }
  .marker {
    position: absolute;
    top: 50%;
    width: 2px;
    height: 10px;
    margin-top: -5px;
    background: #7ab7ff;
    pointer-events: auto;
  }
  .page {
    color: #aaa;
    min-width: 60px;
    text-align: right;
  }
</style>
