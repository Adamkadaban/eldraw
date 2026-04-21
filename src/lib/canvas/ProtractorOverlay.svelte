<script lang="ts">
  import { onMount } from 'svelte';
  import { overlays } from '$lib/store/overlays';
  import { isEditableTarget } from '$lib/app/shortcutParser';
  import {
    angleAtPoint,
    angleMarkFromProtractor,
    protractorTicks,
    type AngleMarkShape,
    type Vec2,
  } from '$lib/geometry';

  interface Props {
    ptToPx: number;
    width: number;
    height: number;
    /** Default span to stamp when no live cursor reading is available. */
    defaultSpanDegrees?: number;
    /** Ray length for stamped marks, in PDF points. */
    rayLengthPt?: number;
    onstamp?: (shape: AngleMarkShape) => void;
  }

  let {
    ptToPx,
    width,
    height,
    defaultSpanDegrees = 90,
    rayLengthPt = 40,
    onstamp,
  }: Props = $props();

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

  function onToggleShape(e: MouseEvent) {
    e.stopPropagation();
    overlays.setProtractorShape(proto.shape === 'semi' ? 'full' : 'semi');
  }

  function onToggleKey(e: KeyboardEvent) {
    if (e.repeat) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      overlays.setProtractorShape(proto.shape === 'semi' ? 'full' : 'semi');
    }
  }

  function currentStampSpan(): number {
    if (cursorAngle !== null && cursorAngle > 0.5 && cursorAngle < 359.5) {
      return cursorAngle;
    }
    return defaultSpanDegrees;
  }

  function stampAngle() {
    if (!onstamp) return;
    const shape = angleMarkFromProtractor(proto, currentStampSpan(), rayLengthPt);
    onstamp(shape);
  }

  function onStampClick(e: MouseEvent) {
    e.stopPropagation();
    stampAngle();
  }

  function onStampKey(e: KeyboardEvent) {
    if (e.repeat) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      stampAngle();
    }
  }

  function onWindowKey(e: KeyboardEvent) {
    if (e.repeat || e.defaultPrevented) return;
    if (e.key !== 'Enter') return;
    if (!onstamp) return;
    const target = e.target as HTMLElement | null;
    if (isEditableTarget(target)) return;
    if (target) {
      const tag = target.tagName;
      if (tag === 'BUTTON' || tag === 'A') return;
      const role = target.getAttribute?.('role');
      if (role === 'button' || role === 'link' || role === 'menuitem') return;
    }
    e.preventDefault();
    stampAngle();
  }

  onMount(() => {
    window.addEventListener('keydown', onWindowKey);
    return () => window.removeEventListener('keydown', onWindowKey);
  });

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

  <g
    class="shape-toggle"
    role="button"
    tabindex="0"
    aria-label={proto.shape === 'semi' ? 'Switch to full circle' : 'Switch to half circle'}
    aria-pressed={proto.shape === 'full'}
    transform={`translate(${cx + 16}, ${cy - 10})`}
    onclick={onToggleShape}
    onkeydown={onToggleKey}
  >
    <rect width="36" height="20" rx="4" fill="#fff" stroke="#b38600" stroke-width="1" />
    <text
      x="18"
      y="10"
      font-size="10"
      fill="#8a6600"
      text-anchor="middle"
      dominant-baseline="middle"
    >
      {proto.shape === 'semi' ? '180°' : '360°'}
    </text>
  </g>

  <g
    class="stamp-btn"
    role="button"
    tabindex="0"
    aria-label="Stamp angle mark"
    transform={`translate(${cx + 16}, ${cy + 14})`}
    onclick={onStampClick}
    onkeydown={onStampKey}
  >
    <rect width="52" height="20" rx="4" fill="#fff" stroke="#b38600" stroke-width="1" />
    <text
      x="26"
      y="10"
      font-size="10"
      fill="#8a6600"
      text-anchor="middle"
      dominant-baseline="middle"
    >
      stamp ∠
    </text>
  </g>
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
  .shape-toggle {
    cursor: pointer;
  }
  .shape-toggle:hover rect {
    fill: #fff6dc;
  }
  .stamp-btn {
    cursor: pointer;
  }
  .stamp-btn:hover rect {
    fill: #fff6dc;
  }
</style>
