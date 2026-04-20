<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import {
    CanvasStack,
    GraphLayer,
    NumberLineEditor,
    PdfLayer,
    ProtractorOverlay,
    RulerOverlay,
    TextLayer,
    TextEditor,
  } from '$lib/canvas';
  import { Sidebar } from '$lib/sidebar';
  import { ThumbnailStrip } from '$lib/sidebar';
  import { openAndLoadPdf } from '$lib/ipc/pdf';
  import { loadSidecar } from '$lib/ipc';
  import { pdf, clearError } from '$lib/store/pdf';
  import { sidebar, hydrateSidebarFromStorage } from '$lib/store/sidebar';
  import { currentDocument, documentStore, pdfPageIndexAt } from '$lib/store/document';
  import { startAutosave } from '$lib/store/autosave';
  import { viewport, viewportStore, MIN_SCALE, MAX_SCALE } from '$lib/store/viewport';
  import { presenterStore } from '$lib/store/presenter';
  import { zenStore } from '$lib/store/zen';
  import { overlays } from '$lib/store/overlays';
  import { startToolBridge } from '$lib/app/toolBridge';
  import { shortcuts } from '$lib/app/shortcuts';
  import { openPdfDialog } from '$lib/app/openPdfDialog';
  import { hitTestStrokes } from '$lib/tools/eraser';
  import { activeGraph, clearActiveGraph, setActiveGraph } from '$lib/store/activeGraph';
  import { createGraphObject } from '$lib/graph/graphObject';
  import GraphEditor from '$lib/graph/GraphEditor.svelte';
  import { log } from '$lib/log';
  import type {
    AnyObject,
    EldrawDocument,
    GraphObject,
    LineObject,
    NumberLineObject,
    PdfMeta,
    ShapeObject,
    StrokeObject,
    TextObject,
  } from '$lib/types';

  const ERASER_RADIUS = 4;

  let stopBridge: (() => void) | null = null;
  let stopAutosave: (() => void) | null = null;

  const pdfState = $derived($pdf);
  const meta = $derived<PdfMeta | null>(pdfState.meta);
  const doc = $derived<EldrawDocument | null>($currentDocument);
  const view = $derived($viewportStore);
  const sidebarState = $derived($sidebar);
  const overlaysState = $derived($overlays);
  const rulerVisible = $derived(overlaysState.rulerVisible || sidebarState.activeTool === 'ruler');
  const rulerSnapState = $derived(rulerVisible ? overlaysState.ruler : null);
  $effect(() => {
    if (sidebarState.activeTool === 'ruler' && !overlaysState.rulerVisible) {
      overlays.setRulerVisible(true);
    }
  });
  const presenterState = $derived($presenterStore);
  const isPresenter = $derived(presenterState.active);
  const zenState = $derived($zenStore);
  const isZen = $derived(zenState.active);
  const chromeHidden = $derived(isPresenter || isZen);

  let zenHintVisible = $state(false);
  $effect(() => {
    if (!isZen) {
      zenHintVisible = false;
      return;
    }
    zenHintVisible = true;
    const timer = window.setTimeout(() => {
      zenHintVisible = false;
    }, 2400);
    return () => window.clearTimeout(timer);
  });
  const pages = $derived(doc?.pages ?? []);

  function onThumbPick(i: number): void {
    log('page', `thumb pick ${i}`);
    viewport.setPage(i, pages.length);
  }

  function onThumbMove(from: number, to: number): void {
    const snap = viewport.snapshot();
    const current = snap.currentPageIndex;
    const clampedTo = Math.max(0, Math.min(to, pages.length - 1));
    documentStore.movePage(from, to);
    if (current === from) {
      viewport.setPage(clampedTo, pages.length);
    } else if (from < current && current <= clampedTo) {
      viewport.setPage(Math.max(0, current - 1), pages.length);
    } else if (clampedTo <= current && current < from) {
      viewport.setPage(Math.min(pages.length - 1, current + 1), pages.length);
    }
  }

  function onThumbDuplicate(i: number): void {
    documentStore.duplicatePage(i);
    viewport.setPage(i + 1, pages.length + 1);
  }

  function onThumbDelete(i: number): void {
    if (pages.length <= 1) return;
    documentStore.deletePage(i);
    const nextTotal = pages.length - 1;
    const snap = viewport.snapshot();
    if (snap.currentPageIndex >= i) {
      viewport.setPage(Math.max(0, snap.currentPageIndex - 1), nextTotal);
    }
  }

  function clearCurrentPage(): void {
    if (pageObjects.length === 0) return;
    const ok = window.confirm('Clear all annotations on this page? This can be undone.');
    if (!ok) return;
    documentStore.clearPage(pageIndex);
  }

  const pageCount = $derived(doc?.pages.length ?? meta?.pageCount ?? 0);
  const pageIndex = $derived(Math.min(view.currentPageIndex, Math.max(0, pageCount - 1)));
  const currentPage = $derived(doc?.pages[pageIndex] ?? null);
  const pdfPageIndex = $derived(doc ? pdfPageIndexAt(doc.pages, pageIndex) : pageIndex);
  const pageObjects = $derived<AnyObject[]>(currentPage?.objects ?? []);
  const pageStrokes = $derived<StrokeObject[]>(
    pageObjects.filter((o): o is StrokeObject => o.type === 'stroke'),
  );
  const pageGraphs = $derived<GraphObject[]>(
    pageObjects.filter((o): o is GraphObject => o.type === 'graph'),
  );
  const activeGraphRef = $derived($activeGraph);
  const editingGraph = $derived<GraphObject | null>(
    activeGraphRef && activeGraphRef.pageIndex === pageIndex
      ? (pageGraphs.find((g) => g.id === activeGraphRef.objectId) ?? null)
      : null,
  );
  const pageTextObjects = $derived<TextObject[]>(
    pageObjects.filter((o): o is TextObject => o.type === 'text'),
  );
  const isTextTool = $derived(sidebarState.activeTool === 'text');

  type EditorState =
    | { mode: 'create'; at: { x: number; y: number }; screen: { x: number; y: number } }
    | { mode: 'edit'; obj: TextObject; screen: { x: number; y: number } };

  let editor: EditorState | null = $state(null);

  const editorInitial = $derived.by(() => {
    if (!editor) return null;
    if (editor.mode === 'edit') {
      const o = editor.obj;
      return { content: o.content, latex: o.latex, fontSize: o.fontSize, color: o.color };
    }
    return { content: '', latex: false, fontSize: 16, color: sidebarState.activeColor };
  });

  function newId(): string {
    return `t_${crypto.randomUUID()}`;
  }

  function onTextEmptyClick(at: { x: number; y: number }, screen: { x: number; y: number }): void {
    if (!isTextTool) return;
    editor = { mode: 'create', at, screen };
  }

  function onTextPick(obj: TextObject, screen: { x: number; y: number }): void {
    if (!isTextTool) return;
    editor = { mode: 'edit', obj, screen };
  }

  function onEditorOk(result: {
    content: string;
    latex: boolean;
    fontSize: number;
    color: string;
  }): void {
    if (!editor) return;
    if (editor.mode === 'create') {
      if (result.content.trim().length === 0) {
        editor = null;
        return;
      }
      const obj: TextObject = {
        id: newId(),
        createdAt: Date.now(),
        type: 'text',
        at: editor.at,
        content: result.content,
        latex: result.latex,
        fontSize: result.fontSize,
        color: result.color,
      };
      documentStore.addObject(pageIndex, obj);
    } else {
      if (result.content.trim().length === 0) {
        documentStore.removeObject(pageIndex, editor.obj.id);
      } else {
        documentStore.updateObject(pageIndex, editor.obj.id, {
          content: result.content,
          latex: result.latex,
          fontSize: result.fontSize,
          color: result.color,
        });
      }
    }
    editor = null;
  }

  function onEditorCancel(): void {
    editor = null;
  }

  const pageDimsPt = $derived(() => {
    if (currentPage) return { width: currentPage.width, height: currentPage.height };
    const pdfPage = meta?.pages[pageIndex];
    if (pdfPage) return pdfPage;
    return null;
  });

  const canvasSize = $derived(() => {
    const dims = pageDimsPt();
    if (!dims) return null;
    return {
      width: Math.round(dims.width * view.scale),
      height: Math.round(dims.height * view.scale),
      ptToPx: view.scale,
    };
  });

  function buildEmptyDoc(m: PdfMeta): EldrawDocument {
    return {
      version: 1,
      pdfHash: m.hash,
      pdfPath: m.path,
      pages: m.pages.map((p, i) => ({
        pageIndex: i,
        type: 'pdf',
        insertedAfterPdfPage: null,
        width: p.width,
        height: p.height,
        objects: [],
      })),
      palettes: [],
      prefs: {
        sidebarPinned: true,
        defaultTool: 'pen',
        toolDefaults: {
          pen: { color: '#000000', width: 2, dash: 'solid', opacity: 1 },
          highlighter: { color: '#fdd835', width: 14, dash: 'solid', opacity: 0.3 },
          line: { color: '#000000', width: 2, dash: 'solid', opacity: 1 },
        },
      },
    };
  }

  async function openFromDialog(): Promise<void> {
    const path = await openPdfDialog();
    if (!path) return;
    await loadPath(path);
  }

  async function loadPath(path: string): Promise<void> {
    const loaded = await openAndLoadPdf(path);
    if (!loaded) return;

    let sidecar: EldrawDocument | null = null;
    try {
      sidecar = await loadSidecar(path);
    } catch {
      sidecar = null;
    }

    documentStore.load(sidecar ?? buildEmptyDoc(loaded));

    stopAutosave?.();
    stopAutosave = startAutosave(path);
    viewport.setPage(0, loaded.pageCount);
  }

  function onCommitStroke(stroke: StrokeObject): void {
    documentStore.addObject(pageIndex, stroke);
  }

  let editingNumberLineId = $state<string | null>(null);

  function onCommitObject(obj: LineObject | ShapeObject | NumberLineObject): void {
    documentStore.addObject(pageIndex, obj);
    if (obj.type === 'numberline') editingNumberLineId = obj.id;
  }

  const editingNumberLine = $derived<NumberLineObject | null>(
    editingNumberLineId
      ? (pageObjects.find(
          (o): o is NumberLineObject => o.type === 'numberline' && o.id === editingNumberLineId,
        ) ?? null)
      : null,
  );

  function patchEditingNumberLine(patch: Partial<NumberLineObject>): void {
    if (!editingNumberLineId) return;
    documentStore.updateObject(pageIndex, editingNumberLineId, patch);
  }

  function onEraseAt(at: { x: number; y: number }): void {
    const hits = hitTestStrokes(pageStrokes, at, ERASER_RADIUS);
    for (const s of hits) {
      documentStore.removeObject(pageIndex, s.id);
    }
  }

  function onCommitGraph(bounds: { x: number; y: number; w: number; h: number }): void {
    const graph = createGraphObject(bounds);
    documentStore.addObject(pageIndex, graph);
    setActiveGraph({ pageIndex, objectId: graph.id });
  }

  function onUpdateGraph(patch: Partial<GraphObject>): void {
    if (!editingGraph) return;
    documentStore.updateObject(pageIndex, editingGraph.id, patch);
  }

  function onDeleteGraph(): void {
    if (!editingGraph) return;
    documentStore.removeObject(pageIndex, editingGraph.id);
    clearActiveGraph();
  }

  function onWheel(event: WheelEvent): void {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    if (event.deltaY < 0) viewport.zoomIn();
    else if (event.deltaY > 0) viewport.zoomOut();
  }

  let stopHydration: (() => void) | null = null;

  onMount(() => {
    stopHydration = hydrateSidebarFromStorage();
    stopBridge = startToolBridge();
  });

  onDestroy(() => {
    stopBridge?.();
    stopAutosave?.();
    stopHydration?.();
  });
</script>

<svelte:window />

<main
  class="app"
  class:pinned={sidebarState.pinned}
  class:presenter={isPresenter}
  class:zen={isZen}
  class:has-thumbs={!chromeHidden && pages.length > 0}
  use:shortcuts
  tabindex="-1"
  role="application"
>
  {#if !chromeHidden}
    <Sidebar />
  {/if}

  <section class="main">
    {#if !chromeHidden}
      <header class="topbar">
        <button type="button" class="topbar-btn" onclick={openFromDialog}>Open PDF…</button>
        <div class="pager">
          <button
            type="button"
            aria-label="Previous page"
            disabled={pageIndex <= 0}
            onclick={() => viewport.prevPage()}
          >
            ‹
          </button>
          <span class="page-indicator">
            {#if pageCount > 0}
              Page {pageIndex + 1} / {pageCount}
            {:else}
              No PDF loaded
            {/if}
          </span>
          <button
            type="button"
            aria-label="Next page"
            disabled={pageIndex >= pageCount - 1}
            onclick={() => viewport.nextPage(pageCount)}
          >
            ›
          </button>
        </div>
        <div class="zoom">
          <button type="button" aria-label="Zoom out" onclick={() => viewport.zoomOut()}>−</button>
          <span class="zoom-indicator">{Math.round(view.scale * 100)}%</span>
          <button type="button" aria-label="Zoom in" onclick={() => viewport.zoomIn()}>+</button>
        </div>
        <button
          type="button"
          class="topbar-btn"
          aria-label="Clear annotations on this page"
          title="Clear annotations on this page"
          disabled={pageObjects.length === 0}
          onclick={clearCurrentPage}
        >
          Clear page
        </button>
      </header>
    {/if}

    <div class="canvas-area" onwheel={onWheel}>
      {#if canvasSize()}
        {@const size = canvasSize()!}
        <div
          class="page-frame"
          style="width: {size.width}px; height: {size.height}px; transform: translate({view.offsetX}px, {view.offsetY}px);"
        >
          {#if meta && currentPage?.type !== 'blank' && pdfPageIndex !== null}
            <div class="pdf-slot">
              <PdfLayer pageIndex={pdfPageIndex} scale={view.scale} />
            </div>
          {:else if currentPage?.type === 'blank'}
            <div
              class="blank-slot"
              style="width: {size.width}px; height: {size.height}px;"
              style:background-color={currentPage.background ?? '#fff'}
            ></div>
          {/if}
          <div class="stack-slot">
            <CanvasStack
              strokes={pageStrokes}
              objects={pageObjects}
              width={size.width}
              height={size.height}
              ptToPx={size.ptToPx}
              activeTool={sidebarState.activeTool}
              laserColor={sidebarState.laser.color}
              laserRadius={sidebarState.laser.radius}
              tempInkStyle={sidebarState.toolStyles.pen}
              tempInkFadeMs={sidebarState.tempInkFadeMs}
              rulerSnap={rulerSnapState}
              oncommit={onCommitStroke}
              onerase={onEraseAt}
              ongraph={onCommitGraph}
              oncommitobject={onCommitObject}
            >
              {#snippet overlay()}
                <GraphLayer
                  graphs={pageGraphs}
                  width={size.width}
                  height={size.height}
                  ptToPx={size.ptToPx}
                />
                {#if editingNumberLine}
                  <NumberLineEditor
                    nl={editingNumberLine}
                    ptToPx={size.ptToPx}
                    onchange={patchEditingNumberLine}
                    onclose={() => (editingNumberLineId = null)}
                  />
                {/if}
              {/snippet}
            </CanvasStack>
          </div>
          <div class="text-slot" class:capture={isTextTool}>
            <TextLayer
              objects={pageTextObjects}
              ptToPx={size.ptToPx}
              interactive={isTextTool}
              onemptyclick={onTextEmptyClick}
              onpick={onTextPick}
            />
          </div>
          {#if editingGraph}
            <div
              class="graph-editor-slot"
              style="left: {editingGraph.bounds.x * size.ptToPx}px; top: {(editingGraph.bounds.y +
                editingGraph.bounds.h) *
                size.ptToPx +
                8}px;"
            >
              <GraphEditor
                graph={editingGraph}
                onUpdate={onUpdateGraph}
                onDelete={onDeleteGraph}
                onClose={clearActiveGraph}
              />
            </div>
          {/if}
          {#if sidebarState.activeTool === 'protractor'}
            <div class="overlay-slot">
              <ProtractorOverlay ptToPx={size.ptToPx} width={size.width} height={size.height} />
            </div>
          {/if}
          {#if rulerVisible}
            <div class="overlay-slot">
              <RulerOverlay ptToPx={size.ptToPx} width={size.width} height={size.height} />
            </div>
          {/if}
        </div>
      {:else}
        <div class="empty">
          <p>No PDF loaded. Press <kbd>Open PDF…</kbd> to get started.</p>
          <p class="dim">Zoom range: {MIN_SCALE.toFixed(2)}× – {MAX_SCALE.toFixed(2)}×</p>
        </div>
      {/if}
      {#if view.panMode}
        <div class="pan-indicator" aria-hidden="true">pan</div>
      {/if}
    </div>
  </section>

  {#if !chromeHidden && pages.length > 0}
    <ThumbnailStrip
      {pages}
      currentIndex={pageIndex}
      docKey={doc?.pdfHash ?? null}
      onpick={onThumbPick}
      onmove={onThumbMove}
      onduplicate={onThumbDuplicate}
      ondelete={onThumbDelete}
    />
  {/if}

  {#if isZen && zenHintVisible}
    <div class="zen-hint" role="status">Zen mode — Shift+Z or Esc to exit</div>
  {/if}

  {#if editor && editorInitial}
    <TextEditor
      initialContent={editorInitial.content}
      initialLatex={editorInitial.latex}
      initialFontSize={editorInitial.fontSize}
      initialColor={editorInitial.color}
      screenX={editor.screen.x}
      screenY={editor.screen.y}
      onok={onEditorOk}
      oncancel={onEditorCancel}
    />
  {/if}

  {#if pdfState.error}
    <div class="error-banner" role="alert">
      <span class="error-msg">{pdfState.error}</span>
      <button type="button" class="error-dismiss" aria-label="Dismiss error" onclick={clearError}
        >×</button
      >
    </div>
  {/if}
</main>

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    height: 100%;
    font-family: Inter, system-ui, sans-serif;
    background: #1e1e1e;
    color: #eee;
  }
  .app {
    display: grid;
    grid-template-columns: 1fr;
    height: 100vh;
    outline: none;
  }
  .app.pinned {
    grid-template-columns: 220px 1fr;
  }
  .app.has-thumbs {
    grid-template-columns: 1fr 160px;
  }
  .app.pinned.has-thumbs {
    grid-template-columns: 220px 1fr 160px;
  }
  .app.presenter {
    grid-template-columns: 1fr;
    background: #000;
  }
  .app.presenter .canvas-area {
    background: #000;
  }
  .app.zen {
    grid-template-columns: 1fr;
  }
  .zen-hint {
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(20, 20, 20, 0.85);
    color: #ddd;
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 12px;
    pointer-events: none;
    animation: zen-hint-fade 2.4s ease-out forwards;
    z-index: 1000;
  }
  @keyframes zen-hint-fade {
    0% {
      opacity: 0;
    }
    15% {
      opacity: 1;
    }
    70% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }
  .main {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }
  .topbar {
    height: 36px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 12px;
    background: #202020;
    border-bottom: 1px solid #111;
    font-size: 12px;
  }
  .topbar-btn {
    background: #2a2a2a;
    border: 1px solid #3a3a3a;
    color: #ddd;
    border-radius: 4px;
    padding: 4px 10px;
    cursor: pointer;
  }
  .topbar-btn:hover:not(:disabled) {
    border-color: #666;
  }
  .topbar-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .pager,
  .zoom {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .pager button,
  .zoom button {
    background: #2a2a2a;
    border: 1px solid #3a3a3a;
    color: #ddd;
    width: 24px;
    height: 22px;
    border-radius: 3px;
    cursor: pointer;
  }
  .pager button:disabled,
  .zoom button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .page-indicator,
  .zoom-indicator {
    min-width: 70px;
    text-align: center;
    color: #bbb;
  }
  .zoom {
    margin-left: auto;
  }
  .canvas-area {
    position: relative;
    flex: 1 1 auto;
    overflow: auto;
    background: #121212;
  }
  .page-frame {
    position: relative;
    margin: 24px auto;
    background: #fff;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.6);
  }
  .pdf-slot,
  .stack-slot {
    position: absolute;
    inset: 0;
  }
  .graph-editor-slot {
    position: absolute;
    z-index: 20;
  }
  .overlay-slot {
    position: absolute;
    inset: 0;
    z-index: 15;
    pointer-events: none;
  }
  .overlay-slot :global(svg) {
    pointer-events: auto;
  }
  .text-slot {
    position: absolute;
    inset: 0;
    z-index: 5;
    pointer-events: none;
  }
  .text-slot.capture {
    pointer-events: auto;
  }
  .blank-slot {
    background: #fff;
    box-sizing: border-box;
  }
  .empty {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    justify-content: center;
    align-items: center;
    color: #888;
  }
  .dim {
    font-size: 11px;
    color: #555;
  }
  .pan-indicator {
    position: absolute;
    bottom: 12px;
    left: 12px;
    padding: 2px 8px;
    background: rgba(0, 0, 0, 0.6);
    border: 1px solid #333;
    border-radius: 4px;
    font-size: 11px;
    color: #aaa;
    pointer-events: none;
  }
  kbd {
    font-family: inherit;
    background: #2a2a2a;
    border: 1px solid #3a3a3a;
    padding: 1px 6px;
    border-radius: 3px;
  }
  .error-banner {
    position: fixed;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    max-width: min(720px, calc(100vw - 32px));
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    background: #4a1b1b;
    border: 1px solid #7a2a2a;
    border-radius: 6px;
    color: #fdd;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
    font-size: 13px;
    z-index: 100;
  }
  .error-msg {
    flex: 1 1 auto;
    word-break: break-word;
  }
  .error-dismiss {
    flex: 0 0 auto;
    background: transparent;
    border: none;
    color: #fdd;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    padding: 0 4px;
  }
  .error-dismiss:hover {
    color: #fff;
  }
</style>
