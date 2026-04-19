<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { StrokeObject } from '$lib/types';
  import HighlightLayer from './HighlightLayer.svelte';
  import InkLayer from './InkLayer.svelte';
  import LiveLayer from './LiveLayer.svelte';

  interface Props {
    strokes: StrokeObject[];
    width: number;
    height: number;
    ptToPx: number;
    objects?: Snippet;
    oncommit?: (stroke: StrokeObject) => void;
    onerase?: (at: { x: number; y: number }) => void;
  }

  let { strokes, width, height, ptToPx, objects, oncommit, onerase }: Props = $props();
</script>

<div class="stack" style="width: {width}px; height: {height}px;">
  <div class="layer layer-highlight">
    <HighlightLayer {strokes} {width} {height} {ptToPx} />
  </div>

  {#if objects}
    <div class="layer layer-objects">
      {@render objects()}
    </div>
  {/if}

  <div class="layer layer-ink">
    <InkLayer {strokes} {width} {height} {ptToPx} />
  </div>

  <div class="layer layer-live">
    <LiveLayer {width} {height} {ptToPx} {oncommit} {onerase} />
  </div>
</div>

<style>
  .stack {
    position: relative;
  }
  .layer {
    position: absolute;
    inset: 0;
  }
  .layer-highlight {
    z-index: 1;
  }
  .layer-objects {
    z-index: 2;
    pointer-events: none;
  }
  .layer-ink {
    z-index: 3;
  }
  .layer-live {
    z-index: 4;
  }
</style>
