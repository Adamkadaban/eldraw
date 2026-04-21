<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { Sidebar } from '$lib/sidebar';
  import { startSidebarBridge } from '$lib/app/sidebarBridge';
  import { closeSidebarWindow } from '$lib/ipc/sidebar-window';
  import { hydrateSidebarFromStorage } from '$lib/store/sidebar';
  import { warn } from '$lib/log';

  let stopBridge: (() => void) | null = null;
  let stopHydration: (() => void) | null = null;

  function onDetachChange(detached: boolean): void {
    if (!detached) {
      closeSidebarWindow().catch((err) => warn('ipc', 'close_sidebar_window failed', err));
    }
  }

  onMount(() => {
    stopHydration = hydrateSidebarFromStorage();
    stopBridge = startSidebarBridge('detached');
  });

  onDestroy(() => {
    stopBridge?.();
    stopHydration?.();
  });
</script>

<div class="drag-strip" data-tauri-drag-region></div>
<main class="detached">
  <Sidebar mode="detached" {onDetachChange} />
</main>

<style>
  :global(html, body) {
    margin: 0;
    padding: 0;
    height: 100%;
    background: #1e1e1e;
    color: #eee;
    font-family: Inter, system-ui, sans-serif;
    overflow: hidden;
  }
  .drag-strip {
    height: 6px;
    width: 100%;
    background: #151515;
    cursor: grab;
  }
  .detached {
    height: calc(100vh - 6px);
    overflow: auto;
  }
  .detached :global(.sidebar) {
    height: 100%;
  }
</style>
