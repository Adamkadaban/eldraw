<script lang="ts">
  import type { Snippet } from 'svelte';
  import type {
    AnyObject,
    LineObject,
    NumberLineObject,
    ShapeObject,
    StrokeObject,
  } from '$lib/types';
  import HighlightLayer from './HighlightLayer.svelte';
  import InkLayer from './InkLayer.svelte';
  import LiveLayer from './LiveLayer.svelte';
  import ShapeLayer from './ShapeLayer.svelte';
  import ShapeLiveLayer from './ShapeLiveLayer.svelte';

  interface Props {
    strokes: StrokeObject[];
    objects: AnyObject[];
    width: number;
    height: number;
    ptToPx: number;
    overlay?: Snippet;
    oncommit?: (stroke: StrokeObject) => void;
    onerase?: (at: { x: number; y: number }) => void;
    oncommitobject?: (obj: LineObject | ShapeObject | NumberLineObject) => void;
  }

  let {
    strokes,
    objects,
    width,
    height,
    ptToPx,
    overlay,
    oncommit,
    onerase,
    oncommitobject,
  }: Props = $props();
</script>

<div class="stack" style="width: {width}px; height: {height}px;">
  <div class="layer layer-highlight">
    <HighlightLayer {strokes} {width} {height} {ptToPx} />
  </div>

  <div class="layer layer-objects">
    <ShapeLayer {objects} {width} {height} {ptToPx} />
  </div>

  <div class="layer layer-ink">
    <InkLayer {strokes} {width} {height} {ptToPx} />
  </div>

  <div class="layer layer-live">
    <LiveLayer {width} {height} {ptToPx} {oncommit} {onerase} />
  </div>

  <div class="layer layer-shape-live">
    <ShapeLiveLayer {width} {height} {ptToPx} oncommit={oncommitobject} />
  </div>

  {#if overlay}
    <div class="layer layer-overlay">
      {@render overlay()}
    </div>
  {/if}
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
    pointer-events: none;
  }
  .layer-live {
    z-index: 4;
  }
  .layer-shape-live {
    z-index: 5;
  }
  .layer-overlay {
    z-index: 6;
    pointer-events: none;
  }
</style>
