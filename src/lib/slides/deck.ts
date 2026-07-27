import { isSafeHexColor } from '$lib/color';
import type {
  GraphFunction,
  NumberLineMark,
  Slide,
  SlideAlign,
  SlideBlock,
  SlideCalloutBlock,
  SlideCalloutTone,
  SlideDiagramEdge,
  SlideDiagramNode,
  SlideGraphSpec,
  SlideLayoutKind,
  SlideListMarker,
  SlideTheme,
} from '$lib/types';

const layouts: readonly SlideLayoutKind[] = ['title', 'content', 'columns', 'grid', 'blank'];
const aligns: readonly SlideAlign[] = ['left', 'center', 'right'];
const calloutTones: readonly SlideCalloutTone[] = ['tip', 'warn', 'note'];
const imageDataUrl = /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]*={0,2}$/;
const safeFontFamily = /^[A-Za-z0-9][A-Za-z0-9 _,.-]{0,199}$/;
const maxMappingElements = 100;
const maxMappingPairs = 500;
const listMarkers: readonly SlideListMarker[] = ['bullet', 'decimal', 'alpha', 'roman', 'none'];
const numberLineMarkKinds = ['open', 'closed', 'arrow-left', 'arrow-right'] as const;
const maxMarkerLevels = 4;
const maxDiagramNodes = 100;
const maxDiagramEdges = 500;
const maxNumberLineMarks = 200;
const maxNumberLineTicks = 1_000;

function newId(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `slide-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => cloneValue(item)) as T;
  if (value !== null && typeof value === 'object') {
    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) copy[key] = cloneValue(item);
    return copy as T;
  }
  return value;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function finiteNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function optionalNumber(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : undefined;
}

function tupleRange(value: unknown, fallback: [number, number]): [number, number] {
  if (!Array.isArray(value) || value.length < 2) return [...fallback];
  const low = value[0];
  const high = value[1];
  if (
    typeof low !== 'number' ||
    typeof high !== 'number' ||
    !Number.isFinite(low) ||
    !Number.isFinite(high) ||
    low >= high
  ) {
    return [...fallback];
  }
  const clampedLow = Math.min(1_000_000, Math.max(-1_000_000, low));
  const clampedHigh = Math.min(1_000_000, Math.max(-1_000_000, high));
  return clampedLow < clampedHigh ? [clampedLow, clampedHigh] : [...fallback];
}

function optionalAlign(value: unknown): SlideAlign | undefined {
  return aligns.includes(value as SlideAlign) ? (value as SlideAlign) : undefined;
}

function optionalColor(value: unknown): string | undefined {
  return isSafeHexColor(value) ? value : undefined;
}

function listMarker(value: unknown, fallback: SlideListMarker): SlideListMarker {
  return listMarkers.includes(value as SlideListMarker) ? (value as SlideListMarker) : fallback;
}

function uniqueId(value: unknown, usedIds: Set<string>): string {
  const supplied = typeof value === 'string' && value.length > 0 ? value : null;
  const base = supplied !== null && !usedIds.has(supplied) ? supplied : newId();
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);
  return id;
}

function withBase(
  block: Record<string, unknown>,
  usedIds: Set<string>,
): { id: string; marginTop?: number } {
  const id = uniqueId(block.id, usedIds);
  const marginTop = optionalNumber(block.marginTop, 0, 2_000);
  return marginTop === undefined ? { id } : { id, marginTop };
}

function sanitizeGraphFunction(value: unknown, usedIds: Set<string>): GraphFunction | null {
  const input = objectValue(value);
  if (!input) return null;
  const id = uniqueId(input.id, usedIds);
  const color = optionalColor(input.color) ?? '#2563eb';
  const kind = input.kind === 'implicit' ? 'implicit' : 'explicit';
  const dash =
    input.dash === 'dashed' || input.dash === 'dotted' || input.dash === 'solid'
      ? input.dash
      : 'solid';
  const domain =
    input.domain === null
      ? null
      : Array.isArray(input.domain)
        ? tupleRange(input.domain, [-10, 10])
        : null;
  return {
    id,
    expr: stringValue(input.expr),
    kind,
    color,
    width: finiteNumber(input.width, 2, 0.1, 20),
    dash,
    domain,
  };
}

function sanitizeGraph(value: unknown): SlideGraphSpec {
  const input = objectValue(value) ?? {};
  const functionIds = new Set<string>();
  const functions = Array.isArray(input.functions)
    ? input.functions
        .map((fn) => sanitizeGraphFunction(fn, functionIds))
        .filter((fn): fn is GraphFunction => fn !== null)
    : [];
  return {
    xRange: tupleRange(input.xRange, [-10, 10]),
    yRange: tupleRange(input.yRange, [-10, 10]),
    gridStep: finiteNumber(input.gridStep, 1, 0, 1_000),
    showAxes: typeof input.showAxes === 'boolean' ? input.showAxes : true,
    showGrid: typeof input.showGrid === 'boolean' ? input.showGrid : true,
    functions,
  };
}

function sanitizeCallout(input: Record<string, unknown>, usedIds: Set<string>): SlideCalloutBlock {
  const tone = calloutTones.includes(input.tone as SlideCalloutTone)
    ? (input.tone as SlideCalloutTone)
    : 'note';
  const fontSize = optionalNumber(input.fontSize, 6, 240);
  return {
    ...withBase(input, usedIds),
    kind: 'callout',
    text: stringValue(input.text),
    tone,
    ...(fontSize === undefined ? {} : { fontSize }),
  };
}

function sanitizeDiagramNode(value: unknown, usedIds: Set<string>): SlideDiagramNode | null {
  const input = objectValue(value);
  if (!input) return null;
  const suppliedId = typeof input.id === 'string' ? input.id.trim() : '';
  const id = uniqueId(suppliedId || undefined, usedIds);
  const w = optionalNumber(input.w, 0.01, 1);
  const h = optionalNumber(input.h, 0.01, 1);
  const shape = input.shape === 'plain' || input.shape === 'box' ? input.shape : undefined;
  return {
    id,
    text: stringValue(input.text),
    x: finiteNumber(input.x, 0.5, 0, 1),
    y: finiteNumber(input.y, 0.5, 0, 1),
    ...(w === undefined ? {} : { w }),
    ...(h === undefined ? {} : { h }),
    ...(shape === undefined ? {} : { shape }),
  };
}

function sanitizeDiagramEdges(value: unknown, nodeIds: Set<string>): SlideDiagramEdge[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, maxDiagramEdges)
    .map(objectValue)
    .filter((edge): edge is Record<string, unknown> => edge !== null)
    .filter(
      (edge) =>
        typeof edge.from === 'string' &&
        typeof edge.to === 'string' &&
        edge.from !== edge.to &&
        nodeIds.has(edge.from) &&
        nodeIds.has(edge.to),
    )
    .map((edge) => ({
      from: edge.from as string,
      to: edge.to as string,
      ...(typeof edge.label === 'string' ? { label: edge.label } : {}),
    }));
}

function sanitizeNumberLineMarks(value: unknown, min: number, max: number): NumberLineMark[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, maxNumberLineMarks)
    .map(objectValue)
    .filter((mark): mark is Record<string, unknown> => mark !== null)
    .filter(
      (mark) =>
        typeof mark.value === 'number' &&
        Number.isFinite(mark.value) &&
        numberLineMarkKinds.includes(mark.kind as (typeof numberLineMarkKinds)[number]),
    )
    .map((mark) => ({
      value: Math.min(max, Math.max(min, mark.value as number)),
      kind: mark.kind as NumberLineMark['kind'],
    }));
}

function sanitizeBlock(value: unknown, usedIds: Set<string>, asideOnly = false): SlideBlock | null {
  const input = objectValue(value);
  if (!input || typeof input.kind !== 'string') return null;
  if (asideOnly && input.kind !== 'callout') return null;
  const fontSize = optionalNumber(input.fontSize, 6, 240);
  const align = optionalAlign(input.align);
  const color = optionalColor(input.color);

  switch (input.kind) {
    case 'text':
      return {
        ...withBase(input, usedIds),
        kind: 'text',
        text: stringValue(input.text),
        ...(align === undefined ? {} : { align }),
        ...(fontSize === undefined ? {} : { fontSize }),
        ...(typeof input.bold === 'boolean' ? { bold: input.bold } : {}),
        ...(typeof input.italic === 'boolean' ? { italic: input.italic } : {}),
        ...(color === undefined ? {} : { color }),
      };
    case 'list': {
      const marker = listMarker(input.marker, 'bullet');
      const markerByLevel = Array.isArray(input.markerByLevel)
        ? input.markerByLevel.slice(0, maxMarkerLevels).map((value) => listMarker(value, marker))
        : undefined;
      return {
        ...withBase(input, usedIds),
        kind: 'list',
        items: Array.isArray(input.items)
          ? input.items
              .map(objectValue)
              .filter((item): item is Record<string, unknown> => item !== null)
              .map((item) => ({
                text: stringValue(item.text),
                level: Math.round(finiteNumber(item.level, 0, 0, 3)),
              }))
          : [],
        marker,
        ...(markerByLevel === undefined ? {} : { markerByLevel }),
        ...(fontSize === undefined ? {} : { fontSize }),
      };
    }
    case 'definitions':
      return {
        ...withBase(input, usedIds),
        kind: 'definitions',
        items: Array.isArray(input.items)
          ? input.items
              .map(objectValue)
              .filter((item): item is Record<string, unknown> => item !== null)
              .map((item) => ({
                term: stringValue(item.term),
                text: stringValue(item.text),
              }))
          : [],
        ...(fontSize === undefined ? {} : { fontSize }),
      };
    case 'table': {
      const header = Array.isArray(input.header)
        ? input.header.map((cell) => stringValue(cell))
        : [];
      const rows = Array.isArray(input.rows)
        ? input.rows.filter(Array.isArray).map((row) => row.map((cell) => stringValue(cell)))
        : [];
      const columnCount = Math.max(header.length, ...rows.map((row) => row.length), 0);
      const pad = (row: string[]) => [
        ...row,
        ...Array.from({ length: columnCount - row.length }, () => ''),
      ];
      const weights =
        Array.isArray(input.columnWeights) && input.columnWeights.length === columnCount
          ? input.columnWeights.map((weight) => finiteNumber(weight, 1, 0.01, 100))
          : undefined;
      return {
        ...withBase(input, usedIds),
        kind: 'table',
        ...(typeof input.caption === 'string' ? { caption: input.caption } : {}),
        header: pad(header),
        rows: rows.map(pad),
        headerOrientation: input.headerOrientation === 'column' ? 'column' : 'row',
        ...(fontSize === undefined ? {} : { fontSize }),
        ...(weights === undefined ? {} : { columnWeights: weights }),
      };
    }
    case 'math':
      return {
        ...withBase(input, usedIds),
        kind: 'math',
        latex: stringValue(input.latex),
        display: typeof input.display === 'boolean' ? input.display : true,
        ...(align === undefined ? {} : { align }),
        ...(fontSize === undefined ? {} : { fontSize }),
        ...(color === undefined ? {} : { color }),
      };
    case 'graph':
      return {
        ...withBase(input, usedIds),
        kind: 'graph',
        graph: sanitizeGraph(input.graph),
        height: finiteNumber(input.height, 240, 1, 2_000),
        ...(typeof input.caption === 'string' ? { caption: input.caption } : {}),
      };
    case 'callout':
      return sanitizeCallout(input, usedIds);
    case 'image':
      if (typeof input.src !== 'string' || !imageDataUrl.test(input.src)) return null;
      return {
        ...withBase(input, usedIds),
        kind: 'image',
        src: input.src,
        alt: stringValue(input.alt),
        height: finiteNumber(input.height, 240, 1, 2_000),
        ...(align === undefined ? {} : { align }),
      };
    case 'mapping': {
      const left = Array.isArray(input.left)
        ? input.left.slice(0, maxMappingElements).map((item) => stringValue(item))
        : [];
      const right = Array.isArray(input.right)
        ? input.right.slice(0, maxMappingElements).map((item) => stringValue(item))
        : [];
      const pairs = Array.isArray(input.pairs)
        ? input.pairs
            .slice(0, maxMappingPairs)
            .map(objectValue)
            .filter((pair): pair is Record<string, unknown> => pair !== null)
            .filter(
              (pair) =>
                Number.isInteger(pair.from) &&
                Number.isInteger(pair.to) &&
                (pair.from as number) >= 0 &&
                (pair.from as number) < left.length &&
                (pair.to as number) >= 0 &&
                (pair.to as number) < right.length,
            )
            .map((pair) => ({ from: pair.from as number, to: pair.to as number }))
        : [];
      return {
        ...withBase(input, usedIds),
        kind: 'mapping',
        leftLabel: stringValue(input.leftLabel, 'Domain'),
        rightLabel: stringValue(input.rightLabel, 'Range'),
        left,
        right,
        pairs,
        height: finiteNumber(input.height, 260, 1, 2_000),
        ...(typeof input.caption === 'string' ? { caption: input.caption } : {}),
      };
    }
    case 'diagram': {
      const nodeIds = new Set<string>();
      const nodes = Array.isArray(input.nodes)
        ? input.nodes
            .slice(0, maxDiagramNodes)
            .map((node) => sanitizeDiagramNode(node, nodeIds))
            .filter((node): node is SlideDiagramNode => node !== null)
        : [];
      return {
        ...withBase(input, usedIds),
        kind: 'diagram',
        nodes,
        edges: sanitizeDiagramEdges(input.edges, new Set(nodes.map((node) => node.id))),
        height: finiteNumber(input.height, 260, 1, 2_000),
        ...(typeof input.caption === 'string' ? { caption: input.caption } : {}),
      };
    }
    case 'numberline': {
      let min = finiteNumber(input.min, -10, -1_000_000, 1_000_000);
      let max = finiteNumber(input.max, 10, -1_000_000, 1_000_000);
      if (min >= max) {
        min = -10;
        max = 10;
      }
      const range = max - min;
      const minimumStep = range / maxNumberLineTicks;
      const tickCandidate =
        typeof input.tickStep === 'number' && Number.isFinite(input.tickStep)
          ? input.tickStep
          : Math.min(1, range);
      const labelCandidate =
        typeof input.labelStep === 'number' && Number.isFinite(input.labelStep)
          ? input.labelStep
          : Math.min(5, range);
      const tickStep = Math.min(range, Math.max(minimumStep, tickCandidate));
      const labelStep = Math.min(range, Math.max(minimumStep, labelCandidate));
      return {
        ...withBase(input, usedIds),
        kind: 'numberline',
        min,
        max,
        tickStep,
        labelStep,
        marks: sanitizeNumberLineMarks(input.marks, min, max),
        height: finiteNumber(input.height, 160, 1, 2_000),
        ...(typeof input.caption === 'string' ? { caption: input.caption } : {}),
      };
    }
    case 'spacer':
      return {
        ...withBase(input, usedIds),
        kind: 'spacer',
        height: finiteNumber(input.height, 120, 1, 2_000),
      };
    default:
      return null;
  }
}

function sanitizeTheme(value: unknown): Partial<SlideTheme> | undefined {
  const input = objectValue(value);
  if (!input) return undefined;
  const theme: Partial<SlideTheme> = {};
  if (typeof input.fontFamily === 'string' && safeFontFamily.test(input.fontFamily)) {
    theme.fontFamily = input.fontFamily;
  }
  for (const key of ['background', 'titleColor', 'textColor', 'accent'] as const) {
    const color = optionalColor(input[key]);
    if (color !== undefined) theme[key] = color;
  }
  for (const key of ['titleSize', 'headingSize', 'bodySize'] as const) {
    const size = optionalNumber(input[key], 6, 240);
    if (size !== undefined) theme[key] = size;
  }
  return Object.keys(theme).length === 0 ? undefined : theme;
}

export function createSlide(layout: SlideLayoutKind, title = ''): Slide {
  return { layout, title, blocks: [] };
}

export function createBlock<K extends SlideBlock['kind']>(
  kind: K,
): Extract<SlideBlock, { kind: K }>;
export function createBlock(kind: SlideBlock['kind']): SlideBlock {
  const id = newId();
  switch (kind) {
    case 'text':
      return { id, kind, text: 'Text', align: 'left' };
    case 'list':
      return { id, kind, marker: 'bullet', items: [{ text: 'List item', level: 0 }] };
    case 'definitions':
      return { id, kind, items: [{ term: 'Term', text: 'Add a description' }] };
    case 'table':
      return { id, kind, header: ['Heading'], rows: [['Value']], headerOrientation: 'row' };
    case 'math':
      return { id, kind, latex: 'x = 0', display: true, align: 'center' };
    case 'graph':
      return {
        id,
        kind,
        height: 240,
        graph: {
          xRange: [-10, 10],
          yRange: [-10, 10],
          gridStep: 1,
          showAxes: true,
          showGrid: true,
          functions: [
            {
              id: newId(),
              expr: 'x',
              kind: 'explicit',
              color: '#2563eb',
              width: 2,
              dash: 'solid',
              domain: null,
            },
          ],
        },
      };
    case 'callout':
      return { id, kind, text: 'Add a note', tone: 'note' };
    case 'image':
      return { id, kind, src: 'data:image/png;base64,', alt: '', height: 240 };
    case 'mapping':
      return {
        id,
        kind,
        leftLabel: 'Domain',
        rightLabel: 'Range',
        left: ['Input 1', 'Input 2'],
        right: ['Output 1', 'Output 2'],
        pairs: [
          { from: 0, to: 0 },
          { from: 1, to: 1 },
        ],
        height: 260,
      };
    case 'diagram': {
      const first = newId();
      const second = newId();
      return {
        id,
        kind,
        nodes: [
          { id: first, text: 'Input', x: 0.2, y: 0.5, shape: 'plain' },
          { id: second, text: 'Operation', x: 0.7, y: 0.5, shape: 'box' },
        ],
        edges: [{ from: first, to: second }],
        height: 260,
      };
    }
    case 'numberline':
      return {
        id,
        kind,
        min: -10,
        max: 10,
        tickStep: 1,
        labelStep: 5,
        marks: [],
        height: 160,
      };
    case 'spacer':
      return { id, kind, height: 120 };
  }
}

export function addBlock(slide: Slide, block: SlideBlock, index = slide.blocks.length): Slide {
  const next = cloneValue(slide);
  const insertionIndex = Math.min(next.blocks.length, Math.max(0, Math.trunc(index)));
  next.blocks.splice(insertionIndex, 0, cloneValue(block));
  return next;
}

export function updateBlock(slide: Slide, blockId: string, patch: Partial<SlideBlock>): Slide {
  const next = cloneValue(slide);
  next.blocks = next.blocks.map((block) =>
    block.id === blockId ? ({ ...block, ...cloneValue(patch), id: block.id } as SlideBlock) : block,
  );
  return next;
}

export function removeBlock(slide: Slide, blockId: string): Slide {
  const next = cloneValue(slide);
  next.blocks = next.blocks.filter((block) => block.id !== blockId);
  return next;
}

export function moveBlock(slide: Slide, from: number, to: number): Slide {
  const next = cloneValue(slide);
  if (!Number.isInteger(from) || from < 0 || from >= next.blocks.length) return next;
  const destination = Math.min(next.blocks.length - 1, Math.max(0, Math.trunc(to)));
  if (destination === from) return next;
  const [block] = next.blocks.splice(from, 1);
  next.blocks.splice(destination, 0, block);
  return next;
}

export function setLayout(slide: Slide, layout: SlideLayoutKind): Slide {
  return { ...cloneValue(slide), layout };
}

/** Convert untrusted sidecar data into a bounded, render-safe slide. */
export function sanitizeSlide(input: unknown): Slide | null {
  try {
    const source = objectValue(input);
    if (!source) return null;
    const layout = layouts.includes(source.layout as SlideLayoutKind)
      ? (source.layout as SlideLayoutKind)
      : 'content';
    const usedIds = new Set<string>();
    const blocks = Array.isArray(source.blocks)
      ? source.blocks
          .map((block) => sanitizeBlock(block, usedIds))
          .filter((block): block is SlideBlock => block !== null)
      : [];
    const aside = Array.isArray(source.aside)
      ? source.aside
          .map((block) => sanitizeBlock(block, usedIds, true))
          .filter((block): block is SlideCalloutBlock => block?.kind === 'callout')
      : undefined;
    const subtitle = optionalString(source.subtitle);
    const columnCount = optionalNumber(source.columnCount, 1, 6);
    const theme = sanitizeTheme(source.theme);
    return {
      layout,
      title: stringValue(source.title),
      blocks,
      ...(subtitle === undefined ? {} : { subtitle }),
      ...(aside === undefined ? {} : { aside }),
      ...(columnCount === undefined ? {} : { columnCount: Math.round(columnCount) }),
      ...(theme === undefined ? {} : { theme }),
    };
  } catch {
    return null;
  }
}
