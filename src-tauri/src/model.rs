//! Serialization-compatible mirrors of `src/lib/types.ts`.
//!
//! Coordinates and dimensions are PDF points with a top-left origin.

#![allow(clippy::struct_field_names)]

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfMeta {
    pub path: String,
    pub hash: String,
    pub page_count: u32,
    pub pages: Vec<PageDims>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageDims {
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EldrawDocument {
    pub version: u32,
    pub pdf_hash: String,
    pub pdf_path: Option<String>,
    pub pages: Vec<Page>,
    pub palettes: Vec<serde_json::Value>,
    pub prefs: serde_json::Value,
    pub slide_theme: Option<SlideTheme>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Page {
    pub page_index: usize,
    #[serde(rename = "type")]
    pub kind: PageKind,
    pub inserted_after_pdf_page: Option<usize>,
    pub pdf_source_index: Option<usize>,
    pub width: f64,
    pub height: f64,
    pub background: Option<String>,
    pub slide: Option<Slide>,
    pub objects: Vec<DrawableObject>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PageKind {
    Pdf,
    Blank,
    Slide,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum DrawableObject {
    #[serde(rename = "stroke")]
    Stroke(StrokeObject),
    #[serde(rename = "line")]
    Line(LineObject),
    #[serde(rename = "shape")]
    Shape(ShapeObject),
    #[serde(rename = "numberline")]
    NumberLine(NumberLineObject),
    #[serde(rename = "graph")]
    Graph(GraphObject),
    #[serde(rename = "text")]
    Text(TextObject),
    #[serde(rename = "angleMark")]
    AngleMark(AngleMarkObject),
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObjectBase {
    pub id: String,
    pub created_at: f64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrokeObject {
    #[serde(flatten)]
    pub base: ObjectBase,
    pub tool: StrokeTool,
    pub style: StrokeStyle,
    pub points: Vec<Point>,
    pub streamline: Option<f64>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StrokeTool {
    Pen,
    Highlighter,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LineObject {
    #[serde(flatten)]
    pub base: ObjectBase,
    pub style: StrokeStyle,
    pub from: Coordinate,
    pub to: Coordinate,
    pub arrow: ArrowEnds,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShapeObject {
    #[serde(flatten)]
    pub base: ObjectBase,
    pub kind: ShapeKind,
    pub style: StrokeStyle,
    pub fill: Option<String>,
    pub bounds: Bounds,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ShapeKind {
    Rect,
    Ellipse,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NumberLineObject {
    #[serde(flatten)]
    pub base: ObjectBase,
    pub style: StrokeStyle,
    pub from: Coordinate,
    pub length: f64,
    pub min: f64,
    pub max: f64,
    pub tick_step: f64,
    pub label_step: f64,
    pub marks: Vec<NumberLineMark>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NumberLineMark {
    pub value: f64,
    pub kind: NumberLineMarkKind,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum NumberLineMarkKind {
    Open,
    Closed,
    ArrowLeft,
    ArrowRight,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphObject {
    #[serde(flatten)]
    pub base: ObjectBase,
    pub bounds: Bounds,
    pub x_range: [f64; 2],
    pub y_range: [f64; 2],
    pub grid_step: f64,
    pub show_axes: bool,
    pub show_grid: bool,
    pub functions: Vec<GraphFunction>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphFunction {
    pub id: String,
    pub expr: String,
    pub kind: GraphFunctionKind,
    pub color: String,
    pub width: f64,
    pub dash: DashStyle,
    pub domain: Option<[f64; 2]>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GraphFunctionKind {
    Explicit,
    Implicit,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextObject {
    #[serde(flatten)]
    pub base: ObjectBase,
    pub at: Coordinate,
    pub content: String,
    pub latex: bool,
    pub math_mode: Option<TextMathMode>,
    pub font_size: f64,
    pub color: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TextMathMode {
    Plain,
    Latex,
    Mixed,
    Auto,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AngleMarkObject {
    #[serde(flatten)]
    pub base: ObjectBase,
    pub vertex: Coordinate,
    pub ray_a: Coordinate,
    pub ray_b: Coordinate,
    pub degrees: f64,
    pub color: String,
    pub width: f64,
    pub show_label: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StrokeStyle {
    pub color: String,
    pub width: f64,
    pub dash: DashStyle,
    pub opacity: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DashStyle {
    Solid,
    Dashed,
    Dotted,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Point {
    pub x: f64,
    pub y: f64,
    pub pressure: f64,
    pub t: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Coordinate {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bounds {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArrowEnds {
    pub start: bool,
    pub end: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Slide {
    pub layout: SlideLayoutKind,
    pub title: String,
    pub subtitle: Option<String>,
    pub blocks: Vec<SlideBlock>,
    pub aside: Option<Vec<SlideCalloutBlock>>,
    pub column_count: Option<usize>,
    pub theme: Option<PartialSlideTheme>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SlideLayoutKind {
    Title,
    Content,
    Columns,
    Grid,
    Blank,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlideTheme {
    pub font_family: String,
    pub background: String,
    pub title_color: String,
    pub text_color: String,
    pub accent: String,
    pub title_size: f64,
    pub heading_size: f64,
    pub body_size: f64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PartialSlideTheme {
    pub font_family: Option<String>,
    pub background: Option<String>,
    pub title_color: Option<String>,
    pub text_color: Option<String>,
    pub accent: Option<String>,
    pub title_size: Option<f64>,
    pub heading_size: Option<f64>,
    pub body_size: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum SlideBlock {
    Text(SlideTextBlock),
    List(SlideListBlock),
    Definitions(SlideDefinitionsBlock),
    Table(SlideTableBlock),
    Math(SlideMathBlock),
    Graph(SlideGraphBlock),
    Callout(SlideCalloutBlock),
    Image(SlideImageBlock),
    Spacer(SlideSpacerBlock),
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlideTextBlock {
    #[serde(flatten)]
    pub base: SlideBlockBase,
    pub text: String,
    pub align: Option<SlideAlign>,
    pub font_size: Option<f64>,
    pub bold: Option<bool>,
    pub italic: Option<bool>,
    pub color: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlideListBlock {
    #[serde(flatten)]
    pub base: SlideBlockBase,
    pub items: Vec<SlideListItem>,
    pub marker: SlideListMarker,
    pub font_size: Option<f64>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SlideListMarker {
    Bullet,
    Decimal,
    None,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlideListItem {
    pub text: String,
    pub level: usize,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlideDefinitionsBlock {
    #[serde(flatten)]
    pub base: SlideBlockBase,
    pub items: Vec<SlideDefinition>,
    pub font_size: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlideDefinition {
    pub term: String,
    pub text: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlideTableBlock {
    #[serde(flatten)]
    pub base: SlideBlockBase,
    pub caption: Option<String>,
    pub header: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub font_size: Option<f64>,
    pub column_weights: Option<Vec<f64>>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlideMathBlock {
    #[serde(flatten)]
    pub base: SlideBlockBase,
    pub latex: String,
    pub display: bool,
    pub align: Option<SlideAlign>,
    pub font_size: Option<f64>,
    pub color: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlideGraphBlock {
    #[serde(flatten)]
    pub base: SlideBlockBase,
    pub graph: SlideGraphSpec,
    pub height: f64,
    pub caption: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlideGraphSpec {
    pub x_range: [f64; 2],
    pub y_range: [f64; 2],
    pub grid_step: f64,
    pub show_axes: bool,
    pub show_grid: bool,
    pub functions: Vec<GraphFunction>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlideCalloutBlock {
    #[serde(flatten)]
    pub base: SlideBlockBase,
    pub text: String,
    pub tone: SlideCalloutTone,
    pub font_size: Option<f64>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SlideCalloutTone {
    Tip,
    Warn,
    Note,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlideImageBlock {
    #[serde(flatten)]
    pub base: SlideBlockBase,
    pub src: String,
    pub alt: String,
    pub height: f64,
    pub align: Option<SlideAlign>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlideSpacerBlock {
    #[serde(flatten)]
    pub base: SlideBlockBase,
    pub height: f64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlideBlockBase {
    pub id: String,
    pub margin_top: Option<f64>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SlideAlign {
    Left,
    Center,
    Right,
}
