<script lang="ts">
  import { currentStyle, sidebar, styleKeyFor } from '$lib/store/sidebar';
  import type { DashStyle, StrokeStyle, ToolKind } from '$lib/types';
  import ColorPalette from './ColorPalette.svelte';
  import WidthPicker from './WidthPicker.svelte';
  import DashStyleToggle from './DashStyleToggle.svelte';
  import ToolPresets from './ToolPresets.svelte';
  import { applySnap, clampToViewport } from './snap';

  interface Props {
    onToolChange?: (tool: ToolKind) => void;
    onStyleChange?: (style: StrokeStyle) => void;
    onPinChange?: (pinned: boolean) => void;
  }

  let { onToolChange, onStyleChange, onPinChange }: Props = $props();

  interface ToolSpec {
    id: ToolKind;
    label: string;
    shortcut: string;
    icon: string;
    disabled?: boolean;
  }

  const tools: ToolSpec[] = [
    { id: 'pen', label: 'Pen', shortcut: 'P', icon: '✏️' },
    { id: 'highlighter', label: 'Highlighter', shortcut: 'H', icon: '🖍️' },
    { id: 'eraser', label: 'Eraser', shortcut: 'E', icon: '🧽' },
    { id: 'line', label: 'Line', shortcut: 'L', icon: '／' },
    { id: 'text', label: 'Text', shortcut: 'T', icon: '𝐓' },
    { id: 'rect', label: 'Rectangle', shortcut: 'R', icon: '▭' },
    { id: 'ellipse', label: 'Ellipse', shortcut: 'O', icon: '◯' },
    { id: 'numberline', label: 'Number line', shortcut: 'N', icon: '↔' },
    { id: 'graph', label: 'Graph', shortcut: 'G', icon: '📈' },
    { id: 'protractor', label: 'Protractor', shortcut: 'A', icon: '◠' },
    { id: 'ruler', label: 'Ruler', shortcut: 'U', icon: '📏' },
    { id: 'laser', label: 'Laser', shortcut: 'X', icon: '🔴' },
    { id: 'temp-ink', label: 'Temp Ink', shortcut: 'Y', icon: '💧' },
  ];

  const sidebarState = $derived($sidebar);
  const style = $derived($currentStyle);

  function pickTool(tool: ToolKind, disabled: boolean | undefined) {
    if (disabled) return;
    sidebar.setTool(tool);
    onToolChange?.(tool);
    const key = styleKeyFor(tool);
    if (key) onStyleChange?.(sidebar.snapshot().toolStyles[key]);
  }

  function onLaserRadius(e: Event) {
    const v = Number((e.target as HTMLInputElement).value);
    if (Number.isFinite(v)) sidebar.setLaserRadius(v);
  }

  function onTempInkFade(e: Event) {
    const v = Number((e.target as HTMLInputElement).value);
    if (Number.isFinite(v)) sidebar.setTempInkFadeMs(v);
  }

  function onColor(color: string) {
    onStyleChange?.({ ...style, color });
  }

  function onWidth(width: number) {
    sidebar.setWidth(width);
    onStyleChange?.({ ...style, width });
  }

  function onDash(dash: DashStyle) {
    sidebar.setDash(dash);
    onStyleChange?.({ ...style, dash });
  }

  function togglePin() {
    sidebar.togglePin();
    onPinChange?.(sidebar.snapshot().pinned);
  }

  function onCapturePreset() {
    sidebar.capturePreset();
  }

  function onApplyPreset(id: string) {
    sidebar.applyPreset(id);
    const snap = sidebar.snapshot();
    onToolChange?.(snap.activeTool);
    const key = styleKeyFor(snap.activeTool);
    if (key) onStyleChange?.(snap.toolStyles[key]);
  }

  function onRemovePreset(id: string) {
    sidebar.removePreset(id);
  }

  let asideEl: HTMLElement | null = $state(null);
  let dragging = $state(false);
  let dragPointerId: number | null = null;
  let dragOffset = { x: 0, y: 0 };
  let dragCachedSize: { width: number; height: number } = { width: 220, height: 400 };
  let lastClampedPos: { x: number; y: number } | null = null;

  function viewportSize() {
    return { width: window.innerWidth, height: window.innerHeight };
  }

  function measureSidebar(): { width: number; height: number } {
    if (!asideEl) return { width: 220, height: 400 };
    const r = asideEl.getBoundingClientRect();
    return { width: r.width, height: r.height };
  }

  function endDrag(event: PointerEvent) {
    dragging = false;
    dragPointerId = null;
    lastClampedPos = null;
    const target = event.currentTarget as HTMLElement | null;
    if (target?.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
  }

  function onHeaderPointerDown(event: PointerEvent) {
    if (sidebarState.pinned) return;
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest('button')) return;
    if (!asideEl) return;
    const rect = asideEl.getBoundingClientRect();
    dragOffset = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    dragCachedSize = { width: rect.width, height: rect.height };
    lastClampedPos = { x: rect.left, y: rect.top };
    dragPointerId = event.pointerId;
    dragging = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function onHeaderPointerMove(event: PointerEvent) {
    if (!dragging || event.pointerId !== dragPointerId) return;
    const raw = { x: event.clientX - dragOffset.x, y: event.clientY - dragOffset.y };
    const clamped = clampToViewport(raw, dragCachedSize, viewportSize());
    lastClampedPos = clamped;
    sidebar.setFloatingPos(clamped);
  }

  function onHeaderPointerUp(event: PointerEvent) {
    if (!dragging || event.pointerId !== dragPointerId) return;
    const base = lastClampedPos ?? {
      x: event.clientX - dragOffset.x,
      y: event.clientY - dragOffset.y,
    };
    const snapped = applySnap(base, dragCachedSize, viewportSize());
    sidebar.setFloatingPos(snapped);
    sidebar.persistFloatingPos();
    endDrag(event);
  }

  function onHeaderPointerCancel(event: PointerEvent) {
    if (!dragging || event.pointerId !== dragPointerId) return;
    endDrag(event);
  }

  function reclampToViewport() {
    if (sidebarState.pinned) return;
    if (!sidebarState.floatingPos) return;
    const size = measureSidebar();
    const clamped = clampToViewport(sidebarState.floatingPos, size, viewportSize());
    if (clamped.x !== sidebarState.floatingPos.x || clamped.y !== sidebarState.floatingPos.y) {
      sidebar.setFloatingPos(clamped);
      sidebar.persistFloatingPos();
    }
  }

  $effect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => reclampToViewport();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  });

  $effect(() => {
    // re-run when pin state or floating position changes
    void sidebarState.pinned;
    void sidebarState.floatingPos;
    reclampToViewport();
  });

  const floatingStyle = $derived.by(() => {
    if (sidebarState.pinned || !sidebarState.floatingPos) return '';
    return `left: ${sidebarState.floatingPos.x}px; top: ${sidebarState.floatingPos.y}px;`;
  });
</script>

<aside
  class="sidebar"
  class:pinned={sidebarState.pinned}
  class:floating={!sidebarState.pinned}
  class:dragging
  style={floatingStyle}
  bind:this={asideEl}
  aria-label="Tool sidebar"
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <header
    class="head"
    class:grab={!sidebarState.pinned}
    onpointerdown={onHeaderPointerDown}
    onpointermove={onHeaderPointerMove}
    onpointerup={onHeaderPointerUp}
    onpointercancel={onHeaderPointerCancel}
  >
    <span class="title">Tools</span>
    <button
      type="button"
      class="pin"
      aria-pressed={sidebarState.pinned}
      aria-label={sidebarState.pinned ? 'Unpin sidebar' : 'Pin sidebar'}
      title={sidebarState.pinned ? 'Unpin sidebar' : 'Pin sidebar'}
      onclick={togglePin}
    >
      <span aria-hidden="true">{sidebarState.pinned ? '📌' : '📍'}</span>
    </button>
  </header>

  <section class="tools" aria-label="Tools">
    {#each tools as tool (tool.id)}
      <button
        type="button"
        class="tool"
        class:active={sidebarState.activeTool === tool.id}
        disabled={tool.disabled}
        title={`${tool.label} (${tool.shortcut})`}
        aria-pressed={sidebarState.activeTool === tool.id}
        onclick={() => pickTool(tool.id, tool.disabled)}
      >
        <span class="icon" aria-hidden="true">{tool.icon}</span>
        <span class="label">{tool.label.split(' ')[0]}</span>
        <span class="hint" aria-hidden="true">{tool.shortcut}</span>
      </button>
    {/each}
  </section>

  <section class="section" aria-label="Color">
    <h3 class="section-title">Color</h3>
    <ColorPalette
      palettes={sidebarState.palettes}
      activeColor={sidebarState.activeColor}
      onChange={onColor}
    />
  </section>

  <section class="section" aria-label="Width">
    <WidthPicker value={style.width} color={style.color} onChange={onWidth} />
  </section>

  <section class="section" aria-label="Dash">
    <DashStyleToggle value={style.dash} onChange={onDash} />
  </section>

  <section class="section" aria-label="Presets">
    <ToolPresets
      presets={sidebarState.presets}
      activeTool={sidebarState.activeTool}
      onApply={onApplyPreset}
      onCapture={onCapturePreset}
      onRemove={onRemovePreset}
    />
  </section>

  {#if sidebarState.activeTool === 'laser'}
    <section class="section" aria-label="Laser">
      <h3 class="section-title">Laser radius</h3>
      <input
        type="range"
        min="2"
        max="24"
        step="1"
        value={sidebarState.laser.radius}
        oninput={onLaserRadius}
        aria-label="Laser radius"
      />
      <span class="value">{sidebarState.laser.radius}px</span>
    </section>
  {/if}

  {#if sidebarState.activeTool === 'temp-ink'}
    <section class="section" aria-label="Temp ink fade">
      <h3 class="section-title">Fade (ms)</h3>
      <input
        type="number"
        min="500"
        max="30000"
        step="100"
        value={sidebarState.tempInkFadeMs}
        oninput={onTempInkFade}
        aria-label="Temp ink fade duration in milliseconds"
      />
    </section>
  {/if}
</aside>

<style>
  .sidebar {
    background: #252525;
    color: #e8e8e8;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 12px;
    box-sizing: border-box;
    min-width: 200px;
    font-family:
      system-ui,
      -apple-system,
      Segoe UI,
      sans-serif;
    font-size: 13px;
  }
  .sidebar.pinned {
    width: 220px;
    height: 100%;
    border-right: 1px solid #1a1a1a;
  }
  .sidebar.floating {
    position: absolute;
    left: 12px;
    top: 12px;
    width: 220px;
    border-radius: 8px;
    border: 1px solid #1a1a1a;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
    z-index: 10;
    transition:
      left 120ms ease-out,
      top 120ms ease-out;
  }
  .sidebar.floating.dragging {
    transition: none;
    user-select: none;
  }

  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .head.grab {
    cursor: grab;
    touch-action: none;
  }
  .sidebar.dragging .head.grab {
    cursor: grabbing;
  }
  .title {
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    font-size: 11px;
    color: #aaa;
  }
  .pin {
    background: transparent;
    border: 1px solid #3a3a3a;
    color: #ddd;
    border-radius: 4px;
    padding: 2px 6px;
    cursor: pointer;
  }
  .pin:hover {
    border-color: #666;
  }

  .tools {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
  }
  .tool {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    background: #1b1b1b;
    border: 1px solid #333;
    color: #ddd;
    border-radius: 6px;
    padding: 8px 4px;
    cursor: pointer;
    position: relative;
  }
  .tool:hover:not(:disabled) {
    border-color: #666;
  }
  .tool.active {
    border-color: #7ab7ff;
    background: #2a3847;
    color: #fff;
    box-shadow: 0 0 0 2px rgba(122, 183, 255, 0.25);
  }
  .tool:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .tool .icon {
    font-size: 18px;
  }
  .tool .label {
    font-size: 11px;
  }
  .tool .hint {
    position: absolute;
    top: 4px;
    right: 6px;
    font-size: 10px;
    color: #888;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .section-title {
    font-size: 11px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #bbb;
    margin: 0;
    font-weight: 500;
  }
  .value {
    font-size: 11px;
    color: #aaa;
  }
  input[type='number'] {
    background: #1b1b1b;
    border: 1px solid #333;
    color: #ddd;
    border-radius: 4px;
    padding: 4px 6px;
    font: inherit;
  }
</style>
