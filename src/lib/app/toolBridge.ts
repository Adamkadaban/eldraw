import { currentStyle, sidebar } from '$lib/store/sidebar';
import { setStyle, setTool } from '$lib/store/tool';

/**
 * One-way bridge: sidebar (UI source of truth) → tool store (read by ink engine).
 * Returns an unsubscribe function.
 */
export function startToolBridge(): () => void {
  const unsubTool = sidebar.subscribe((s) => setTool(s.activeTool));
  const unsubStyle = currentStyle.subscribe((style) => setStyle(style));
  return () => {
    unsubTool();
    unsubStyle();
  };
}
