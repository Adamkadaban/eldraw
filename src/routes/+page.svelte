<script lang="ts">
  // Placeholder shell. Phase 1 worktrees will replace this with the real
  // sidebar + canvas layout. See AGENTS.md for the parallel work plan.
</script>

<main class="app">
  <aside class="sidebar" aria-label="Tool sidebar">
    <p class="placeholder">sidebar (feat/sidebar-tools)</p>
  </aside>
  <section class="canvas-area" aria-label="Canvas area">
    <p class="placeholder">canvas stack (feat/pdf-pipeline + feat/ink-engine)</p>
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
</style>
