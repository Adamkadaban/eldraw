/**
 * Core data model for eldraw.
 *
 * All coordinates are in PDF user-space points (72 pt = 1 inch) unless noted.
 * Using PDF-space keeps annotations resolution-independent and export-friendly.
 */

export type ObjectId = string;

export type DashStyle = 'solid' | 'dashed' | 'dotted';

export type ToolKind =
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'line'
  | 'rect'
  | 'ellipse'
  | 'numberline'
  | 'graph'
  | 'text'
  | 'select'
  | 'pan'
  | 'laser'
  | 'temp-ink'
  | 'protractor'
  | 'ruler';

export type ShapeKind = 'rect' | 'ellipse';

export type NumberLineMarkKind = 'open' | 'closed' | 'arrow-left' | 'arrow-right';

export interface NumberLineMark {
  value: number;
  kind: NumberLineMarkKind;
}

export interface Point {
  x: number;
  y: number;
  /** Pressure in [0, 1]. 0.5 when unknown. */
  pressure: number;
  /** Milliseconds since stroke start. */
  t: number;
}

export interface StrokeStyle {
  color: string;
  width: number;
  dash: DashStyle;
  opacity: number;
}

export interface ToolPreset {
  id: string;
  tool: ToolKind;
  style: StrokeStyle;
}

interface ObjectBase {
  id: ObjectId;
  createdAt: number;
}

export interface StrokeObject extends ObjectBase {
  type: 'stroke';
  tool: 'pen' | 'highlighter';
  style: StrokeStyle;
  points: Point[];
  /**
   * perfect-freehand `streamline` in [0, 1) baked when the stroke is committed.
   * Legacy strokes predate per-stroke smoothing and render as if 0.
   */
  streamline?: number;
}

export interface LineObject extends ObjectBase {
  type: 'line';
  style: StrokeStyle;
  from: { x: number; y: number };
  to: { x: number; y: number };
  arrow: { start: boolean; end: boolean };
}

export interface ShapeObject extends ObjectBase {
  type: 'shape';
  kind: ShapeKind;
  style: StrokeStyle;
  fill: string | null;
  bounds: { x: number; y: number; w: number; h: number };
}

export interface NumberLineObject extends ObjectBase {
  type: 'numberline';
  style: StrokeStyle;
  from: { x: number; y: number };
  length: number;
  min: number;
  max: number;
  tickStep: number;
  labelStep: number;
  marks: NumberLineMark[];
}

export type GraphFunctionKind = 'explicit' | 'implicit';

export interface GraphFunction {
  id: string;
  expr: string;
  kind: GraphFunctionKind;
  color: string;
  width: number;
  dash: DashStyle;
  domain: [number, number] | null;
}

export interface GraphObject extends ObjectBase {
  type: 'graph';
  bounds: { x: number; y: number; w: number; h: number };
  xRange: [number, number];
  yRange: [number, number];
  /** Grid spacing in graph units. `0` means auto (derived from range). */
  gridStep: number;
  showAxes: boolean;
  showGrid: boolean;
  functions: GraphFunction[];
}

/**
 * How a text object's content is interpreted.
 *
 * - `plain`  — no math rendering at all.
 * - `latex`  — the entire content is one LaTeX expression.
 * - `mixed`  — only explicitly delimited runs (`$…$`, `\(…\)`, `\[…\]`) are math.
 * - `auto`   — explicit delimiters plus heuristically detected bare math.
 */
export type TextMathMode = 'plain' | 'latex' | 'mixed' | 'auto';

export interface TextObject extends ObjectBase {
  type: 'text';
  at: { x: number; y: number };
  content: string;
  /**
   * Legacy whole-string LaTeX flag. Kept for sidecar back-compat; `mathMode`
   * is authoritative when present. Readers should use `textMathMode()`.
   */
  latex: boolean;
  mathMode?: TextMathMode;
  fontSize: number;
  color: string;
}

/** Resolve the effective math mode, honoring the legacy `latex` flag. */
export function textMathMode(obj: Pick<TextObject, 'latex' | 'mathMode'>): TextMathMode {
  return obj.mathMode ?? (obj.latex ? 'latex' : 'plain');
}

export interface AngleMarkObject extends ObjectBase {
  type: 'angleMark';
  vertex: { x: number; y: number };
  /** Endpoint of the first ray (not the vertex). Defines the arc's start. */
  rayA: { x: number; y: number };
  /** Endpoint of the second ray. Sweep goes CCW in math convention from rayA. */
  rayB: { x: number; y: number };
  /** Signed sweep in degrees from rayA to rayB. Positive = screen-clockwise. */
  degrees: number;
  color: string;
  width: number;
  showLabel: boolean;
}

export type AnyObject =
  | StrokeObject
  | LineObject
  | ShapeObject
  | NumberLineObject
  | GraphObject
  | TextObject
  | AngleMarkObject;

export type PageKind = 'pdf' | 'blank' | 'slide';

/** Horizontal alignment for slide text blocks. */
export type SlideAlign = 'left' | 'center' | 'right';

export type SlideCalloutTone = 'tip' | 'warn' | 'note';

export interface SlideListItem {
  text: string;
  /** Indent depth; 0 is top level. Clamped to 0..3 at render time. */
  level: number;
}

export interface SlideDefinition {
  term: string;
  text: string;
}

/**
 * Plot spec embedded in a slide. Mirrors the drawable subset of
 * `GraphObject` so slides can carry graphs without owning an annotation id.
 */
export interface SlideGraphSpec {
  xRange: [number, number];
  yRange: [number, number];
  gridStep: number;
  showAxes: boolean;
  showGrid: boolean;
  functions: GraphFunction[];
}

interface SlideBlockBase {
  id: string;
  /** Vertical gap in points inserted before this block. Defaults per kind. */
  marginTop?: number;
}

export interface SlideTextBlock extends SlideBlockBase {
  kind: 'text';
  text: string;
  align?: SlideAlign;
  /** Point size override; falls back to the theme's body size. */
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
}

export interface SlideListBlock extends SlideBlockBase {
  kind: 'list';
  items: SlideListItem[];
  /** `decimal` numbers top-level items; `none` renders a bare stack. */
  marker: 'bullet' | 'decimal' | 'none';
  fontSize?: number;
}

export interface SlideDefinitionsBlock extends SlideBlockBase {
  kind: 'definitions';
  items: SlideDefinition[];
  fontSize?: number;
}

export interface SlideTableBlock extends SlideBlockBase {
  kind: 'table';
  caption?: string;
  /** Empty array renders a table with no header row. */
  header: string[];
  rows: string[][];
  fontSize?: number;
  /** Relative column widths. Equal widths when omitted or length-mismatched. */
  columnWeights?: number[];
}

export interface SlideMathBlock extends SlideBlockBase {
  kind: 'math';
  latex: string;
  display: boolean;
  align?: SlideAlign;
  fontSize?: number;
  color?: string;
}

export interface SlideGraphBlock extends SlideBlockBase {
  kind: 'graph';
  graph: SlideGraphSpec;
  /** Drawn height in points; width fills the containing column. */
  height: number;
  /** Optional caption rendered above the plot. */
  caption?: string;
}

export interface SlideCalloutBlock extends SlideBlockBase {
  kind: 'callout';
  text: string;
  tone: SlideCalloutTone;
  fontSize?: number;
}

export interface SlideImageBlock extends SlideBlockBase {
  kind: 'image';
  /** `data:` URL. Slides stay self-contained so sidecars remain portable. */
  src: string;
  alt: string;
  height: number;
  align?: SlideAlign;
}

/** Reserved vertical whitespace — the room a teacher writes into live. */
export interface SlideSpacerBlock extends SlideBlockBase {
  kind: 'spacer';
  height: number;
}

/**
 * A relation drawn as two labelled ovals joined by arrows — the standard
 * way domain/range mappings are introduced in algebra.
 */
export interface SlideMappingPair {
  /** Index into `left`. */
  from: number;
  /** Index into `right`. */
  to: number;
}

export interface SlideMappingBlock extends SlideBlockBase {
  kind: 'mapping';
  leftLabel: string;
  rightLabel: string;
  left: string[];
  right: string[];
  pairs: SlideMappingPair[];
  height: number;
  caption?: string;
}

export type SlideBlock =
  | SlideTextBlock
  | SlideListBlock
  | SlideDefinitionsBlock
  | SlideTableBlock
  | SlideMathBlock
  | SlideGraphBlock
  | SlideCalloutBlock
  | SlideImageBlock
  | SlideMappingBlock
  | SlideSpacerBlock;

/**
 * How a slide's blocks are arranged inside the content area.
 *
 * - `title`   — hero title/subtitle centered; blocks stack underneath.
 * - `content` — single column beneath the heading.
 * - `columns` — blocks distributed across `columnCount` equal columns.
 * - `grid`    — blocks placed in a `gridColumns`-wide grid of equal cells,
 *               each cell padded with writing room (practice-problem sheets).
 * - `blank`   — no heading chrome; blocks stack from the top margin.
 */
export type SlideLayoutKind = 'title' | 'content' | 'columns' | 'grid' | 'blank';

export interface SlideTheme {
  fontFamily: string;
  /** Slide background, strict `#rrggbb`. Untrusted input is rejected on load. */
  background: string;
  titleColor: string;
  textColor: string;
  accent: string;
  /** Point sizes. */
  titleSize: number;
  headingSize: number;
  bodySize: number;
}

export interface Slide {
  layout: SlideLayoutKind;
  /** Heading text; rendered as the hero title on `title` layouts. */
  title: string;
  subtitle?: string;
  blocks: SlideBlock[];
  /** Corner callouts, rendered top-right outside the main flow. */
  aside?: SlideCalloutBlock[];
  /** Used by `columns` (default 2) and `grid` (default 2). */
  columnCount?: number;
  /** Per-slide overrides merged over the document theme. */
  theme?: Partial<SlideTheme>;
}

export interface Page {
  pageIndex: number;
  type: PageKind;
  /** For inserted blank pages: the PDF page they follow. Null for pure PDF pages. */
  insertedAfterPdfPage: number | null;
  /**
   * For pdf pages: the stable pdfium page index this slot renders. Remains
   * correct after reorder/duplicate/delete. Omitted on blank pages. Optional
   * for back-compat with older sidecars; derived from position on load when
   * missing.
   */
  pdfSourceIndex?: number;
  /** Page dimensions in PDF points. */
  width: number;
  height: number;
  /**
   * Fill color for blank pages, sampled from the preceding PDF page when
   * available. Optional for back-compat and for pdf pages (which ignore it).
   *
   * Invariant: strictly `#rrggbb` (6-digit hex). Any other value is rejected
   * at the load/insert boundary (see `isSafeHexColor`). This is a trust
   * boundary — sidecars are untrusted input and this field is interpolated
   * into CSS at render time.
   */
  background?: string;
  /** Present only when `type === 'slide'`. */
  slide?: Slide;
  objects: AnyObject[];
}

export interface ColorPalette {
  id: string;
  name: string;
  colors: string[];
}

export interface ToolDefaults {
  pen: StrokeStyle;
  highlighter: StrokeStyle;
  line: StrokeStyle;
}

export interface Preferences {
  sidebarPinned: boolean;
  defaultTool: ToolKind;
  toolDefaults: ToolDefaults;
}

export interface EldrawDocument {
  version: 1;
  pdfHash: string;
  pdfPath: string | null;
  pages: Page[];
  palettes: ColorPalette[];
  prefs: Preferences;
  /** Deck-wide slide theme. Absent on documents with no slides. */
  slideTheme?: SlideTheme;
}

/**
 * IPC command surface exposed by the Rust backend. Frontend and backend must
 * agree on these names and shapes.
 */
export interface IpcCommands {
  open_pdf: (args: { path: string }) => Promise<PdfMeta>;
  render_page: (args: { pageIndex: number; scale: number; pdfId?: string }) => Promise<ArrayBuffer>;
  load_sidecar: (args: { pdfPath: string }) => Promise<EldrawDocument | null>;
  save_sidecar: (args: { pdfPath: string; doc: EldrawDocument }) => Promise<void>;
  acquire_lock: (args: { pdfPath: string }) => Promise<boolean>;
  release_lock: (args: { pdfPath: string }) => Promise<void>;
  export_flattened_pdf: (args: {
    pdfPath: string;
    doc: EldrawDocument;
    outPath: string;
  }) => Promise<void>;
}

export interface PdfMeta {
  path: string;
  hash: string;
  pageCount: number;
  /** Per-page dimensions in PDF points. */
  pages: { width: number; height: number }[];
}
