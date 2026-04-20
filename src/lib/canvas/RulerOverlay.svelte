<script lang="ts">
  import { overlays } from '$lib/store/overlays';
  import { rulerEnd, rulerTicks, type Vec2 } from '$lib/geometry';

  interface Props {
    ptToPx: number;
    width: number;
    height: number;
  }

  let { ptToPx, width, height }: Props = $props();

  const ruler = $derived($overlays.ruler);
  const ticks = $derived(rulerTicks(ruler));
  const end = $derived(rulerEnd(ruler));

  let svgEl: SVGSVGElement | undefined = $state();

  type Drag =
    | { kind: 'move'; offset: Vec2 }
    | { kind: 'rotate'; startPointer: Vec2; startRotation: number };
  let drag: Drag | null = null;

  function toPtSpace(e: PointerEvent): Vec2 {
    const rect = svgEl!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / ptToPx,
      y: (e.clientY - rect.top) / ptToPx,
    };
  }

  function onBodyPointerDown(e: PointerEvent) {
    const p = toPtSpace(e);
    drag = { kind: 'move', offset: { x: p.x - ruler.from.x, y: p.y - ruler.from.y } };
    (e.target as Element).setPointerCapture(e.pointerId);
    e.stopPropagation();
  }

  function onEndPointerDown(e: PointerEvent) {
    const p = toPtSpace(e);
    drag = { kind: 'rotate', startPointer: p, startRotation: ruler.rotation };
    (e.target as Element).setPointerCapture(e.pointerId);
    e.stopPropagation();
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag) return;
    const p = toPtSpace(e);
    if (drag.kind === 'move') {
      overlays.moveRuler({ x: p.x - drag.offset.x, y: p.y - drag.offset.y });
    } else {
      const startAngle = Math.atan2(
        drag.startPointer.y - ruler.from.y,
        drag.startPointer.x - ruler.from.x,
      );
      const currentAngle = Math.atan2(p.y - ruler.from.y, p.x - ruler.from.x);
      const delta = ((currentAngle - startAngle) * 180) / Math.PI;
      overlays.rotateRuler(drag.startRotation + delta);
    }
  }

  function onPointerUp() {
    drag = null;
  }

  const bodyHeight = 24;
</script>

<svg
  bind:this={svgEl}
  class="ruler"
  {width}
  {height}
  role="application"
  aria-label="Ruler overlay"
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
>
  <g
    transform="translate({ruler.from.x * ptToPx} {ruler.from.y * ptToPx}) rotate({ruler.rotation})"
  >
    <rect
      class="body"
      x="0"
      y="0"
      width={ruler.length * ptToPx}
      height={bodyHeight}
      fill="rgba(100, 180, 255, 0.15)"
      stroke="#1e88e5"
      stroke-width="1"
      role="button"
      tabindex="0"
      aria-label="Move ruler"
      onpointerdown={onBodyPointerDown}
    />
    {#each ticks as t (t.along)}
      <line
        x1={t.along * ptToPx}
        y1={0}
        x2={t.along * ptToPx}
        y2={(t.isMajor ? 10 : 4) * (ptToPx / 72) * 72 * 0.5}
        stroke="#1e88e5"
        stroke-width={t.isMajor ? 1.2 : 0.6}
      />
      {#if t.label}
        <text x={t.along * ptToPx} y={18} font-size="9" fill="#1565c0" text-anchor="middle">
          {t.label}
        </text>
      {/if}
    {/each}
  </g>

  <circle
    class="end-handle"
    cx={end.x * ptToPx}
    cy={end.y * ptToPx}
    r={6}
    fill="#1e88e5"
    stroke="#fff"
    stroke-width="1.5"
    role="slider"
    tabindex="0"
    aria-label="Rotate ruler"
    aria-valuenow={Math.round(ruler.rotation)}
    onpointerdown={onEndPointerDown}
  />
</svg>

<style>
  .ruler {
    position: absolute;
    inset: 0;
    pointer-events: auto;
  }
  .body {
    cursor: grab;
  }
  .end-handle {
    cursor: grab;
  }
</style>
