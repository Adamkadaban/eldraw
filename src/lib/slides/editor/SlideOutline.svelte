<script lang="ts">
  import type { Slide } from '$lib/types';

  interface Props {
    slides: { pageIndex: number; slide: Slide }[];
    activeIndex: number;
    onselect: (pageIndex: number) => void;
  }

  let { slides, activeIndex, onselect }: Props = $props();
</script>

<nav class="outline" aria-label="Slide outline">
  <h2>Slides</h2>
  <ol>
    {#each slides as entry, index (entry.pageIndex)}
      <li>
        <button
          type="button"
          class:active={entry.pageIndex === activeIndex}
          aria-current={entry.pageIndex === activeIndex ? 'page' : undefined}
          aria-label={`Slide ${index + 1}: ${entry.slide.title || 'Untitled slide'}`}
          onclick={() => onselect(entry.pageIndex)}
        >
          <span class="number">{index + 1}</span>
          <span class="title">{entry.slide.title || 'Untitled slide'}</span>
        </button>
      </li>
    {/each}
  </ol>
</nav>

<style>
  .outline {
    width: 190px;
    padding: 10px;
    box-sizing: border-box;
    background: #252525;
    color: #e8e8e8;
    border: 1px solid #1a1a1a;
    border-radius: 7px;
    font-size: 12px;
  }
  h2 {
    margin: 0 0 8px;
    color: #aaa;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  ol {
    margin: 0;
    padding: 0;
    display: grid;
    gap: 3px;
    list-style: none;
  }
  button {
    width: 100%;
    padding: 5px 6px;
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    gap: 5px;
    align-items: center;
    text-align: left;
    background: transparent;
    color: #ddd;
    border: 1px solid transparent;
    border-radius: 4px;
    cursor: pointer;
  }
  button:hover,
  button:focus-visible {
    background: #2e2e2e;
    border-color: #444;
  }
  button.active {
    background: #2a4a78;
    border-color: #3a6aa0;
    color: #fff;
  }
  .number {
    color: #999;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .active .number {
    color: #d4e5ff;
  }
  .title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
