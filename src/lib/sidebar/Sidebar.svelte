<script lang="ts">
  import { currentStyle, sidebar, styleKeyFor, type SmoothingTool } from '$lib/store/sidebar';
  import type { DashStyle, StrokeStyle, ToolKind } from '$lib/types';
  import type { SidebarState } from '$lib/store/sidebar';
  import ColorPalette from './ColorPalette.svelte';
  import WidthPicker from './WidthPicker.svelte';
  import DashStyleToggle from './DashStyleToggle.svelte';
  import ToolPresets from './ToolPresets.svelte';
  import ShortcutsEditor from '$lib/settings/ShortcutsEditor.svelte';
  import { applySnap, clampToViewport, detectSnapEdge, type SnapEdge } from './snap';

  interface Props {
    onToolChange?: (tool: ToolKind) => void;
    onStyleChange?: (style: StrokeStyle) => void;
    onPinChange?: (pinned: boolean) => void;
    onDetachChange?: (detached: boolean) => void;
    /**
     * When true, this sidebar is rendered inside the detached window.
     * The detach button becomes a "dock" button and the pin toggle is
     * hidden because pinning is a main-window concept only.
     */
    mode?: 'inline' | 'detached';
  }

  let {
    onToolChange,
    onStyleChange,
    onPinChange,
    onDetachChange,
    mode = 'inline',
  }: Props = $props();

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
  const activeSmoothingTool = $derived(smoothingToolFor(sidebarState.activeTool));
  const smoothing = $derived(
    activeSmoothingTool ? smoothingValue(sidebarState, activeSmoothingTool) : 0,
  );

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

  function smoothingToolFor(tool: ToolKind): SmoothingTool | null {
    if (tool === 'pen' || tool === 'highlighter' || tool === 'temp-ink') return tool;
    return null;
  }

  function smoothingValue(state: SidebarState, tool: SmoothingTool): number {
    if (tool === 'pen') return state.smoothingPen;
    if (tool === 'highlighter') return state.smoothingHighlighter;
    return state.smoothingTempInk;
  }

  function onSmoothing(e: Event) {
    const tool = smoothingToolFor(sidebarState.activeTool);
    if (!tool) return;
    const v = Number((e.target as HTMLInputElement).value);
    if (Number.isFinite(v)) sidebar.setSmoothing(tool, v);
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

  function onDetachClick() {
    onDetachChange?.(mode !== 'detached');
  }

  let shortcutsOpen = $state(false);

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
  let hoverEdge: SnapEdge | null = $state(null);

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
    hoverEdge = null;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function onHeaderPointerMove(event: PointerEvent) {
    if (!dragging || event.pointerId !== dragPointerId) return;
    const raw = { x: event.clientX - dragOffset.x, y: event.clientY - dragOffset.y };
    const clamped = clampToViewport(raw, dragCachedSize, viewportSize());
    lastClampedPos = clamped;
    hoverEdge = detectSnapEdge(clamped, dragCachedSize, viewportSize());
    if (sidebarState.snapEdge !== null) sidebar.setSnapEdge(null);
    sidebar.setFloatingPos(clamped);
  }

  function onHeaderPointerUp(event: PointerEvent) {
    if (!dragging || event.pointerId !== dragPointerId) return;
    const base = lastClampedPos ?? {
      x: event.clientX - dragOffset.x,
      y: event.clientY - dragOffset.y,
    };
    const edge = detectSnapEdge(base, dragCachedSize, viewportSize());
    if (edge) {
      sidebar.setSnapEdge(edge);
    } else {
      const snapped = applySnap(base, dragCachedSize, viewportSize());
      sidebar.setFloatingPos(snapped);
      sidebar.persistFloatingPos();
    }
    hoverEdge = null;
    endDrag(event);
  }

  function onHeaderPointerCancel(event: PointerEvent) {
    if (!dragging || event.pointerId !== dragPointerId) return;
    hoverEdge = null;
    endDrag(event);
  }

  function reclampToViewport() {
    if (sidebarState.pinned) return;
    if (sidebarState.snapEdge) return;
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
    if (sidebarState.pinned) return '';
    if (sidebarState.snapEdge) return '';
    if (!sidebarState.floatingPos) return '';
    return `left: ${sidebarState.floatingPos.x}px; top: ${sidebarState.floatingPos.y}px;`;
  });

  function showAgain() {
    sidebar.setHidden(false);
  }

  function toggleMinimize() {
    sidebar.toggleMinimized();
  }

  function toggleHide() {
    sidebar.toggleHidden();
  }

  function releaseSnap() {
    sidebar.setSnapEdge(null);
  }
</script>

<aside
  class="sidebar"
  class:pinned={sidebarState.pinned}
  class:floating={!sidebarState.pinned && !sidebarState.snapEdge}
  class:dragging
  class:minimized={!sidebarState.pinned && sidebarState.minimized && !sidebarState.hidden}
  class:hidden={sidebarState.hidden && !sidebarState.pinned && mode !== 'detached'}
  class:snapped={!sidebarState.pinned && !!sidebarState.snapEdge}
  data-snap-edge={sidebarState.snapEdge ?? ''}
  style={floatingStyle}
  bind:this={asideEl}
  aria-label="Tool sidebar"
  aria-hidden={sidebarState.hidden && !sidebarState.pinned && mode !== 'detached'}
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
    {#if mode !== 'detached'}
      <button
        type="button"
        class="pin primary detach"
        aria-label="Detach sidebar to its own window"
        title="Detach to window"
        onclick={onDetachClick}
      >
        <span aria-hidden="true">⇱</span>
      </button>
    {:else}
      <button
        type="button"
        class="pin"
        aria-label="Dock sidebar"
        title="Dock sidebar"
        onclick={onDetachClick}
      >
        <span aria-hidden="true">⇲</span>
      </button>
    {/if}
    {#if mode !== 'detached' && !sidebarState.pinned}
      <button
        type="button"
        class="pin"
        aria-pressed={sidebarState.minimized}
        aria-label={sidebarState.minimized ? 'Expand sidebar' : 'Minimize sidebar'}
        title={sidebarState.minimized ? 'Expand sidebar' : 'Minimize sidebar'}
        onclick={toggleMinimize}
      >
        <span aria-hidden="true">{sidebarState.minimized ? '▢' : '▬'}</span>
      </button>
      {#if sidebarState.snapEdge}
        <button
          type="button"
          class="pin"
          aria-label="Unsnap sidebar"
          title="Unsnap"
          onclick={releaseSnap}
        >
          <span aria-hidden="true">◇</span>
        </button>
      {/if}
      <button
        type="button"
        class="pin"
        aria-label="Hide sidebar"
        title="Hide sidebar"
        onclick={toggleHide}
      >
        <span aria-hidden="true">✕</span>
      </button>
    {/if}
    <button
      type="button"
      class="pin"
      aria-label="Shortcuts settings"
      title="Customize keyboard shortcuts"
      onclick={() => (shortcutsOpen = true)}
    >
      <span aria-hidden="true">⚙</span>
    </button>
    {#if mode !== 'detached'}
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
    {/if}
  </header>

  {#if !sidebarState.minimized || sidebarState.pinned}
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
  {:else}
    <section class="tools mini" aria-label="Tools">
      {#each tools as tool (tool.id)}
        <button
          type="button"
          class="tool mini"
          class:active={sidebarState.activeTool === tool.id}
          disabled={tool.disabled}
          title={`${tool.label} (${tool.shortcut})`}
          aria-pressed={sidebarState.activeTool === tool.id}
          onclick={() => pickTool(tool.id, tool.disabled)}
        >
          <span class="icon" aria-hidden="true">{tool.icon}</span>
        </button>
      {/each}
    </section>
  {/if}

  {#if !sidebarState.minimized || sidebarState.pinned}
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

    {#if activeSmoothingTool}
      <section class="section smoothing" aria-label="Smoothing">
        <h3 class="section-title">Smoothing</h3>
        <div class="row">
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={smoothing}
            oninput={onSmoothing}
            aria-label="Smoothing amount"
          />
          <span class="value">{smoothing}%</span>
        </div>
      </section>
    {/if}

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
  {/if}
</aside>

{#if sidebarState.hidden && !sidebarState.pinned && mode !== 'detached'}
  <button
    type="button"
    class="show-pill"
    aria-label="Show sidebar"
    title="Show sidebar"
    onclick={showAgain}
  >
    <span aria-hidden="true">🛠</span>
  </button>
{/if}

{#if dragging && !sidebarState.pinned}
  <div class="snap-targets" aria-hidden="true">
    <div class="snap-target left" class:active={hoverEdge === 'left'}></div>
    <div class="snap-target right" class:active={hoverEdge === 'right'}></div>
    <div class="snap-target top" class:active={hoverEdge === 'top'}></div>
    <div class="snap-target bottom" class:active={hoverEdge === 'bottom'}></div>
  </div>
{/if}

{#if shortcutsOpen}
  <ShortcutsEditor onClose={() => (shortcutsOpen = false)} />
{/if}

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

  .sidebar.minimized {
    width: auto;
    min-width: 0;
  }
  .sidebar.hidden {
    display: none;
  }
  .sidebar.snapped {
    position: absolute;
    border-radius: 0;
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
    z-index: 10;
    border: 1px solid #1a1a1a;
  }
  .sidebar.snapped[data-snap-edge='left'] {
    left: 0;
    top: 0;
    bottom: 0;
    width: 220px;
    border-left: none;
  }
  .sidebar.snapped[data-snap-edge='right'] {
    right: 0;
    top: 0;
    bottom: 0;
    width: 220px;
    border-right: none;
  }
  .sidebar.snapped[data-snap-edge='top'] {
    left: 0;
    right: 0;
    top: 0;
    width: auto;
    border-top: none;
  }
  .sidebar.snapped[data-snap-edge='bottom'] {
    left: 0;
    right: 0;
    bottom: 0;
    width: auto;
    border-bottom: none;
  }

  .pin.primary.detach {
    background: #2a3847;
    border-color: #4a7bb5;
    color: #fff;
  }
  .pin.primary.detach:hover {
    border-color: #7ab7ff;
  }

  .tools.mini {
    grid-template-columns: 1fr;
    gap: 4px;
  }
  .tool.mini {
    padding: 6px 4px;
  }
  .tool.mini .icon {
    font-size: 16px;
  }

  .show-pill {
    position: fixed;
    left: 12px;
    bottom: 12px;
    z-index: 11;
    background: #252525;
    color: #e8e8e8;
    border: 1px solid #3a3a3a;
    border-radius: 999px;
    width: 36px;
    height: 36px;
    font-size: 16px;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  }
  .show-pill:hover {
    border-color: #7ab7ff;
  }

  .snap-targets {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 20;
  }
  .snap-target {
    position: absolute;
    background: rgba(122, 183, 255, 0.12);
    border: 2px dashed rgba(122, 183, 255, 0.55);
    transition:
      background-color 80ms,
      border-color 80ms;
  }
  .snap-target.active {
    background: rgba(122, 183, 255, 0.32);
    border-color: rgba(122, 183, 255, 0.95);
    border-style: solid;
  }
  .snap-target.left {
    left: 0;
    top: 0;
    bottom: 0;
    width: 48px;
  }
  .snap-target.right {
    right: 0;
    top: 0;
    bottom: 0;
    width: 48px;
  }
  .snap-target.top {
    left: 0;
    right: 0;
    top: 0;
    height: 48px;
  }
  .snap-target.bottom {
    left: 0;
    right: 0;
    bottom: 0;
    height: 48px;
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
  .smoothing .row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .smoothing input[type='range'] {
    flex: 1;
    min-width: 0;
  }
  .smoothing .value {
    min-width: 36px;
    text-align: right;
    font-variant-numeric: tabular-nums;
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
