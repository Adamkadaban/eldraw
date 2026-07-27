<script lang="ts">
  import type { Slide } from '$lib/types';
  import { slideTemplates, type SlideTemplate } from '$lib/slides/templates';

  interface Props {
    onpick: (slide: Slide) => void;
    onclose: () => void;
  }

  let { onpick, onclose }: Props = $props();
  let query = $state('');

  const groupedTemplates = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    const groups = new Map<string, SlideTemplate[]>();
    for (const template of slideTemplates) {
      const searchable = `${template.name} ${template.description} ${template.group}`.toLowerCase();
      if (needle && !searchable.includes(needle)) continue;
      const group = groups.get(template.group) ?? [];
      group.push(template);
      groups.set(template.group, group);
    }
    return [...groups.entries()];
  });
</script>

<div
  class="picker"
  role="dialog"
  aria-modal="true"
  aria-label="Choose a slide template"
  tabindex="-1"
>
  <header>
    <div>
      <h2>New slide</h2>
      <p>Choose a teaching-slide scaffold.</p>
    </div>
    <button type="button" class="close" aria-label="Close template picker" onclick={onclose}>
      ×
    </button>
  </header>

  <label class="search">
    <span>Search templates</span>
    <input type="search" bind:value={query} placeholder="Search…" />
  </label>

  <div class="groups">
    {#each groupedTemplates as [group, templates] (group)}
      <section class="group">
        <h3>{group}</h3>
        <div class="cards">
          {#each templates as template (template.id)}
            <button type="button" class="card" onclick={() => onpick(template.build())}>
              <strong>{template.name}</strong>
              <span>{template.description}</span>
            </button>
          {/each}
        </div>
      </section>
    {:else}
      <p class="empty">No templates match “{query}”.</p>
    {/each}
  </div>
</div>

<style>
  .picker {
    width: min(620px, calc(100vw - 32px));
    max-height: min(720px, calc(100vh - 32px));
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px;
    box-sizing: border-box;
    background: #252525;
    color: #e8e8e8;
    border: 1px solid #1a1a1a;
    border-radius: 8px;
    box-shadow: 0 10px 32px rgba(0, 0, 0, 0.6);
    font-size: 12px;
  }
  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }
  h2,
  h3,
  p {
    margin: 0;
  }
  h2 {
    font-size: 15px;
  }
  header p {
    margin-top: 3px;
    color: #aaa;
  }
  .close {
    width: 24px;
    height: 24px;
    padding: 0;
    background: transparent;
    color: #ccc;
    border: 1px solid #3a3a3a;
    border-radius: 4px;
    cursor: pointer;
  }
  .search {
    display: grid;
    gap: 4px;
    color: #bbb;
  }
  input {
    background: #1b1b1b;
    color: #eee;
    border: 1px solid #3a3a3a;
    border-radius: 4px;
    padding: 6px 8px;
  }
  .groups {
    overflow: auto;
    display: grid;
    gap: 14px;
    padding-right: 2px;
  }
  .group {
    display: grid;
    gap: 6px;
  }
  h3 {
    color: #aaa;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .cards {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px;
  }
  .card {
    min-height: 62px;
    padding: 9px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    text-align: left;
    background: #2a2a2a;
    color: #eee;
    border: 1px solid #3a3a3a;
    border-radius: 5px;
    cursor: pointer;
  }
  .card:hover,
  .card:focus-visible {
    border-color: #5d83b8;
    background: #2d3540;
  }
  .card span {
    color: #aaa;
    font-size: 11px;
    line-height: 1.3;
  }
  .empty {
    color: #aaa;
    padding: 20px 4px;
  }
  @media (max-width: 520px) {
    .cards {
      grid-template-columns: 1fr;
    }
  }
</style>
