<script lang="ts" module>
  interface HandlePos {
    id: string;
    x: number;
    y: number;
  }

  export function handlePositions(r: { x: number; y: number; w: number; h: number }): HandlePos[] {
    return [
      { id: 'nw', x: r.x, y: r.y },
      { id: 'n', x: r.x + r.w / 2, y: r.y },
      { id: 'ne', x: r.x + r.w, y: r.y },
      { id: 'e', x: r.x + r.w, y: r.y + r.h / 2 },
      { id: 'se', x: r.x + r.w, y: r.y + r.h },
      { id: 's', x: r.x + r.w / 2, y: r.y + r.h },
      { id: 'sw', x: r.x, y: r.y + r.h },
      { id: 'w', x: r.x, y: r.y + r.h / 2 },
    ];
  }
</script>

<script lang="ts">
  import type { AnyObject, ObjectId } from '$lib/types';
  import type { SpatialIndex } from '$lib/tools/spatialIndex';
  import { boundsOfObjects, filterSelected, selection } from './selection';
  import { pickInLasso, pickInMarquee, pickTopAt } from './hitTest';
  import type { Rect, Vec2 } from './geometry';
  import { transformObject, translateObject } from './transform';
  import { commitStylePatch, commitTransform, commitTranslate, commitDelete } from './ops';
  import {
    duplicateInPlace,
    hasClipboardContents,
    readClipboard,
    setClipboard,
    stampForPaste,
  } from './clipboard';
  import { documentStore } from '$lib/store/document';
  import { reorderArray } from './ops';
  import SelectionToolbar from './SelectionToolbar.svelte';

  interface Props {
    pageIndex: number;
    objects: AnyObject[];
    spatialIndex: SpatialIndex | null;
    width: number;
    height: number;
    ptToPx: number;
  }

  let { pageIndex, objects, spatialIndex, width, height, ptToPx }: Props = $props();

  const selectionState = $derived($selection);
  const isActive = $derived(selectionState.pageIndex === pageIndex);
  const selectedObjects = $derived(isActive ? filterSelected(objects, selectionState.ids) : []);

  type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate' | 'move';

  type Interaction =
    | null
    | { kind: 'lasso'; points: Vec2[]; additive: boolean }
    | { kind: 'marquee'; start: Vec2; current: Vec2; additive: boolean }
    | {
        kind: 'move';
        startPointer: Vec2;
        startObjects: AnyObject[];
        previewObjects: Map<ObjectId, AnyObject>;
      }
    | {
        kind: 'resize';
        handle: Exclude<Handle, 'rotate' | 'move'>;
        startBounds: Rect;
        startPointer: Vec2;
        startObjects: AnyObject[];
        previewObjects: Map<ObjectId, AnyObject>;
      }
    | {
        kind: 'rotate';
        pivot: Vec2;
        startAngle: number;
        startObjects: AnyObject[];
        previewObjects: Map<ObjectId, AnyObject>;
      };

  let interaction = $state<Interaction>(null);
  let root: HTMLDivElement | null = $state(null);

  const previewOverrides = $derived<Map<ObjectId, AnyObject>>(
    interaction &&
      (interaction.kind === 'move' ||
        interaction.kind === 'resize' ||
        interaction.kind === 'rotate')
      ? interaction.previewObjects
      : new Map(),
  );

  const displaySelectedObjects = $derived(
    selectedObjects.map((o) => previewOverrides.get(o.id) ?? o),
  );
  const displayBounds = $derived<Rect | null>(boundsOfObjects(displaySelectedObjects));

  function pointerToPt(e: PointerEvent): Vec2 {
    const rect = root!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / ptToPx, y: (e.clientY - rect.top) / ptToPx };
  }

  function isInsideBounds(p: Vec2, r: Rect): boolean {
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  const HANDLE_SIZE_PX = 10;
  const ROTATE_OFFSET_PX = 28;

  function handleAt(p: Vec2, r: Rect): Handle | null {
    const tolPt = HANDLE_SIZE_PX / ptToPx;
    const near = (a: number, b: number) => Math.abs(a - b) <= tolPt;
    const inX = p.x >= r.x - tolPt && p.x <= r.x + r.w + tolPt;
    const inY = p.y >= r.y - tolPt && p.y <= r.y + r.h + tolPt;
    if (near(p.x, r.x + r.w / 2) && near(p.y, r.y - ROTATE_OFFSET_PX / ptToPx)) return 'rotate';
    if (!inX || !inY) return null;
    const left = near(p.x, r.x);
    const right = near(p.x, r.x + r.w);
    const top = near(p.y, r.y);
    const bottom = near(p.y, r.y + r.h);
    if (left && top) return 'nw';
    if (right && top) return 'ne';
    if (left && bottom) return 'sw';
    if (right && bottom) return 'se';
    if (top) return 'n';
    if (bottom) return 's';
    if (left) return 'w';
    if (right) return 'e';
    return null;
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    if (e.pointerType === 'touch') return;
    const p = pointerToPt(e);
    root?.setPointerCapture?.(e.pointerId);

    if (displayBounds && selectedObjects.length > 0) {
      const h = handleAt(p, displayBounds);
      if (h === 'rotate') {
        const pivot = {
          x: displayBounds.x + displayBounds.w / 2,
          y: displayBounds.y + displayBounds.h / 2,
        };
        const startAngle = Math.atan2(p.y - pivot.y, p.x - pivot.x);
        interaction = {
          kind: 'rotate',
          pivot,
          startAngle,
          startObjects: selectedObjects.slice(),
          previewObjects: new Map(),
        };
        e.preventDefault();
        return;
      }
      if (h && h !== 'move') {
        interaction = {
          kind: 'resize',
          handle: h,
          startBounds: { ...displayBounds },
          startPointer: p,
          startObjects: selectedObjects.slice(),
          previewObjects: new Map(),
        };
        e.preventDefault();
        return;
      }
      if (isInsideBounds(p, displayBounds)) {
        interaction = {
          kind: 'move',
          startPointer: p,
          startObjects: selectedObjects.slice(),
          previewObjects: new Map(),
        };
        e.preventDefault();
        return;
      }
    }

    const hit = pickTopAt(objects, spatialIndex, p, 2);
    if (hit) {
      if (e.shiftKey) selection.toggle(pageIndex, hit.id);
      else selection.set(pageIndex, [hit.id]);
      e.preventDefault();
      return;
    }

    if (e.shiftKey) {
      interaction = {
        kind: 'marquee',
        start: p,
        current: p,
        additive: e.ctrlKey || e.metaKey || selectedObjects.length > 0,
      };
    } else {
      if (selectedObjects.length > 0) selection.clear();
      selection.setPage(pageIndex);
      interaction = { kind: 'lasso', points: [p], additive: false };
    }
    e.preventDefault();
  }

  function onPointerMove(e: PointerEvent) {
    if (!interaction) return;
    const p = pointerToPt(e);
    if (interaction.kind === 'lasso') {
      interaction = { ...interaction, points: [...interaction.points, p] };
    } else if (interaction.kind === 'marquee') {
      interaction = { ...interaction, current: p };
    } else if (interaction.kind === 'move') {
      const dx = p.x - interaction.startPointer.x;
      const dy = p.y - interaction.startPointer.y;
      const preview = new Map<ObjectId, AnyObject>();
      for (const o of interaction.startObjects) preview.set(o.id, translateObject(o, dx, dy));
      interaction = { ...interaction, previewObjects: preview };
    } else if (interaction.kind === 'resize') {
      const uniform = e.shiftKey;
      const preview = buildResizePreview(interaction, p, uniform);
      interaction = { ...interaction, previewObjects: preview };
    } else if (interaction.kind === 'rotate') {
      const current = Math.atan2(p.y - interaction.pivot.y, p.x - interaction.pivot.x);
      let angle = current - interaction.startAngle;
      if (e.shiftKey) {
        const step = (15 * Math.PI) / 180;
        angle = Math.round(angle / step) * step;
      }
      const preview = new Map<ObjectId, AnyObject>();
      for (const o of interaction.startObjects) {
        preview.set(o.id, transformObject(o, { rotate: { angle, pivot: interaction.pivot } }));
      }
      interaction = { ...interaction, previewObjects: preview };
    }
  }

  function buildResizePreview(
    itx: Extract<Interaction, { kind: 'resize' }>,
    p: Vec2,
    uniform: boolean,
  ): Map<ObjectId, AnyObject> {
    const b = itx.startBounds;
    const handle = itx.handle;
    let left = b.x;
    let right = b.x + b.w;
    let top = b.y;
    let bottom = b.y + b.h;
    if (handle.includes('w')) left = p.x;
    if (handle.includes('e')) right = p.x;
    if (handle.includes('n')) top = p.y;
    if (handle.includes('s')) bottom = p.y;
    if (left >= right) right = left + 0.5;
    if (top >= bottom) bottom = top + 0.5;
    let sx = (right - left) / b.w;
    let sy = (bottom - top) / b.h;
    if (uniform) {
      const s = Math.max(Math.abs(sx), Math.abs(sy));
      sx = sx < 0 ? -s : s;
      sy = sy < 0 ? -s : s;
    }
    const pivot: Vec2 = {
      x: handle.includes('w') ? b.x + b.w : handle.includes('e') ? b.x : b.x + b.w / 2,
      y: handle.includes('n') ? b.y + b.h : handle.includes('s') ? b.y : b.y + b.h / 2,
    };
    const preview = new Map<ObjectId, AnyObject>();
    for (const o of itx.startObjects) {
      preview.set(o.id, transformObject(o, { scale: { sx, sy, pivot } }));
    }
    return preview;
  }

  function onPointerUp(e: PointerEvent) {
    if (!interaction) return;
    const p = pointerToPt(e);
    root?.releasePointerCapture?.(e.pointerId);
    const current = interaction;
    interaction = null;

    if (current.kind === 'lasso') {
      if (current.points.length < 3) return;
      const hits = pickInLasso(objects, spatialIndex, current.points);
      selection.set(
        pageIndex,
        hits.map((o) => o.id),
      );
    } else if (current.kind === 'marquee') {
      const rect = rectFromPoints(current.start, current.current);
      const hits = pickInMarquee(objects, spatialIndex, rect);
      if (current.additive) {
        selection.add(
          pageIndex,
          hits.map((o) => o.id),
        );
      } else {
        selection.set(
          pageIndex,
          hits.map((o) => o.id),
        );
      }
    } else if (current.kind === 'move') {
      const dx = p.x - current.startPointer.x;
      const dy = p.y - current.startPointer.y;
      if (dx === 0 && dy === 0) return;
      commitTranslate(pageIndex, selectionState.ids, dx, dy);
    } else if (current.kind === 'resize') {
      const uniform = e.shiftKey;
      const preview = buildResizePreview(current, p, uniform);
      const afters: AnyObject[] = [];
      for (const o of current.startObjects) {
        const next = preview.get(o.id);
        if (next) afters.push(next);
      }
      documentStore.updateObjects(pageIndex, afters);
    } else if (current.kind === 'rotate') {
      const angle = Math.atan2(p.y - current.pivot.y, p.x - current.pivot.x) - current.startAngle;
      const snapped = e.shiftKey ? snapAngle(angle) : angle;
      if (snapped === 0) return;
      commitTransform(pageIndex, selectionState.ids, {
        rotate: { angle: snapped, pivot: current.pivot },
      });
    }
  }

  function snapAngle(angle: number): number {
    const step = (15 * Math.PI) / 180;
    return Math.round(angle / step) * step;
  }

  function rectFromPoints(a: Vec2, b: Vec2): Rect {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    return { x, y, w, h };
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!isActive || selectedObjects.length === 0) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    const step = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      commitTranslate(pageIndex, selectionState.ids, -step, 0);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      commitTranslate(pageIndex, selectionState.ids, step, 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      commitTranslate(pageIndex, selectionState.ids, 0, -step);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      commitTranslate(pageIndex, selectionState.ids, 0, step);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      commitDelete(pageIndex, selectionState.ids);
      selection.clear();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      setClipboard(selectedObjects);
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'x' || e.key === 'X')) {
      e.preventDefault();
      setClipboard(selectedObjects);
      commitDelete(pageIndex, selectionState.ids);
      selection.clear();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
      if (!hasClipboardContents()) return;
      e.preventDefault();
      const payload = readClipboard();
      if (!payload) return;
      const target = { x: 20, y: 20 };
      const stamped = stampForPaste(payload, target);
      for (const obj of stamped) documentStore.addObject(pageIndex, obj);
      selection.set(
        pageIndex,
        stamped.map((o) => o.id),
      );
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      const dups = duplicateInPlace(selectedObjects);
      for (const obj of dups) documentStore.addObject(pageIndex, obj);
      selection.set(
        pageIndex,
        dups.map((o) => o.id),
      );
    } else if (e.key === 'Escape') {
      e.preventDefault();
      selection.clear();
    }
  }

  function onColorChange(color: string) {
    commitStylePatch(pageIndex, selectionState.ids, { color });
  }

  function onWidthChange(width: number) {
    commitStylePatch(pageIndex, selectionState.ids, { width });
  }

  function onDashChange(dash: 'solid' | 'dashed' | 'dotted') {
    commitStylePatch(pageIndex, selectionState.ids, { dash });
  }

  function onDelete() {
    commitDelete(pageIndex, selectionState.ids);
    selection.clear();
  }

  function onDuplicate() {
    const dups = duplicateInPlace(selectedObjects);
    for (const obj of dups) documentStore.addObject(pageIndex, obj);
    selection.set(
      pageIndex,
      dups.map((o) => o.id),
    );
  }

  function onBringForward() {
    reorderAndCommit('forward');
  }

  function onSendBackward() {
    reorderAndCommit('backward');
  }

  function reorderAndCommit(direction: 'forward' | 'backward') {
    const next = reorderArray(objects, selectionState.ids, direction);
    const same = next.length === objects.length && next.every((o, i) => o.id === objects[i].id);
    if (same) return;
    documentStore.removeObjects(
      pageIndex,
      objects.map((o) => o.id),
    );
    for (const obj of next) documentStore.addObject(pageIndex, obj);
  }

  function lassoPathD(points: readonly Vec2[]): string {
    if (points.length === 0) return '';
    const px = (v: Vec2) => `${v.x * ptToPx},${v.y * ptToPx}`;
    return `M${px(points[0])} ${points
      .slice(1)
      .map((p) => `L${px(p)}`)
      .join(' ')} Z`;
  }

  const marqueeRectPx = $derived<Rect | null>(
    interaction?.kind === 'marquee'
      ? (() => {
          const r = rectFromPoints(interaction.start, interaction.current);
          return {
            x: r.x * ptToPx,
            y: r.y * ptToPx,
            w: r.w * ptToPx,
            h: r.h * ptToPx,
          };
        })()
      : null,
  );

  const boundsPx = $derived<Rect | null>(
    displayBounds
      ? {
          x: displayBounds.x * ptToPx,
          y: displayBounds.y * ptToPx,
          w: displayBounds.w * ptToPx,
          h: displayBounds.h * ptToPx,
        }
      : null,
  );

  const toolbarAnchor = $derived<{ left: number; top: number } | null>(
    boundsPx
      ? {
          left: Math.max(0, boundsPx.x),
          top: Math.max(0, boundsPx.y - 44),
        }
      : null,
  );
</script>

<svelte:window onkeydown={onKeyDown} />

<div
  bind:this={root}
  class="select-layer"
  style="width: {width}px; height: {height}px;"
  role="presentation"
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
>
  <svg class="overlay" {width} {height}>
    {#if interaction?.kind === 'lasso'}
      <path d={lassoPathD(interaction.points)} class="lasso" />
    {/if}
    {#if marqueeRectPx}
      <rect
        class="marquee"
        x={marqueeRectPx.x}
        y={marqueeRectPx.y}
        width={marqueeRectPx.w}
        height={marqueeRectPx.h}
      />
    {/if}
    {#if boundsPx && selectedObjects.length > 0}
      <rect class="bounds" x={boundsPx.x} y={boundsPx.y} width={boundsPx.w} height={boundsPx.h} />
      {#each handlePositions(boundsPx) as h (h.id)}
        <rect
          class="handle"
          x={h.x - HANDLE_SIZE_PX / 2}
          y={h.y - HANDLE_SIZE_PX / 2}
          width={HANDLE_SIZE_PX}
          height={HANDLE_SIZE_PX}
        />
      {/each}
      <line
        class="rotate-stem"
        x1={boundsPx.x + boundsPx.w / 2}
        y1={boundsPx.y}
        x2={boundsPx.x + boundsPx.w / 2}
        y2={boundsPx.y - ROTATE_OFFSET_PX}
      />
      <circle
        class="handle rotate"
        cx={boundsPx.x + boundsPx.w / 2}
        cy={boundsPx.y - ROTATE_OFFSET_PX}
        r={HANDLE_SIZE_PX / 2}
      />
    {/if}
  </svg>

  {#if toolbarAnchor && selectedObjects.length > 0 && !interaction}
    <SelectionToolbar
      selectedObjects={displaySelectedObjects}
      anchor={toolbarAnchor}
      {onColorChange}
      {onWidthChange}
      {onDashChange}
      {onDelete}
      {onDuplicate}
      {onBringForward}
      {onSendBackward}
    />
  {/if}
</div>

<style>
  .select-layer {
    position: absolute;
    inset: 0;
    pointer-events: auto;
    touch-action: none;
  }
  .overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .bounds {
    fill: rgba(100, 170, 255, 0.08);
    stroke: #6fb1ff;
    stroke-width: 1;
    stroke-dasharray: 4 3;
  }
  .handle {
    fill: #fff;
    stroke: #6fb1ff;
    stroke-width: 1;
  }
  .rotate-stem {
    stroke: #6fb1ff;
    stroke-width: 1;
    stroke-dasharray: 2 2;
  }
  .lasso {
    fill: rgba(100, 170, 255, 0.12);
    stroke: #6fb1ff;
    stroke-width: 1;
    stroke-dasharray: 4 3;
  }
  .marquee {
    fill: rgba(100, 170, 255, 0.08);
    stroke: #6fb1ff;
    stroke-width: 1;
    stroke-dasharray: 4 3;
  }
</style>
