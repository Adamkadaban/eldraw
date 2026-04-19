import { currentStyle, sidebar } from '$lib/store/sidebar';
import type { ToolKind } from '$lib/types';
import { setStyle, setTool } from '$lib/store/tool';

/**
 * One-way bridge: sidebar (UI source of truth) → tool store (read by ink engine).
 * Returns an unsubscribe function.
 */
export function startToolBridge(): () => void {
  let lastTool: ToolKind | null = null;
  const unsubTool = sidebar.subscribe((s) => {
    if (s.activeTool !== lastTool) {
      lastTool = s.activeTool;
      setTool(s.activeTool);
    }
  });
  const unsubStyle = currentStyle.subscribe((style) => setStyle(style));
  return () => {
    unsubTool();
    unsubStyle();
  };
}
