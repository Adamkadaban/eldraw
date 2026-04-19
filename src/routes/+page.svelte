<script lang="ts">
  import PdfLayer from '$lib/canvas/PdfLayer.svelte';
  import { pdf } from '$lib/store/pdf';
  import { openAndLoadPdf } from '$lib/ipc/pdf';

  let pageIndex = $state(0);
  const scale = 1.5;

  async function onFileChosen(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    // In the Tauri runtime File.path is available; in a browser dev session
    // we fall back to the plain name for debugging.
    const path = (file as File & { path?: string }).path ?? file.name;
    await openAndLoadPdf(path);
    pageIndex = 0;
  }
</script>

<main class="app">
  <aside class="sidebar" aria-label="Tool sidebar">
    <p class="placeholder">sidebar (feat/sidebar-tools)</p>
  </aside>
  <section class="canvas-area" aria-label="Canvas area">
    <p class="placeholder">canvas stack (feat/pdf-pipeline + feat/ink-engine)</p>
    <label class="dev-open">
      Open PDF
      <input type="file" accept="application/pdf" onchange={onFileChosen} />
    </label>
    {#if $pdf.meta}
      <PdfLayer {pageIndex} {scale} />
    {/if}
  </section>
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
    grid-template-columns: 220px 1fr;
    height: 100vh;
  }
  .sidebar {
    background: #252525;
    border-right: 1px solid #333;
    padding: 12px;
  }
  .canvas-area {
    position: relative;
    overflow: hidden;
  }
  .placeholder {
    color: #888;
    font-size: 13px;
  }
  .dev-open {
    position: absolute;
    top: 8px;
    right: 8px;
    font-size: 12px;
    color: #aaa;
    background: #2a2a2a;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
  }
  .dev-open input {
    display: none;
  }
</style>
