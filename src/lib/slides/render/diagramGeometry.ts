import type { SlideDiagramBlock, SlideDiagramNode } from '$lib/types';

export interface DiagramPoint {
  x: number;
  y: number;
}

export interface DiagramNodeGeometry {
  id: string;
  text: string;
  shape: 'box' | 'plain';
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DiagramEdgeGeometry {
  from: DiagramPoint;
  to: DiagramPoint;
  head: [DiagramPoint, DiagramPoint, DiagramPoint];
  label: string | undefined;
  labelAt: DiagramPoint;
}

export interface DiagramGeometry {
  nodes: DiagramNodeGeometry[];
  edges: DiagramEdgeGeometry[];
  caption: DiagramPoint | null;
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function nodeSize(
  node: SlideDiagramNode,
  width: number,
  height: number,
  bodySize: number,
): { w: number; h: number } {
  const shape = node.shape ?? 'box';
  const naturalWidth = clamp(
    node.text.length * bodySize * 0.52 + bodySize * (shape === 'box' ? 1.8 : 0.5),
    bodySize * 2,
    width * 0.6,
  );
  const naturalHeight = bodySize * (shape === 'box' ? 2.1 : 1.5);
  return {
    w: node.w === undefined ? naturalWidth : clamp(finite(node.w, 0) * width, bodySize, width),
    h:
      node.h === undefined
        ? Math.min(height, naturalHeight)
        : clamp(finite(node.h, 0) * height, bodySize, height),
  };
}

function edgePoint(source: DiagramNodeGeometry, target: DiagramNodeGeometry): DiagramPoint {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  if (dx === 0 && dy === 0) return { x: source.x, y: source.y };
  const xScale = dx === 0 ? Infinity : source.w / 2 / Math.abs(dx);
  const yScale = dy === 0 ? Infinity : source.h / 2 / Math.abs(dy);
  const scale = Math.min(xScale, yScale);
  return { x: source.x + dx * scale, y: source.y + dy * scale };
}

function arrowHead(
  from: DiagramPoint,
  to: DiagramPoint,
  size: number,
): DiagramEdgeGeometry['head'] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return [to, to, to];
  const ux = dx / length;
  const uy = dy / length;
  const px = -uy;
  const py = ux;
  const baseX = to.x - ux * size;
  const baseY = to.y - uy * size;
  return [
    to,
    { x: baseX + px * size * 0.45, y: baseY + py * size * 0.45 },
    { x: baseX - px * size * 0.45, y: baseY - py * size * 0.45 },
  ];
}

/** Convert fractional node positions into bounded local diagram coordinates. */
export function diagramGeometry(
  block: SlideDiagramBlock,
  width: number,
  height: number,
  bodySize: number,
): DiagramGeometry {
  const w = Math.max(0, finite(width, 0));
  const h = Math.max(0, finite(height, 0));
  const fontSize = Math.max(1, finite(bodySize, 13));
  const nodes = block.nodes.map((node): DiagramNodeGeometry => {
    const size = nodeSize(node, w, h, fontSize);
    const x = clamp(finite(node.x, 0.5), 0, 1) * w;
    const y = clamp(finite(node.y, 0.5), 0, 1) * h;
    return {
      id: node.id,
      text: node.text,
      shape: node.shape ?? 'box',
      x: clamp(x, size.w / 2, Math.max(size.w / 2, w - size.w / 2)),
      y: clamp(y, size.h / 2, Math.max(size.h / 2, h - size.h / 2)),
      ...size,
    };
  });
  const byId = new Map<string, DiagramNodeGeometry>();
  for (const node of nodes) {
    if (!byId.has(node.id)) byId.set(node.id, node);
  }
  const edges: DiagramEdgeGeometry[] = [];
  const headSize = Math.min(fontSize * 0.55, w * 0.018);
  for (const edge of block.edges) {
    const fromNode = byId.get(edge.from);
    const toNode = byId.get(edge.to);
    if (!fromNode || !toNode || fromNode === toNode) continue;
    const from = edgePoint(fromNode, toNode);
    const to = edgePoint(toNode, fromNode);
    edges.push({
      from,
      to,
      head: arrowHead(from, to, headSize),
      label: edge.label,
      labelAt: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - fontSize * 0.7 },
    });
  }
  return {
    nodes,
    edges,
    caption: block.caption ? { x: w / 2, y: Math.min(h, fontSize * 0.75) } : null,
  };
}
