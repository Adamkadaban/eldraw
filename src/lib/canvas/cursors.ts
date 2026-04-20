import type { ToolKind } from '$lib/types';

/**
 * CSS cursor value for each drawing tool. Uses inline SVG data URIs for
 * pen/highlighter so the hotspot visibly reflects the active tool.
 */
const PEN_SVG =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'><path d='M2 18 L6 14 L14 6 L18 2 L18 2 L14 6 L6 14 Z' fill='%23222' stroke='white' stroke-width='1'/><circle cx='2' cy='18' r='1.2' fill='white'/></svg>\") 2 18, crosshair";

const HIGHLIGHTER_SVG =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 22 22'><path d='M3 19 L7 15 L15 7 L19 11 L11 19 Z' fill='%23fdd835' stroke='%23555' stroke-width='1'/></svg>\") 3 19, crosshair";

const ERASER_SVG =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><rect x='4' y='8' width='14' height='8' rx='2' fill='%23f4a' stroke='%23222' stroke-width='1.4' transform='rotate(-30 11 12)'/></svg>\") 12 12, cell";

export function cursorForTool(tool: ToolKind): string {
  switch (tool) {
    case 'pen':
      return PEN_SVG;
    case 'highlighter':
      return HIGHLIGHTER_SVG;
    case 'eraser':
      return ERASER_SVG;
    case 'line':
    case 'rect':
    case 'ellipse':
    case 'numberline':
    case 'graph':
    case 'ruler':
    case 'protractor':
      return 'crosshair';
    case 'text':
      return 'text';
    case 'select':
      return 'default';
    case 'pan':
      return 'grab';
    case 'laser':
    case 'temp-ink':
      return 'crosshair';
  }
}
