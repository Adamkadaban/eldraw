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

interface ObjectBase {
  id: ObjectId;
  createdAt: number;
}

export interface StrokeObject extends ObjectBase {
  type: 'stroke';
  tool: 'pen' | 'highlighter';
  style: StrokeStyle;
  points: Point[];
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
  gridStep: number;
  showAxes: boolean;
  showGrid: boolean;
  functions: GraphFunction[];
}

export interface TextObject extends ObjectBase {
  type: 'text';
  at: { x: number; y: number };
  content: string;
  latex: boolean;
  fontSize: number;
  color: string;
}

export type AnyObject =
  | StrokeObject
  | LineObject
  | ShapeObject
  | NumberLineObject
  | GraphObject
  | TextObject;

export type PageKind = 'pdf' | 'blank';

export interface Page {
  pageIndex: number;
  type: PageKind;
  /** For inserted blank pages: the PDF page they follow. Null for pure PDF pages. */
  insertedAfterPdfPage: number | null;
  /** Page dimensions in PDF points. */
  width: number;
  height: number;
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
}

/**
 * IPC command surface exposed by the Rust backend. Frontend and backend must
 * agree on these names and shapes.
 */
export interface IpcCommands {
  open_pdf: (args: { path: string }) => Promise<PdfMeta>;
  render_page: (args: { pageIndex: number; scale: number }) => Promise<Uint8Array>;
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
