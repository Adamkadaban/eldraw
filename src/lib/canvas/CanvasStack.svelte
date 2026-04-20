<script lang="ts">
  import type { Snippet } from 'svelte';
  import type {
    AnyObject,
    LineObject,
    NumberLineObject,
    ShapeObject,
    StrokeObject,
    StrokeStyle,
    ToolKind,
  } from '$lib/types';
  import HighlightLayer from './HighlightLayer.svelte';
  import InkLayer from './InkLayer.svelte';
  import LiveLayer from './LiveLayer.svelte';
  import ShapeLayer from './ShapeLayer.svelte';
  import ShapeLiveLayer from './ShapeLiveLayer.svelte';
  import LaserLayer from './LaserLayer.svelte';
  import TempInkLayer from './TempInkLayer.svelte';

  interface Props {
    strokes: StrokeObject[];
    objects: AnyObject[];
    width: number;
    height: number;
    ptToPx: number;
    activeTool?: ToolKind;
    laserColor?: string;
    laserRadius?: number;
    tempInkStyle?: StrokeStyle;
    tempInkFadeMs?: number;
    overlay?: Snippet;
    oncommit?: (stroke: StrokeObject) => void;
    onerase?: (at: { x: number; y: number }) => void;
    oncommitobject?: (obj: LineObject | ShapeObject | NumberLineObject) => void;
    ongraph?: (bounds: { x: number; y: number; w: number; h: number }) => void;
  }

  let {
    strokes,
    objects,
    width,
    height,
    ptToPx,
    activeTool = 'pen',
    laserColor = '#ff2d2d',
    laserRadius = 6,
    tempInkStyle = { color: '#000000', width: 2, dash: 'solid', opacity: 1 },
    tempInkFadeMs = 3000,
    overlay,
    oncommit,
    onerase,
    oncommitobject,
    ongraph,
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
    <LiveLayer {width} {height} {ptToPx} {oncommit} {onerase} {ongraph} />
  </div>

  <div class="layer layer-shape-live">
    <ShapeLiveLayer {width} {height} {ptToPx} oncommit={oncommitobject} />
  </div>

  <div class="layer layer-temp-ink">
    <TempInkLayer
      {width}
      {height}
      {ptToPx}
      active={activeTool === 'temp-ink'}
      style={tempInkStyle}
      fadeMs={tempInkFadeMs}
    />
  </div>

  <div class="layer layer-laser">
    <LaserLayer
      {width}
      {height}
      active={activeTool === 'laser'}
      color={laserColor}
      radius={laserRadius}
    />
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
  .layer-temp-ink {
    z-index: 6;
  }
  .layer-laser {
    z-index: 7;
  }
  .layer-overlay {
    z-index: 8;
    pointer-events: none;
  }
</style>
