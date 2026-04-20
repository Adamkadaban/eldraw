<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import {
    appendPoint,
    clampTrailMs,
    DEFAULT_LASER_TRAIL_MS,
    pruneTrail,
    trailAlpha,
    type LaserPoint,
  } from '$lib/tools/laser';

  interface Props {
    width: number;
    height: number;
    active: boolean;
    color: string;
    radius: number;
    trailMs?: number;
  }

  let { width, height, active, color, radius, trailMs = DEFAULT_LASER_TRAIL_MS }: Props = $props();

  const safeTrailMs = $derived(clampTrailMs(trailMs));
  const safeRadius = $derived(Number.isFinite(radius) && radius > 0 ? radius : 6);

  let canvas: HTMLCanvasElement;
  let trail: LaserPoint[] = [];
  let activePointerId: number | null = null;
  let rafId: number | null = null;

  function ctx(): CanvasRenderingContext2D | null {
    return canvas?.getContext('2d') ?? null;
  }

  function clear() {
    const c = ctx();
    if (!c || !canvas) return;
    c.clearRect(0, 0, canvas.width, canvas.height);
  }

  function draw() {
    const c = ctx();
    if (!c || !canvas) return;
    const now = performance.now();
    trail = pruneTrail(trail, now, safeTrailMs);
    clear();
    if (trail.length === 0) {
      rafId = null;
      return;
    }

    c.save();
    c.globalCompositeOperation = 'lighter';
    for (const p of trail) {
      const a = trailAlpha(p, now, safeTrailMs);
      if (a <= 0) continue;
      const r = safeRadius * (0.4 + 0.6 * a);
      const grad = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
      grad.addColorStop(0, withAlpha(color, a));
      grad.addColorStop(0.4, withAlpha(color, a * 0.4));
      grad.addColorStop(1, withAlpha(color, 0));
      c.fillStyle = grad;
      c.beginPath();
      c.arc(p.x, p.y, r * 3, 0, Math.PI * 2);
      c.fill();
    }
    const head = trail[trail.length - 1];
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = color;
    c.beginPath();
    c.arc(head.x, head.y, safeRadius, 0, Math.PI * 2);
    c.fill();
    c.restore();

    rafId = requestAnimationFrame(draw);
  }

  function withAlpha(hex: string, alpha: number): string {
    const a = Math.max(0, Math.min(1, alpha));
    const m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 0xff;
    const g = (n >> 8) & 0xff;
    const b = n & 0xff;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  function ensureRaf() {
    if (rafId === null) rafId = requestAnimationFrame(draw);
  }

  function localPoint(e: PointerEvent): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function pushPoint(e: PointerEvent) {
    const { x, y } = localPoint(e);
    trail = appendPoint(trail, { x, y, t: performance.now() }, safeTrailMs);
    ensureRaf();
  }

  function onPointerDown(e: PointerEvent) {
    if (!active) return;
    canvas.setPointerCapture(e.pointerId);
    activePointerId = e.pointerId;
    pushPoint(e);
    e.preventDefault();
  }

  function onPointerMove(e: PointerEvent) {
    if (!active) return;
    pushPoint(e);
    e.preventDefault();
  }

  function onPointerUp(e: PointerEvent) {
    if (activePointerId !== e.pointerId) return;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      // not captured; ignore
    }
    activePointerId = null;
  }

  function onPointerLeave() {
    if (!active) return;
    trail = [];
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    clear();
  }

  function reset() {
    trail = [];
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    clear();
  }

  $effect(() => {
    if (!active) reset();
  });

  $effect(() => {
    void width;
    void height;
    if (canvas) clear();
  });

  onMount(clear);

  onDestroy(() => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    trail = [];
  });
</script>

<canvas
  bind:this={canvas}
  {width}
  {height}
  class="laser-layer"
  class:active
  style="width: {width}px; height: {height}px;"
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
  onpointerleave={onPointerLeave}
></canvas>

<style>
  .laser-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
    touch-action: none;
  }
  .laser-layer.active {
    pointer-events: auto;
    cursor: crosshair;
  }
</style>
