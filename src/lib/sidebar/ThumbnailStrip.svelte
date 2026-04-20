<script lang="ts">
  import type { Page } from '$lib/types';
  import { thumbnailSize } from './thumbnailSize';

  interface Props {
    pages: Page[];
    currentIndex: number;
    onpick: (index: number) => void;
    maxWidth?: number;
  }

  const { pages, currentIndex, onpick, maxWidth = 140 }: Props = $props();

  function pick(i: number): void {
    onpick(i);
  }
</script>

<aside class="strip" aria-label="Page thumbnails">
  <ul>
    {#each pages as page, i (page.pageIndex)}
      {@const size = thumbnailSize(page.width, page.height, maxWidth)}
      <li>
        <button
          type="button"
          class="thumb"
          class:active={i === currentIndex}
          aria-label={`Go to page ${i + 1}`}
          aria-current={i === currentIndex ? 'page' : undefined}
          onclick={() => pick(i)}
        >
          <span
            class="preview"
            class:blank={page.type === 'blank'}
            style="width: {size.width}px; height: {size.height}px;"
          ></span>
          <span class="label">{i + 1}</span>
        </button>
      </li>
    {/each}
  </ul>
</aside>

<style>
  .strip {
    height: 100%;
    overflow-y: auto;
    background: #1a1a1a;
    border-right: 1px solid #111;
    padding: 8px;
    box-sizing: border-box;
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
  }
  .thumb {
    background: transparent;
    border: 2px solid transparent;
    border-radius: 4px;
    padding: 4px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .thumb:hover {
    border-color: #444;
  }
  .thumb.active {
    border-color: #4a9eff;
  }
  .preview {
    display: block;
    background: #fff;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
  }
  .preview.blank {
    background: #fafafa;
  }
  .label {
    font-size: 11px;
    color: #bbb;
  }
  .thumb.active .label {
    color: #4a9eff;
  }
</style>
