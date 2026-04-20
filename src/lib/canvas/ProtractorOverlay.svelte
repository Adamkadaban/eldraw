<script lang="ts">
  import { overlays } from '$lib/store/overlays';
  import { angleAtPoint, protractorTicks, type Vec2 } from '$lib/geometry';

  interface Props {
    ptToPx: number;
    width: number;
    height: number;
  }

  let { ptToPx, width, height }: Props = $props();

  const proto = $derived($overlays.protractor);
  const ticks = $derived(protractorTicks(proto));

  let svgEl: SVGSVGElement | undefined = $state();
  let cursorAngle = $state<number | null>(null);

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

  function onCenterPointerDown(e: PointerEvent) {
    const p = toPtSpace(e);
    drag = { kind: 'move', offset: { x: p.x - proto.center.x, y: p.y - proto.center.y } };
    (e.target as Element).setPointerCapture(e.pointerId);
    e.stopPropagation();
  }

  function onRimPointerDown(e: PointerEvent) {
    const p = toPtSpace(e);
    drag = { kind: 'rotate', startPointer: p, startRotation: proto.rotation };
    (e.target as Element).setPointerCapture(e.pointerId);
    e.stopPropagation();
  }

  function onPointerMove(e: PointerEvent) {
    const p = toPtSpace(e);
    cursorAngle = angleAtPoint(proto, p);
    if (!drag) return;
    if (drag.kind === 'move') {
      overlays.moveProtractor({
        x: p.x - drag.offset.x,
        y: p.y - drag.offset.y,
      });
    } else {
      const ax = drag.startPointer.x - proto.center.x;
      const ay = drag.startPointer.y - proto.center.y;
      const bx = p.x - proto.center.x;
      const by = p.y - proto.center.y;
      const delta = (Math.atan2(ax * by - ay * bx, ax * bx + ay * by) * 180) / Math.PI;
      overlays.rotateProtractor(drag.startRotation + delta);
    }
  }

  function onPointerUp() {
    drag = null;
  }

  const cx = $derived(proto.center.x * ptToPx);
  const cy = $derived(proto.center.y * ptToPx);
  const r = $derived(proto.radius * ptToPx);
  const arcPath = $derived.by(() => {
    const start = {
      x: cx + r * Math.cos((proto.rotation * Math.PI) / 180),
      y: cy + r * Math.sin((proto.rotation * Math.PI) / 180),
    };
    const endRad = ((proto.rotation + (proto.shape === 'semi' ? 180 : 360)) * Math.PI) / 180;
    const end = { x: cx + r * Math.cos(endRad), y: cy + r * Math.sin(endRad) };
    if (proto.shape === 'full') {
      const mid = {
        x: cx - r * Math.cos((proto.rotation * Math.PI) / 180),
        y: cy - r * Math.sin((proto.rotation * Math.PI) / 180),
      };
      return `M ${start.x} ${start.y} A ${r} ${r} 0 1 1 ${mid.x} ${mid.y} A ${r} ${r} 0 1 1 ${start.x} ${start.y} Z`;
    }
    return `M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y} Z`;
  });
</script>

<svg
  bind:this={svgEl}
  class="protractor"
  {width}
  {height}
  role="application"
  aria-label="Protractor overlay"
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
>
  <path d={arcPath} fill="rgba(255, 220, 80, 0.12)" stroke="#b38600" stroke-width="1" />

  {#each ticks as t (t.angle)}
    <line
      x1={t.outer.x * ptToPx}
      y1={t.outer.y * ptToPx}
      x2={t.inner.x * ptToPx}
      y2={t.inner.y * ptToPx}
      stroke="#b38600"
      stroke-width={t.label ? 1.2 : 0.6}
    />
    {#if t.label}
      <text
        x={(t.outer.x * 0.78 + proto.center.x * 0.22) * ptToPx}
        y={(t.outer.y * 0.78 + proto.center.y * 0.22) * ptToPx}
        font-size="10"
        fill="#8a6600"
        text-anchor="middle"
        dominant-baseline="middle"
      >
        {t.label}
      </text>
    {/if}
  {/each}

  <circle
    class="rim"
    {cx}
    {cy}
    {r}
    fill="transparent"
    stroke="transparent"
    role="slider"
    tabindex="0"
    aria-label="Rotate protractor"
    aria-valuenow={Math.round(proto.rotation)}
    onpointerdown={onRimPointerDown}
  />
  <circle
    class="center"
    {cx}
    {cy}
    r={8}
    fill="#b38600"
    stroke="#fff"
    stroke-width="1.5"
    role="button"
    tabindex="0"
    aria-label="Move protractor"
    onpointerdown={onCenterPointerDown}
  />

  {#if cursorAngle !== null}
    <text x={cx} y={cy - 14} font-size="11" fill="#333" text-anchor="middle">
      {cursorAngle.toFixed(1)}°
    </text>
  {/if}
</svg>

<style>
  .protractor {
    position: absolute;
    inset: 0;
    pointer-events: auto;
  }
  .rim {
    pointer-events: stroke;
    stroke-width: 16;
    cursor: grab;
  }
  .center {
    cursor: grab;
  }
</style>
