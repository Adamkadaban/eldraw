<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { CanvasStack, NumberLineEditor, PdfLayer, TextLayer, TextEditor } from '$lib/canvas';
  import { Sidebar } from '$lib/sidebar';
  import { openAndLoadPdf } from '$lib/ipc/pdf';
  import { loadSidecar } from '$lib/ipc';
  import { pdf } from '$lib/store/pdf';
  import { sidebar } from '$lib/store/sidebar';
  import { currentDocument, documentStore, pdfPageIndexAt } from '$lib/store/document';
  import { startAutosave } from '$lib/store/autosave';
  import { viewport, viewportStore, MIN_SCALE, MAX_SCALE } from '$lib/store/viewport';
  import { startToolBridge } from '$lib/app/toolBridge';
  import { shortcuts } from '$lib/app/shortcuts';
  import { openPdfDialog } from '$lib/app/openPdfDialog';
  import { hitTestStrokes } from '$lib/tools/eraser';
  import type {
    AnyObject,
    EldrawDocument,
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

  const pageCount = $derived(doc?.pages.length ?? meta?.pageCount ?? 0);
  const pageIndex = $derived(Math.min(view.currentPageIndex, Math.max(0, pageCount - 1)));
  const currentPage = $derived(doc?.pages[pageIndex] ?? null);
  const pdfPageIndex = $derived(doc ? pdfPageIndexAt(doc.pages, pageIndex) : pageIndex);
  const pageObjects = $derived<AnyObject[]>(currentPage?.objects ?? []);
  const pageStrokes = $derived<StrokeObject[]>(
    pageObjects.filter((o): o is StrokeObject => o.type === 'stroke'),
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

  function onWheel(event: WheelEvent): void {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    if (event.deltaY < 0) viewport.zoomIn();
    else if (event.deltaY > 0) viewport.zoomOut();
  }

  onMount(() => {
    stopBridge = startToolBridge();
  });

  onDestroy(() => {
    stopBridge?.();
    stopAutosave?.();
  });
</script>

<svelte:window />

<main class="app" class:pinned={sidebarState.pinned} use:shortcuts tabindex="-1" role="application">
  <Sidebar />

  <section class="main">
    <header class="topbar">
      <button type="button" class="open" onclick={openFromDialog}>Open PDF…</button>
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
    </header>

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
            <div class="blank-slot" style="width: {size.width}px; height: {size.height}px;"></div>
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
              oncommit={onCommitStroke}
              onerase={onEraseAt}
              oncommitobject={onCommitObject}
            >
              {#snippet overlay()}
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
  .open {
    background: #2a2a2a;
    border: 1px solid #3a3a3a;
    color: #ddd;
    border-radius: 4px;
    padding: 4px 10px;
    cursor: pointer;
  }
  .open:hover {
    border-color: #666;
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
</style>
