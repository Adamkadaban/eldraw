//! Flattened PDF export.
//!
//! Source PDF pages are rasterized with pdfium at 144 DPI, annotations are
//! composited into that bitmap, and each bitmap is embedded as a JPEG page in
//! a new PDF. This deliberately trades selectable source text for predictable
//! output across all annotation kinds. Slide text uses a portable bitmap font;
//! LaTeX is emitted as source text and data-URL slide images use an explicit
//! placeholder rather than being silently omitted.

#![allow(
    clippy::cast_possible_truncation,
    clippy::cast_precision_loss,
    clippy::cast_sign_loss,
    clippy::many_single_char_names,
    clippy::similar_names,
    clippy::too_many_arguments,
    clippy::too_many_lines
)]

use std::fs::{self, File, OpenOptions};
use std::io::{ErrorKind, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use font8x8::UnicodeFonts;
use image::codecs::jpeg::JpegEncoder;
use image::{ExtendedColorType, RgbImage, Rgba, RgbaImage};
use lopdf::{dictionary, Dictionary, Document, Object, Stream};
use pdfium_render::prelude::{PdfDocument, PdfRenderConfig, Pdfium};
use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::model::{
    AngleMarkObject, Bounds, DashStyle, DrawableObject, EldrawDocument, GraphFunction,
    GraphFunctionKind, GraphObject, LineObject, NumberLineMarkKind, NumberLineObject, Page,
    PageKind, PartialSlideTheme, ShapeKind, ShapeObject, Slide, SlideAlign, SlideBlock,
    SlideCalloutTone, SlideDiagramNodeShape, SlideLayoutKind, SlideListMarker,
    SlideNumberLineBlock, SlideTheme, StrokeObject, StrokeStyle, StrokeTool, TextObject,
};
use crate::state::pdfium;

const EXPORT_SCALE: f64 = 2.0;
const MAX_PAGE_COUNT: usize = 500;
const MAX_PIXEL_DIMENSION: u32 = 8192;
const MAX_PIXEL_AREA: u64 = 32 * 1024 * 1024;
const MAX_OBJECTS_PER_PAGE: usize = 100_000;
const MAX_POINTS_PER_STROKE: usize = 1_000_000;
const MAX_SOURCE_BYTES: u64 = 512 * 1024 * 1024;
const MAX_GRAPH_SAMPLES: usize = 2048;
const JPEG_QUALITY: u8 = 92;

static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PageSource {
    Pdf(usize),
    Blank,
    Slide,
}

#[derive(Debug, Clone, Copy)]
struct PixelSize {
    width: u32,
    height: u32,
}

#[derive(Debug, Clone, Copy)]
struct Color {
    r: u8,
    g: u8,
    b: u8,
    a: u8,
}

impl Color {
    const WHITE: Self = Self {
        r: 255,
        g: 255,
        b: 255,
        a: 255,
    };

    const BLACK: Self = Self {
        r: 0,
        g: 0,
        b: 0,
        a: 255,
    };

    fn with_opacity(self, opacity: f64) -> Self {
        Self {
            a: (f64::from(self.a) * opacity.clamp(0.0, 1.0)).round() as u8,
            ..self
        }
    }
}

struct Canvas {
    image: RgbaImage,
    scale: f64,
}

impl Canvas {
    fn new(size: PixelSize, background: Color) -> Self {
        Self {
            image: RgbaImage::from_pixel(
                size.width,
                size.height,
                Rgba([background.r, background.g, background.b, 255]),
            ),
            scale: EXPORT_SCALE,
        }
    }

    fn from_image(image: RgbaImage) -> Self {
        Self {
            image,
            scale: EXPORT_SCALE,
        }
    }

    fn width(&self) -> u32 {
        self.image.width()
    }

    fn height(&self) -> u32 {
        self.image.height()
    }

    fn pt(&self, value: f64) -> f64 {
        value * self.scale
    }

    fn blend(&mut self, x: i32, y: i32, color: Color, multiply: bool) {
        let (Ok(x), Ok(y)) = (u32::try_from(x), u32::try_from(y)) else {
            return;
        };
        if x >= self.width() || y >= self.height() || color.a == 0 {
            return;
        }
        let dst = self.image.get_pixel_mut(x, y);
        let alpha = f64::from(color.a) / 255.0;
        let [dst_r, dst_g, dst_b, dst_a] = &mut dst.0;
        for (dst_channel, src) in [dst_r, dst_g, dst_b]
            .into_iter()
            .zip([color.r, color.g, color.b])
        {
            let base = f64::from(*dst_channel);
            let painted = if multiply {
                base * f64::from(src) / 255.0
            } else {
                f64::from(src)
            };
            *dst_channel = (base * (1.0 - alpha) + painted * alpha).round() as u8;
        }
        *dst_a = 255;
    }

    fn circle(&mut self, cx: f64, cy: f64, radius: f64, color: Color, multiply: bool) {
        if !cx.is_finite() || !cy.is_finite() || !radius.is_finite() || radius <= 0.0 {
            return;
        }
        let min_x = (cx - radius).floor().max(0.0) as i32;
        let max_x = (cx + radius).ceil().min(f64::from(self.width())) as i32;
        let min_y = (cy - radius).floor().max(0.0) as i32;
        let max_y = (cy + radius).ceil().min(f64::from(self.height())) as i32;
        let radius_sq = radius * radius;
        for y in min_y..max_y {
            for x in min_x..max_x {
                let dx = f64::from(x) + 0.5 - cx;
                let dy = f64::from(y) + 0.5 - cy;
                if dx.mul_add(dx, dy * dy) <= radius_sq {
                    self.blend(x, y, color, multiply);
                }
            }
        }
    }

    fn segment(
        &mut self,
        from: (f64, f64),
        to: (f64, f64),
        width: f64,
        color: Color,
        multiply: bool,
        dash: DashStyle,
    ) {
        let dx = to.0 - from.0;
        let dy = to.1 - from.1;
        let distance = dx.hypot(dy);
        if !distance.is_finite() || width <= 0.0 {
            return;
        }
        let steps = distance.ceil().max(1.0) as usize;
        let dash_length = (width * 3.0).max(1.0);
        for i in 0..=steps {
            let t = i as f64 / steps as f64;
            let along = distance * t;
            let paint = match dash {
                DashStyle::Solid => true,
                DashStyle::Dashed => (along / dash_length).floor() as i64 % 2 == 0,
                DashStyle::Dotted => {
                    let period = (width * 2.5).max(1.0);
                    along % period <= width
                }
            };
            if paint {
                self.circle(
                    from.0 + dx * t,
                    from.1 + dy * t,
                    width / 2.0,
                    color,
                    multiply,
                );
            }
        }
    }

    fn polygon(&mut self, points: &[(f64, f64)], color: Color, multiply: bool) {
        if points.len() < 3 {
            return;
        }
        let min_y = points
            .iter()
            .map(|p| p.1)
            .fold(f64::INFINITY, f64::min)
            .floor()
            .max(0.0) as i32;
        let max_y = points
            .iter()
            .map(|p| p.1)
            .fold(f64::NEG_INFINITY, f64::max)
            .ceil()
            .min(f64::from(self.height())) as i32;
        for y in min_y..max_y {
            let scan_y = f64::from(y) + 0.5;
            let mut intersections = Vec::with_capacity(points.len());
            for (a, b) in points
                .iter()
                .zip(points.iter().cycle().skip(1))
                .take(points.len())
            {
                if (a.1 > scan_y) != (b.1 > scan_y) {
                    intersections.push(a.0 + (scan_y - a.1) * (b.0 - a.0) / (b.1 - a.1));
                }
            }
            intersections.sort_by(f64::total_cmp);
            for pair in intersections.chunks_exact(2) {
                let [start, end] = pair else {
                    continue;
                };
                let start = start.floor().max(0.0) as i32;
                let end = end.ceil().min(f64::from(self.width())) as i32;
                for x in start..end {
                    self.blend(x, y, color, multiply);
                }
            }
        }
    }

    fn arrowhead(&mut self, tip: (f64, f64), from: (f64, f64), size: f64, color: Color) {
        let angle = (tip.1 - from.1).atan2(tip.0 - from.0);
        let wing = std::f64::consts::PI / 6.0;
        self.polygon(
            &[
                tip,
                (
                    tip.0 - size * (angle - wing).cos(),
                    tip.1 - size * (angle - wing).sin(),
                ),
                (
                    tip.0 - size * (angle + wing).cos(),
                    tip.1 - size * (angle + wing).sin(),
                ),
            ],
            color,
            false,
        );
    }

    fn text(&mut self, text: &str, x: f64, y: f64, size_pt: f64, color: Color) {
        let pixel_height = self.pt(size_pt).max(8.0);
        let glyph_scale = (pixel_height / 8.0).round().max(1.0) as i32;
        let mut cursor_x = x.round() as i32;
        let mut cursor_y = y.round() as i32;
        let origin_x = cursor_x;
        for ch in text.chars() {
            if ch == '\n' {
                cursor_x = origin_x;
                cursor_y += glyph_scale * 10;
                continue;
            }
            let glyph = font8x8::BASIC_FONTS
                .get(ch)
                .or_else(|| font8x8::BASIC_FONTS.get('?'));
            if let Some(rows) = glyph {
                for (row, bits) in rows.iter().enumerate() {
                    for col in 0..8 {
                        if bits & (1 << col) != 0 {
                            for sy in 0..glyph_scale {
                                for sx in 0..glyph_scale {
                                    self.blend(
                                        cursor_x + col * glyph_scale + sx,
                                        cursor_y
                                            + i32::try_from(row).unwrap_or(0) * glyph_scale
                                            + sy,
                                        color,
                                        false,
                                    );
                                }
                            }
                        }
                    }
                }
            }
            cursor_x += glyph_scale * 9;
        }
    }
}

#[tauri::command]
pub async fn export_flattened_pdf(
    app: AppHandle,
    pdf_path: String,
    doc: EldrawDocument,
    out_path: String,
) -> AppResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        export_impl(&app, Path::new(&pdf_path), &doc, Path::new(&out_path))
    })
    .await
    .map_err(|error| AppError::Export(format!("export worker failed: {error}")))?
}

fn export_impl(
    app: &AppHandle,
    pdf_path: &Path,
    doc: &EldrawDocument,
    out_path: &Path,
) -> AppResult<()> {
    let output = validate_output_path(pdf_path, out_path)?;
    let sources = select_page_sources(&doc.pages)?;
    validate_document(doc)?;

    let has_pdf_pages = sources
        .iter()
        .any(|source| matches!(source, PageSource::Pdf(_)));
    let source_bytes = if has_pdf_pages {
        Some(read_source_pdf(pdf_path)?)
    } else {
        None
    };
    if let Some(bytes) = source_bytes.as_deref() {
        let actual_hash = crate::pdf::hash_bytes(bytes);
        if !doc.pdf_hash.is_empty() && doc.pdf_hash != actual_hash {
            return Err(AppError::InvalidInput(format!(
                "sidecar PDF hash {} does not match source PDF hash {actual_hash}",
                doc.pdf_hash
            )));
        }
    }
    let source_page_count = source_bytes
        .as_deref()
        .map(inspect_source_pdf)
        .transpose()?
        .unwrap_or(0);
    validate_page_selection(&doc.pages, &sources, source_page_count)?;

    let pdfium = source_bytes.as_ref().map(|_| pdfium(app)).transpose()?;
    let loaded_pdf = match (pdfium, source_bytes.as_deref()) {
        (Some(engine), Some(bytes)) => Some(load_pdfium_document(engine, bytes)?),
        _ => None,
    };

    let mut rendered = Vec::with_capacity(doc.pages.len());
    for (page, source) in doc.pages.iter().zip(&sources) {
        rendered.push(render_page(
            page,
            *source,
            loaded_pdf.as_ref(),
            doc.slide_theme.as_ref(),
        )?);
    }
    let bytes = encode_pdf(&doc.pages, &rendered)?;
    atomic_write(&output, |file| {
        file.write_all(&bytes)?;
        file.sync_all()
    })
}

fn read_source_pdf(path: &Path) -> AppResult<Vec<u8>> {
    let metadata = fs::metadata(path).map_err(|error| {
        AppError::Export(format!(
            "cannot read source PDF {}: {error}",
            path.display()
        ))
    })?;
    if !metadata.is_file() {
        return Err(AppError::Export(format!(
            "source PDF is not a file: {}",
            path.display()
        )));
    }
    if metadata.len() > MAX_SOURCE_BYTES {
        return Err(AppError::ResourceLimit(format!(
            "source PDF is {} bytes; limit is {MAX_SOURCE_BYTES}",
            metadata.len()
        )));
    }
    fs::read(path).map_err(|error| {
        AppError::Export(format!(
            "cannot read source PDF {}: {error}",
            path.display()
        ))
    })
}

fn inspect_source_pdf(bytes: &[u8]) -> AppResult<usize> {
    let document = Document::load_mem(bytes)
        .map_err(|error| AppError::Pdf(format!("source PDF is corrupt or unsupported: {error}")))?;
    if document.is_encrypted() {
        return Err(AppError::Pdf(
            "source PDF is encrypted or password-protected".into(),
        ));
    }
    let count = document.get_pages().len();
    if count == 0 {
        return Err(AppError::Pdf("source PDF has no pages".into()));
    }
    Ok(count)
}

fn load_pdfium_document<'a>(engine: &'a Pdfium, bytes: &'a [u8]) -> AppResult<PdfDocument<'a>> {
    engine
        .load_pdf_from_byte_slice(bytes, None)
        .map_err(|error| AppError::Pdf(format!("cannot render source PDF: {error}")))
}

fn select_page_sources(pages: &[Page]) -> AppResult<Vec<PageSource>> {
    let legacy_pdf_count = pages
        .iter()
        .filter(|page| page.kind == PageKind::Pdf && page.pdf_source_index.is_none())
        .count();
    let has_explicit = pages
        .iter()
        .any(|page| page.kind == PageKind::Pdf && page.pdf_source_index.is_some());
    if legacy_pdf_count > 0 && has_explicit {
        return Err(AppError::InvalidInput(
            "sidecar mixes explicit and legacy PDF page references".into(),
        ));
    }

    let mut next_legacy = 0usize;
    let mut sources = Vec::with_capacity(pages.len());
    for page in pages {
        let source = match page.kind {
            PageKind::Pdf => {
                let index = page.pdf_source_index.unwrap_or_else(|| {
                    let index = next_legacy;
                    next_legacy = next_legacy.saturating_add(1);
                    index
                });
                PageSource::Pdf(index)
            }
            PageKind::Blank => PageSource::Blank,
            PageKind::Slide => PageSource::Slide,
        };
        sources.push(source);
    }
    Ok(sources)
}

fn validate_page_selection(
    pages: &[Page],
    sources: &[PageSource],
    source_page_count: usize,
) -> AppResult<()> {
    let legacy_count = pages
        .iter()
        .filter(|page| page.kind == PageKind::Pdf && page.pdf_source_index.is_none())
        .count();
    if legacy_count > 0 && legacy_count != source_page_count {
        return Err(AppError::InvalidInput(format!(
            "legacy sidecar has {legacy_count} PDF pages but source PDF has {source_page_count}"
        )));
    }
    for (array_index, source) in sources.iter().enumerate() {
        if let PageSource::Pdf(source_index) = source {
            if *source_index >= source_page_count {
                return Err(AppError::InvalidInput(format!(
                    "page {array_index} references pdfSourceIndex {source_index}, but source PDF has {source_page_count} pages"
                )));
            }
        }
    }
    Ok(())
}

fn validate_document(doc: &EldrawDocument) -> AppResult<()> {
    if doc.pages.is_empty() {
        return Err(AppError::InvalidInput(
            "cannot export an empty document".into(),
        ));
    }
    if doc.pages.len() > MAX_PAGE_COUNT {
        return Err(AppError::ResourceLimit(format!(
            "document has {} pages; limit is {MAX_PAGE_COUNT}",
            doc.pages.len()
        )));
    }
    for (index, page) in doc.pages.iter().enumerate() {
        if page.page_index != index {
            return Err(AppError::InvalidInput(format!(
                "pageIndex {} disagrees with document position {index}",
                page.page_index
            )));
        }
        pixel_size(page.width, page.height)?;
        if page.objects.len() > MAX_OBJECTS_PER_PAGE {
            return Err(AppError::ResourceLimit(format!(
                "page {index} has {} objects; limit is {MAX_OBJECTS_PER_PAGE}",
                page.objects.len()
            )));
        }
        if page.kind == PageKind::Slide && page.slide.is_none() {
            return Err(AppError::InvalidInput(format!(
                "slide page {index} has no slide content"
            )));
        }
        for object in &page.objects {
            validate_object(object, index)?;
        }
    }
    Ok(())
}

fn validate_object(object: &DrawableObject, page_index: usize) -> AppResult<()> {
    let values: &[f64] = match object {
        DrawableObject::Stroke(stroke) => {
            if stroke.points.len() > MAX_POINTS_PER_STROKE {
                return Err(AppError::ResourceLimit(format!(
                    "stroke {} on page {page_index} has {} points; limit is {MAX_POINTS_PER_STROKE}",
                    stroke.base.id,
                    stroke.points.len()
                )));
            }
            for point in &stroke.points {
                finite_values(&[point.x, point.y, point.pressure, point.t], "stroke point")?;
            }
            &[stroke.style.width, stroke.style.opacity]
        }
        DrawableObject::Line(line) => &[
            line.from.x,
            line.from.y,
            line.to.x,
            line.to.y,
            line.style.width,
            line.style.opacity,
        ],
        DrawableObject::Shape(shape) => &[
            shape.bounds.x,
            shape.bounds.y,
            shape.bounds.w,
            shape.bounds.h,
            shape.style.width,
            shape.style.opacity,
        ],
        DrawableObject::NumberLine(line) => &[
            line.from.x,
            line.from.y,
            line.length,
            line.min,
            line.max,
            line.tick_step,
            line.label_step,
            line.style.width,
            line.style.opacity,
        ],
        DrawableObject::Graph(graph) => &[
            graph.bounds.x,
            graph.bounds.y,
            graph.bounds.w,
            graph.bounds.h,
            graph.x_range[0],
            graph.x_range[1],
            graph.y_range[0],
            graph.y_range[1],
            graph.grid_step,
        ],
        DrawableObject::Text(text) => &[text.at.x, text.at.y, text.font_size],
        DrawableObject::AngleMark(mark) => &[
            mark.vertex.x,
            mark.vertex.y,
            mark.ray_a.x,
            mark.ray_a.y,
            mark.ray_b.x,
            mark.ray_b.y,
            mark.degrees,
            mark.width,
        ],
    };
    finite_values(values, "annotation")
}

fn finite_values(values: &[f64], label: &str) -> AppResult<()> {
    if values.iter().all(|value| value.is_finite()) {
        Ok(())
    } else {
        Err(AppError::InvalidInput(format!(
            "{label} contains a non-finite number"
        )))
    }
}

fn pixel_size(width_pt: f64, height_pt: f64) -> AppResult<PixelSize> {
    if !width_pt.is_finite() || !height_pt.is_finite() || width_pt <= 0.0 || height_pt <= 0.0 {
        return Err(AppError::InvalidInput(format!(
            "invalid page dimensions {width_pt}x{height_pt} points"
        )));
    }
    let width = (width_pt * EXPORT_SCALE).round();
    let height = (height_pt * EXPORT_SCALE).round();
    if width > f64::from(MAX_PIXEL_DIMENSION) || height > f64::from(MAX_PIXEL_DIMENSION) {
        return Err(AppError::ResourceLimit(format!(
            "page bitmap {width:.0}x{height:.0} exceeds {MAX_PIXEL_DIMENSION}-pixel dimension cap"
        )));
    }
    let width = width.max(1.0) as u32;
    let height = height.max(1.0) as u32;
    let area = u64::from(width)
        .checked_mul(u64::from(height))
        .ok_or_else(|| AppError::ResourceLimit("page pixel area overflow".into()))?;
    if area > MAX_PIXEL_AREA {
        return Err(AppError::ResourceLimit(format!(
            "page bitmap {width}x{height} exceeds {MAX_PIXEL_AREA}-pixel area cap"
        )));
    }
    let byte_count = area
        .checked_mul(4)
        .ok_or_else(|| AppError::ResourceLimit("page byte count overflow".into()))?;
    usize::try_from(byte_count)
        .map_err(|_| AppError::ResourceLimit("page byte count exceeds platform limit".into()))?;
    Ok(PixelSize { width, height })
}

fn render_page(
    page: &Page,
    source: PageSource,
    pdf: Option<&PdfDocument<'_>>,
    document_theme: Option<&SlideTheme>,
) -> AppResult<RgbaImage> {
    let size = pixel_size(page.width, page.height)?;
    let mut canvas = match source {
        PageSource::Pdf(index) => {
            let pdf = pdf.ok_or_else(|| AppError::Pdf("source PDF was not loaded".into()))?;
            Canvas::from_image(render_source_page(
                pdf,
                index,
                size,
                page.width,
                page.height,
            )?)
        }
        PageSource::Blank => Canvas::new(size, page_background(page)?),
        PageSource::Slide => {
            let slide = page.slide.as_ref().ok_or_else(|| {
                AppError::InvalidInput(format!(
                    "slide page {} has no slide content",
                    page.page_index
                ))
            })?;
            let theme = merged_slide_theme(document_theme, slide.theme.as_ref())?;
            let mut canvas = Canvas::new(size, parse_color(&theme.background)?);
            render_slide(&mut canvas, slide, &theme)?;
            canvas
        }
    };

    for object in &page.objects {
        draw_object(&mut canvas, object)?;
    }
    Ok(canvas.image)
}

fn render_source_page(
    document: &PdfDocument<'_>,
    index: usize,
    size: PixelSize,
    expected_width: f64,
    expected_height: f64,
) -> AppResult<RgbaImage> {
    let index = i32::try_from(index)
        .map_err(|_| AppError::InvalidInput(format!("pdfSourceIndex {index} is too large")))?;
    let page = document
        .pages()
        .get(index)
        .map_err(|_| AppError::InvalidInput(format!("pdfSourceIndex {index} is out of range")))?;
    let source_width = f64::from(page.width().value);
    let source_height = f64::from(page.height().value);
    if (source_width - expected_width).abs() > 1.0 || (source_height - expected_height).abs() > 1.0
    {
        return Err(AppError::InvalidInput(format!(
            "page dimensions {expected_width}x{expected_height} disagree with source page {index} dimensions {source_width}x{source_height}"
        )));
    }
    let config = PdfRenderConfig::new()
        .set_target_width(i32::try_from(size.width).map_err(|_| {
            AppError::ResourceLimit("page width exceeds pdfium integer limit".into())
        })?)
        .set_target_height(i32::try_from(size.height).map_err(|_| {
            AppError::ResourceLimit("page height exceeds pdfium integer limit".into())
        })?);
    let bitmap = page
        .render_with_config(&config)
        .map_err(|error| AppError::Pdf(format!("render page {index}: {error}")))?;
    let image = bitmap
        .as_image()
        .map_err(|error| AppError::Pdf(format!("read rendered page {index}: {error}")))?;
    Ok(image.into_rgba8())
}

fn page_background(page: &Page) -> AppResult<Color> {
    page.background
        .as_deref()
        .map(parse_color)
        .transpose()
        .map(Option::unwrap_or_default)
}

impl Default for Color {
    fn default() -> Self {
        Self::WHITE
    }
}

fn draw_object(canvas: &mut Canvas, object: &DrawableObject) -> AppResult<()> {
    match object {
        DrawableObject::Stroke(stroke) => draw_stroke(canvas, stroke),
        DrawableObject::Line(line) => draw_line(canvas, line),
        DrawableObject::Shape(shape) => draw_shape(canvas, shape),
        DrawableObject::NumberLine(line) => draw_number_line(canvas, line),
        DrawableObject::Graph(graph) => draw_graph(canvas, graph),
        DrawableObject::Text(text) => draw_text(canvas, text),
        DrawableObject::AngleMark(mark) => draw_angle_mark(canvas, mark),
    }
}

fn style_color(style: &StrokeStyle) -> AppResult<Color> {
    Ok(parse_color(&style.color)?.with_opacity(style.opacity))
}

fn draw_stroke(canvas: &mut Canvas, stroke: &StrokeObject) -> AppResult<()> {
    if stroke.points.is_empty() {
        return Ok(());
    }
    let color = style_color(&stroke.style)?;
    let multiply = matches!(stroke.tool, StrokeTool::Highlighter);
    let base_width = canvas.pt(stroke.style.width).max(0.5);
    if stroke.points.len() == 1 {
        let Some(point) = stroke.points.first().copied() else {
            return Ok(());
        };
        let radius = base_width * pressure_factor(point.pressure) / 2.0;
        canvas.circle(
            canvas.pt(point.x),
            canvas.pt(point.y),
            radius,
            color,
            multiply,
        );
        return Ok(());
    }
    for points in stroke.points.windows(2) {
        let [from, to] = points else {
            continue;
        };
        let (from, to) = (*from, *to);
        let start_width = base_width * pressure_factor(from.pressure);
        let end_width = base_width * pressure_factor(to.pressure);
        let dx = canvas.pt(to.x - from.x);
        let dy = canvas.pt(to.y - from.y);
        let distance = dx.hypot(dy);
        let steps = distance.ceil().max(1.0) as usize;
        for i in 0..=steps {
            let t = i as f64 / steps as f64;
            let along = distance * t;
            let width = start_width + (end_width - start_width) * t;
            let paint = match stroke.style.dash {
                DashStyle::Solid => true,
                DashStyle::Dashed => (along / (base_width * 3.0).max(1.0)).floor() as i64 % 2 == 0,
                DashStyle::Dotted => along % (base_width * 2.5).max(1.0) <= base_width,
            };
            if paint {
                canvas.circle(
                    canvas.pt(from.x) + dx * t,
                    canvas.pt(from.y) + dy * t,
                    width / 2.0,
                    color,
                    multiply,
                );
            }
        }
    }
    Ok(())
}

fn pressure_factor(pressure: f64) -> f64 {
    0.4 + pressure.clamp(0.0, 1.0) * 0.6
}

fn draw_line(canvas: &mut Canvas, line: &LineObject) -> AppResult<()> {
    let color = style_color(&line.style)?;
    let width = canvas.pt(line.style.width).max(0.5);
    let from = (canvas.pt(line.from.x), canvas.pt(line.from.y));
    let to = (canvas.pt(line.to.x), canvas.pt(line.to.y));
    canvas.segment(from, to, width, color, false, line.style.dash);
    let head = (width * 4.0).max(6.0);
    if line.arrow.end {
        canvas.arrowhead(to, from, head, color);
    }
    if line.arrow.start {
        canvas.arrowhead(from, to, head, color);
    }
    Ok(())
}

fn draw_shape(canvas: &mut Canvas, shape: &ShapeObject) -> AppResult<()> {
    let stroke = style_color(&shape.style)?;
    let fill = shape
        .fill
        .as_deref()
        .map(parse_color)
        .transpose()?
        .map(|color| color.with_opacity(shape.style.opacity));
    let x = canvas.pt(shape.bounds.x);
    let y = canvas.pt(shape.bounds.y);
    let w = canvas.pt(shape.bounds.w);
    let h = canvas.pt(shape.bounds.h);
    let width = canvas.pt(shape.style.width).max(0.5);
    match shape.kind {
        ShapeKind::Rect => {
            let x0 = x.min(x + w);
            let x1 = x.max(x + w);
            let y0 = y.min(y + h);
            let y1 = y.max(y + h);
            if let Some(fill) = fill {
                canvas.polygon(&[(x0, y0), (x1, y0), (x1, y1), (x0, y1)], fill, false);
            }
            for (from, to) in [
                ((x0, y0), (x1, y0)),
                ((x1, y0), (x1, y1)),
                ((x1, y1), (x0, y1)),
                ((x0, y1), (x0, y0)),
            ] {
                canvas.segment(from, to, width, stroke, false, shape.style.dash);
            }
        }
        ShapeKind::Ellipse => {
            let cx = x + w / 2.0;
            let cy = y + h / 2.0;
            let rx = w.abs() / 2.0;
            let ry = h.abs() / 2.0;
            let steps = 180usize;
            let points: Vec<_> = (0..steps)
                .map(|i| {
                    let angle = std::f64::consts::TAU * i as f64 / steps as f64;
                    (cx + rx * angle.cos(), cy + ry * angle.sin())
                })
                .collect();
            if let Some(fill) = fill {
                canvas.polygon(&points, fill, false);
            }
            for pair in points
                .iter()
                .zip(points.iter().cycle().skip(1))
                .take(points.len())
            {
                canvas.segment(*pair.0, *pair.1, width, stroke, false, shape.style.dash);
            }
        }
    }
    Ok(())
}

fn draw_number_line(canvas: &mut Canvas, line: &NumberLineObject) -> AppResult<()> {
    if line.max <= line.min || line.length == 0.0 {
        return Ok(());
    }
    let color = style_color(&line.style)?;
    let width = canvas.pt(line.style.width).max(0.5);
    let y = canvas.pt(line.from.y);
    let x0 = canvas.pt(line.from.x);
    let x1 = canvas.pt(line.from.x + line.length);
    canvas.segment((x0, y), (x1, y), width, color, false, line.style.dash);
    let head = (width * 4.0).max(6.0);
    canvas.arrowhead((x0, y), (x1, y), head, color);
    canvas.arrowhead((x1, y), (x0, y), head, color);

    for value in values_in_range(line.min, line.max, line.tick_step) {
        let x = number_line_x(line, value, canvas.scale);
        canvas.segment(
            (x, y - width * 2.0),
            (x, y + width * 2.0),
            width,
            color,
            false,
            DashStyle::Solid,
        );
    }
    for value in values_in_range(line.min, line.max, line.label_step) {
        let x = number_line_x(line, value, canvas.scale);
        let label = format_number(value);
        let approx_width = f64::from(label.len() as u32) * canvas.pt(10.0) * 0.6;
        canvas.text(&label, x - approx_width / 2.0, y + width * 3.0, 10.0, color);
    }
    for mark in &line.marks {
        let x = number_line_x(line, mark.value, canvas.scale);
        let radius = (width * 2.2).max(4.0);
        match mark.kind {
            NumberLineMarkKind::Closed => canvas.circle(x, y, radius, color, false),
            NumberLineMarkKind::Open => {
                canvas.circle(x, y, radius, Color::WHITE, false);
                draw_circle_outline(canvas, x, y, radius, width, color);
            }
            NumberLineMarkKind::ArrowLeft => {
                canvas.segment((x, y), (x0, y), width, color, false, DashStyle::Solid);
                canvas.arrowhead((x0, y), (x, y), head, color);
            }
            NumberLineMarkKind::ArrowRight => {
                canvas.segment((x, y), (x1, y), width, color, false, DashStyle::Solid);
                canvas.arrowhead((x1, y), (x, y), head, color);
            }
        }
    }
    Ok(())
}

fn values_in_range(min: f64, max: f64, step: f64) -> Vec<f64> {
    if !step.is_finite() || step <= 0.0 || max < min {
        return Vec::new();
    }
    let first = (min / step).ceil() * step;
    let raw_count = ((max - first) / step).floor().max(0.0) as usize + 1;
    let count = raw_count.min(10_000);
    (0..count).map(|i| first + i as f64 * step).collect()
}

fn number_line_x(line: &NumberLineObject, value: f64, scale: f64) -> f64 {
    (line.from.x + (value - line.min) / (line.max - line.min) * line.length) * scale
}

fn draw_graph(canvas: &mut Canvas, graph: &GraphObject) -> AppResult<()> {
    draw_graph_spec(
        canvas,
        graph.bounds,
        graph.x_range,
        graph.y_range,
        graph.grid_step,
        graph.show_axes,
        graph.show_grid,
        &graph.functions,
    )
}

fn draw_graph_spec(
    canvas: &mut Canvas,
    bounds: Bounds,
    x_range: [f64; 2],
    y_range: [f64; 2],
    grid_step: f64,
    show_axes: bool,
    show_grid: bool,
    functions: &[GraphFunction],
) -> AppResult<()> {
    let x_span = x_range[1] - x_range[0];
    let y_span = y_range[1] - y_range[0];
    if bounds.w <= 0.0 || bounds.h <= 0.0 || x_span <= 0.0 || y_span <= 0.0 {
        return Ok(());
    }
    let rect = Bounds {
        x: canvas.pt(bounds.x),
        y: canvas.pt(bounds.y),
        w: canvas.pt(bounds.w),
        h: canvas.pt(bounds.h),
    };
    let grid = Color {
        r: 210,
        g: 210,
        b: 210,
        a: 255,
    };
    let axis = Color::BLACK;
    let x_to_px = |x: f64| rect.x + (x - x_range[0]) / x_span * rect.w;
    let y_to_px = |y: f64| rect.y + (1.0 - (y - y_range[0]) / y_span) * rect.h;
    let step = if grid_step > 0.0 {
        grid_step
    } else {
        nice_step(x_span.max(y_span) / 8.0)
    };
    if show_grid {
        for value in values_in_range(x_range[0], x_range[1], step) {
            let x = x_to_px(value);
            canvas.segment(
                (x, rect.y),
                (x, rect.y + rect.h),
                1.0,
                grid,
                false,
                DashStyle::Solid,
            );
        }
        for value in values_in_range(y_range[0], y_range[1], step) {
            let y = y_to_px(value);
            canvas.segment(
                (rect.x, y),
                (rect.x + rect.w, y),
                1.0,
                grid,
                false,
                DashStyle::Solid,
            );
        }
    }
    if show_axes {
        if x_range[0] <= 0.0 && x_range[1] >= 0.0 {
            let x = x_to_px(0.0);
            canvas.segment(
                (x, rect.y),
                (x, rect.y + rect.h),
                2.0,
                axis,
                false,
                DashStyle::Solid,
            );
        }
        if y_range[0] <= 0.0 && y_range[1] >= 0.0 {
            let y = y_to_px(0.0);
            canvas.segment(
                (rect.x, y),
                (rect.x + rect.w, y),
                2.0,
                axis,
                false,
                DashStyle::Solid,
            );
        }
    }
    for function in functions {
        draw_graph_function(canvas, function, rect, x_range, y_range)?;
    }
    Ok(())
}

fn nice_step(raw: f64) -> f64 {
    if !raw.is_finite() || raw <= 0.0 {
        return 1.0;
    }
    let power = 10_f64.powf(raw.log10().floor());
    let scaled = raw / power;
    let nice = if scaled <= 1.0 {
        1.0
    } else if scaled <= 2.0 {
        2.0
    } else if scaled <= 5.0 {
        5.0
    } else {
        10.0
    };
    nice * power
}

fn draw_graph_function(
    canvas: &mut Canvas,
    function: &GraphFunction,
    rect: Bounds,
    x_range: [f64; 2],
    y_range: [f64; 2],
) -> AppResult<()> {
    let color = parse_color(&function.color)?;
    let width = canvas.pt(function.width).max(0.5);
    let x_span = x_range[1] - x_range[0];
    let y_span = y_range[1] - y_range[0];
    let x_to_px = |x: f64| rect.x + (x - x_range[0]) / x_span * rect.w;
    let y_to_px = |y: f64| rect.y + (1.0 - (y - y_range[0]) / y_span) * rect.h;
    match function.kind {
        GraphFunctionKind::Explicit => {
            let expression: meval::Expr = function.expr.parse().map_err(|error| {
                AppError::InvalidInput(format!(
                    "cannot parse graph expression '{}': {error}",
                    function.expr
                ))
            })?;
            let evaluator = expression.bind("x").map_err(|error| {
                AppError::InvalidInput(format!(
                    "cannot bind graph expression '{}': {error}",
                    function.expr
                ))
            })?;
            let domain = function.domain.unwrap_or(x_range);
            let start = domain[0].max(x_range[0]);
            let end = domain[1].min(x_range[1]);
            if start >= end {
                return Ok(());
            }
            let samples = (rect.w.ceil() as usize).clamp(64, MAX_GRAPH_SAMPLES);
            let mut previous: Option<(f64, f64)> = None;
            for i in 0..=samples {
                let x = start + (end - start) * i as f64 / samples as f64;
                let y = evaluator(x);
                let current = if y.is_finite() && y >= y_range[0] && y <= y_range[1] {
                    Some((x_to_px(x), y_to_px(y)))
                } else {
                    None
                };
                if let (Some(from), Some(to)) = (previous, current) {
                    if (to.1 - from.1).abs() < rect.h {
                        canvas.segment(from, to, width, color, false, function.dash);
                    }
                }
                previous = current;
            }
        }
        GraphFunctionKind::Implicit => {
            let normalized = if let Some((left, right)) = function.expr.split_once('=') {
                format!("({left})-({right})")
            } else {
                function.expr.clone()
            };
            let expression: meval::Expr = normalized.parse().map_err(|error| {
                AppError::InvalidInput(format!(
                    "cannot parse implicit graph expression '{}': {error}",
                    function.expr
                ))
            })?;
            let evaluator = expression.bind2("x", "y").map_err(|error| {
                AppError::InvalidInput(format!(
                    "cannot bind implicit graph expression '{}': {error}",
                    function.expr
                ))
            })?;
            draw_implicit(
                canvas,
                &evaluator,
                rect,
                x_range,
                y_range,
                width,
                color,
                function.dash,
            );
        }
    }
    Ok(())
}

fn draw_implicit(
    canvas: &mut Canvas,
    evaluator: &impl Fn(f64, f64) -> f64,
    rect: Bounds,
    x_range: [f64; 2],
    y_range: [f64; 2],
    width: f64,
    color: Color,
    dash: DashStyle,
) {
    let cols = (rect.w / 5.0).ceil().clamp(16.0, 256.0) as usize;
    let rows = (rect.h / 5.0).ceil().clamp(16.0, 256.0) as usize;
    for row in 0..rows {
        for col in 0..cols {
            let x0 = x_range[0] + (x_range[1] - x_range[0]) * col as f64 / cols as f64;
            let x1 = x_range[0] + (x_range[1] - x_range[0]) * (col + 1) as f64 / cols as f64;
            let y0 = y_range[0] + (y_range[1] - y_range[0]) * row as f64 / rows as f64;
            let y1 = y_range[0] + (y_range[1] - y_range[0]) * (row + 1) as f64 / rows as f64;
            let values = [
                evaluator(x0, y0),
                evaluator(x1, y0),
                evaluator(x1, y1),
                evaluator(x0, y1),
            ];
            if values.iter().any(|value| !value.is_finite()) {
                continue;
            }
            let has_positive = values.iter().any(|value| *value >= 0.0);
            let has_negative = values.iter().any(|value| *value < 0.0);
            if has_positive && has_negative {
                let px0 = rect.x + rect.w * col as f64 / cols as f64;
                let px1 = rect.x + rect.w * (col + 1) as f64 / cols as f64;
                let py0 = rect.y + rect.h * (rows - row - 1) as f64 / rows as f64;
                let py1 = rect.y + rect.h * (rows - row) as f64 / rows as f64;
                canvas.segment(
                    (f64::midpoint(px0, px1), py0),
                    (f64::midpoint(px0, px1), py1),
                    width,
                    color,
                    false,
                    dash,
                );
            }
        }
    }
}

fn draw_text(canvas: &mut Canvas, text: &TextObject) -> AppResult<()> {
    let color = parse_color(&text.color)?;
    let content = match text.math_mode {
        Some(crate::model::TextMathMode::Latex) => format!("[LaTeX] {}", text.content),
        _ if text.latex => format!("[LaTeX] {}", text.content),
        _ => text.content.clone(),
    };
    canvas.text(
        &content,
        canvas.pt(text.at.x),
        canvas.pt(text.at.y),
        text.font_size,
        color,
    );
    Ok(())
}

fn draw_angle_mark(canvas: &mut Canvas, mark: &AngleMarkObject) -> AppResult<()> {
    let color = parse_color(&mark.color)?;
    let width = canvas.pt(mark.width).max(0.5);
    let vertex = (canvas.pt(mark.vertex.x), canvas.pt(mark.vertex.y));
    let ray_a = (canvas.pt(mark.ray_a.x), canvas.pt(mark.ray_a.y));
    let ray_b = (canvas.pt(mark.ray_b.x), canvas.pt(mark.ray_b.y));
    canvas.segment(vertex, ray_a, width, color, false, DashStyle::Solid);
    canvas.segment(vertex, ray_b, width, color, false, DashStyle::Solid);
    let distance_a = (ray_a.0 - vertex.0).hypot(ray_a.1 - vertex.1);
    let distance_b = (ray_b.0 - vertex.0).hypot(ray_b.1 - vertex.1);
    let radius = distance_a
        .min(distance_b)
        .mul_add(0.25, 0.0)
        .clamp(12.0, 50.0);
    let start = (ray_a.1 - vertex.1).atan2(ray_a.0 - vertex.0);
    let sweep = mark.degrees.to_radians();
    let steps = (sweep.abs() * radius / 2.0).ceil().clamp(8.0, 256.0) as usize;
    let mut previous = (
        vertex.0 + radius * start.cos(),
        vertex.1 + radius * start.sin(),
    );
    for i in 1..=steps {
        let angle = start + sweep * i as f64 / steps as f64;
        let current = (
            vertex.0 + radius * angle.cos(),
            vertex.1 + radius * angle.sin(),
        );
        canvas.segment(previous, current, width, color, false, DashStyle::Solid);
        previous = current;
    }
    if mark.show_label {
        let middle = start + sweep / 2.0;
        let label_radius = radius + canvas.pt(10.0);
        let label = format!("{} deg", format_number(mark.degrees.abs()));
        canvas.text(
            &label,
            vertex.0 + label_radius * middle.cos(),
            vertex.1 + label_radius * middle.sin(),
            10.0,
            color,
        );
    }
    Ok(())
}

fn draw_ellipse_outline(
    canvas: &mut Canvas,
    cx: f64,
    cy: f64,
    rx: f64,
    ry: f64,
    width: f64,
    color: Color,
) {
    if !(rx.is_finite() && ry.is_finite()) || rx <= 0.0 || ry <= 0.0 {
        return;
    }
    let steps = 72usize;
    let mut previous = (cx + rx, cy);
    for i in 1..=steps {
        let angle = std::f64::consts::TAU * i as f64 / steps as f64;
        let current = (cx + rx * angle.cos(), cy + ry * angle.sin());
        canvas.segment(previous, current, width, color, false, DashStyle::Solid);
        previous = current;
    }
}

/// Ticks and value labels for a slide number line.
///
/// The step values come from an untrusted sidecar, so the emitted count is
/// capped rather than trusting `(max - min) / step` to be sane.
fn draw_number_line_ticks(
    canvas: &mut Canvas,
    block: &SlideNumberLineBlock,
    to_x: &dyn Fn(f64) -> f64,
    axis_y: f64,
    color: Color,
    theme: &SlideTheme,
) -> usize {
    const MAX_TICKS: usize = 400;
    let mut drawn = 0usize;
    let tick_half = canvas.pt(3.0);

    if block.tick_step.is_finite() && block.tick_step > 0.0 {
        let mut value = (block.min / block.tick_step).ceil() * block.tick_step;
        while value <= block.max && drawn < MAX_TICKS {
            let tx = to_x(value);
            canvas.segment(
                (tx, axis_y - tick_half),
                (tx, axis_y + tick_half),
                1.0,
                color,
                false,
                DashStyle::Solid,
            );
            value += block.tick_step;
            drawn += 1;
        }
    }

    if block.label_step.is_finite() && block.label_step > 0.0 {
        let mut labelled = 0usize;
        let mut value = (block.min / block.label_step).ceil() * block.label_step;
        while value <= block.max && labelled < MAX_TICKS {
            let label = if value.fract().abs() < 1e-9 {
                format!("{}", value.round() as i64)
            } else {
                format!("{value:.2}")
            };
            canvas.text(
                &label,
                to_x(value) - canvas.pt(4.0),
                axis_y + tick_half + canvas.pt(3.0),
                theme.body_size * 0.75,
                color,
            );
            value += block.label_step;
            labelled += 1;
        }
    }

    drawn
}

fn draw_circle_outline(
    canvas: &mut Canvas,
    cx: f64,
    cy: f64,
    radius: f64,
    width: f64,
    color: Color,
) {
    let steps = 72usize;
    let mut previous = (cx + radius, cy);
    for i in 1..=steps {
        let angle = std::f64::consts::TAU * i as f64 / steps as f64;
        let current = (cx + radius * angle.cos(), cy + radius * angle.sin());
        canvas.segment(previous, current, width, color, false, DashStyle::Solid);
        previous = current;
    }
}

fn merged_slide_theme(
    document: Option<&SlideTheme>,
    page: Option<&PartialSlideTheme>,
) -> AppResult<SlideTheme> {
    let base = document.cloned().unwrap_or_else(default_slide_theme);
    let Some(page) = page else {
        validate_slide_theme(&base)?;
        return Ok(base);
    };
    let merged = SlideTheme {
        font_family: page
            .font_family
            .clone()
            .unwrap_or_else(|| base.font_family.clone()),
        background: page
            .background
            .clone()
            .unwrap_or_else(|| base.background.clone()),
        title_color: page
            .title_color
            .clone()
            .unwrap_or_else(|| base.title_color.clone()),
        text_color: page
            .text_color
            .clone()
            .unwrap_or_else(|| base.text_color.clone()),
        accent: page.accent.clone().unwrap_or_else(|| base.accent.clone()),
        title_size: page.title_size.unwrap_or(base.title_size),
        heading_size: page.heading_size.unwrap_or(base.heading_size),
        body_size: page.body_size.unwrap_or(base.body_size),
    };
    validate_slide_theme(&merged)?;
    Ok(merged)
}

fn default_slide_theme() -> SlideTheme {
    SlideTheme {
        font_family: "sans-serif".into(),
        background: "#ffffff".into(),
        title_color: "#172033".into(),
        text_color: "#172033".into(),
        accent: "#2563eb".into(),
        title_size: 34.0,
        heading_size: 24.0,
        body_size: 18.0,
    }
}

fn validate_slide_theme(theme: &SlideTheme) -> AppResult<()> {
    parse_color(&theme.background)?;
    parse_color(&theme.title_color)?;
    parse_color(&theme.text_color)?;
    parse_color(&theme.accent)?;
    finite_values(
        &[theme.title_size, theme.heading_size, theme.body_size],
        "slide theme",
    )
}

fn render_slide(canvas: &mut Canvas, slide: &Slide, theme: &SlideTheme) -> AppResult<()> {
    let margin = canvas.pt(36.0);
    let content_width = f64::from(canvas.width()) - margin * 2.0;
    let title_color = parse_color(&theme.title_color)?;
    let text_color = parse_color(&theme.text_color)?;
    let accent = parse_color(&theme.accent)?;
    let mut y = margin;
    if !matches!(slide.layout, SlideLayoutKind::Blank) {
        canvas.text(&slide.title, margin, y, theme.title_size, title_color);
        y += canvas.pt(theme.title_size + 12.0);
        if let Some(subtitle) = slide.subtitle.as_deref() {
            canvas.text(subtitle, margin, y, theme.heading_size, text_color);
            y += canvas.pt(theme.heading_size + 14.0);
        }
        canvas.segment(
            (margin, y),
            (margin + content_width, y),
            canvas.pt(1.5),
            accent,
            false,
            DashStyle::Solid,
        );
        y += canvas.pt(18.0);
    }
    for block in &slide.blocks {
        y += canvas.pt(block_margin(block));
        y = render_slide_block(canvas, block, theme, margin, y, content_width)?;
        if y > f64::from(canvas.height()) - margin {
            break;
        }
    }
    if let Some(asides) = slide.aside.as_deref() {
        let aside_width = content_width * 0.35;
        let mut aside_y = margin;
        for aside in asides {
            aside_y = render_callout(
                canvas,
                &aside.text,
                aside.tone,
                aside.font_size.unwrap_or(theme.body_size * 0.8),
                margin + content_width - aside_width,
                aside_y,
                aside_width,
                theme,
            )?;
        }
    }
    Ok(())
}

fn block_margin(block: &SlideBlock) -> f64 {
    match block {
        SlideBlock::Text(block) => block.base.margin_top,
        SlideBlock::List(block) => block.base.margin_top,
        SlideBlock::Definitions(block) => block.base.margin_top,
        SlideBlock::Table(block) => block.base.margin_top,
        SlideBlock::Math(block) => block.base.margin_top,
        SlideBlock::Graph(block) => block.base.margin_top,
        SlideBlock::Callout(block) => block.base.margin_top,
        SlideBlock::Image(block) => block.base.margin_top,
        SlideBlock::Mapping(block) => block.base.margin_top,
        SlideBlock::Diagram(block) => block.base.margin_top,
        SlideBlock::Numberline(block) => block.base.margin_top,
        SlideBlock::Spacer(block) => block.base.margin_top,
    }
    .unwrap_or(10.0)
}

fn render_slide_block(
    canvas: &mut Canvas,
    block: &SlideBlock,
    theme: &SlideTheme,
    x: f64,
    y: f64,
    width: f64,
) -> AppResult<f64> {
    let text_color = parse_color(&theme.text_color)?;
    match block {
        SlideBlock::Text(block) => {
            let size = block.font_size.unwrap_or(theme.body_size);
            let color = block
                .color
                .as_deref()
                .map(parse_color)
                .transpose()?
                .unwrap_or(text_color);
            let x = aligned_x(
                x,
                width,
                &block.text,
                size,
                block.align.unwrap_or(SlideAlign::Left),
                canvas.scale,
            );
            canvas.text(&block.text, x, y, size, color);
            Ok(y + canvas.pt(size + 8.0))
        }
        SlideBlock::List(block) => {
            let size = block.font_size.unwrap_or(theme.body_size);
            let mut next_y = y;
            let mut decimal = 1usize;
            for item in &block.items {
                let marker = match block.marker {
                    SlideListMarker::Bullet => "*".into(),
                    SlideListMarker::Decimal if item.level == 0 => {
                        let result = format!("{decimal}.");
                        decimal = decimal.saturating_add(1);
                        result
                    }
                    _ => String::new(),
                };
                let line = if marker.is_empty() {
                    item.text.clone()
                } else {
                    format!("{marker} {}", item.text)
                };
                canvas.text(
                    &line,
                    x + canvas.pt((item.level.min(3) * 18) as f64),
                    next_y,
                    size,
                    text_color,
                );
                next_y += canvas.pt(size + 6.0);
            }
            Ok(next_y)
        }
        SlideBlock::Definitions(block) => {
            let size = block.font_size.unwrap_or(theme.body_size);
            let mut next_y = y;
            for item in &block.items {
                canvas.text(
                    &format!("{}: {}", item.term, item.text),
                    x,
                    next_y,
                    size,
                    text_color,
                );
                next_y += canvas.pt(size + 6.0);
            }
            Ok(next_y)
        }
        SlideBlock::Table(block) => {
            let size = block.font_size.unwrap_or(theme.body_size * 0.75);
            let columns = block
                .header
                .len()
                .max(block.rows.iter().map(Vec::len).max().unwrap_or(0))
                .max(1);
            let cell_width = width / columns as f64;
            let row_height = canvas.pt(size + 8.0);
            let mut next_y = y;
            if let Some(caption) = block.caption.as_deref() {
                canvas.text(caption, x, next_y, size, text_color);
                next_y += row_height;
            }
            let rows = std::iter::once(&block.header).chain(block.rows.iter());
            for row in rows {
                for col in 0..columns {
                    let cell_x = x + cell_width * col as f64;
                    canvas.segment(
                        (cell_x, next_y),
                        (cell_x + cell_width, next_y),
                        1.0,
                        text_color,
                        false,
                        DashStyle::Solid,
                    );
                    if let Some(value) = row.get(col) {
                        canvas.text(value, cell_x + 4.0, next_y + 4.0, size, text_color);
                    }
                }
                next_y += row_height;
            }
            Ok(next_y)
        }
        SlideBlock::Math(block) => {
            let size = block.font_size.unwrap_or(theme.heading_size);
            let color = block
                .color
                .as_deref()
                .map(parse_color)
                .transpose()?
                .unwrap_or(text_color);
            let label = format!("[LaTeX] {}", block.latex);
            let x = aligned_x(
                x,
                width,
                &label,
                size,
                block.align.unwrap_or(SlideAlign::Left),
                canvas.scale,
            );
            canvas.text(&label, x, y, size, color);
            Ok(y + canvas.pt(size + 10.0))
        }
        SlideBlock::Graph(block) => {
            let mut next_y = y;
            if let Some(caption) = block.caption.as_deref() {
                canvas.text(caption, x, next_y, theme.body_size, text_color);
                next_y += canvas.pt(theme.body_size + 6.0);
            }
            let graph = &block.graph;
            draw_graph_spec(
                canvas,
                Bounds {
                    x: x / canvas.scale,
                    y: next_y / canvas.scale,
                    w: width / canvas.scale,
                    h: block.height,
                },
                graph.x_range,
                graph.y_range,
                graph.grid_step,
                graph.show_axes,
                graph.show_grid,
                &graph.functions,
            )?;
            Ok(next_y + canvas.pt(block.height))
        }
        SlideBlock::Callout(block) => render_callout(
            canvas,
            &block.text,
            block.tone,
            block.font_size.unwrap_or(theme.body_size),
            x,
            y,
            width,
            theme,
        ),
        SlideBlock::Image(block) => {
            let height = canvas.pt(block.height.max(12.0));
            let border = parse_color(&theme.accent)?;
            for (from, to) in [
                ((x, y), (x + width, y)),
                ((x + width, y), (x + width, y + height)),
                ((x + width, y + height), (x, y + height)),
                ((x, y + height), (x, y)),
            ] {
                canvas.segment(from, to, 2.0, border, false, DashStyle::Solid);
            }
            canvas.text(
                &format!("[image: {}]", block.alt),
                x + 8.0,
                y + 8.0,
                theme.body_size * 0.75,
                text_color,
            );
            Ok(y + height)
        }
        SlideBlock::Mapping(block) => {
            let height = canvas.pt(block.height.max(24.0));
            let accent = parse_color(&theme.accent)?;
            let label_size = theme.body_size * 0.85;
            let oval_w = width * 0.28;
            let oval_h = (height - canvas.pt(label_size * 1.6)).max(canvas.pt(12.0));
            let left_cx = x + oval_w * 0.6;
            let right_cx = x + width - oval_w * 0.6;
            let cy = y + oval_h / 2.0;

            draw_ellipse_outline(canvas, left_cx, cy, oval_w / 2.0, oval_h / 2.0, 1.5, accent);
            draw_ellipse_outline(
                canvas,
                right_cx,
                cy,
                oval_w / 2.0,
                oval_h / 2.0,
                1.5,
                text_color,
            );

            let item_y = |index: usize, count: usize| -> f64 {
                if count == 0 {
                    return cy;
                }
                cy - oval_h / 2.0 + oval_h * (index as f64 + 1.0) / (count as f64 + 1.0)
            };

            for (i, label) in block.left.iter().enumerate() {
                canvas.text(
                    label,
                    left_cx - oval_w * 0.2,
                    item_y(i, block.left.len()),
                    theme.body_size,
                    text_color,
                );
            }
            for (i, label) in block.right.iter().enumerate() {
                canvas.text(
                    label,
                    right_cx - oval_w * 0.2,
                    item_y(i, block.right.len()),
                    theme.body_size,
                    text_color,
                );
            }
            // Indices are validated on the frontend, but sidecars are untrusted.
            for pair in &block.pairs {
                if pair.from >= block.left.len() || pair.to >= block.right.len() {
                    continue;
                }
                let from = (left_cx + oval_w / 2.0, item_y(pair.from, block.left.len()));
                let to = (right_cx - oval_w / 2.0, item_y(pair.to, block.right.len()));
                canvas.segment(from, to, 1.0, text_color, false, DashStyle::Solid);
                canvas.arrowhead(to, from, canvas.pt(4.0), text_color);
            }

            canvas.text(
                &block.left_label,
                left_cx - oval_w / 2.0,
                y + oval_h + canvas.pt(4.0),
                label_size,
                text_color,
            );
            canvas.text(
                &block.right_label,
                right_cx - oval_w / 2.0,
                y + oval_h + canvas.pt(4.0),
                label_size,
                text_color,
            );
            Ok(y + height)
        }
        SlideBlock::Diagram(block) => {
            let height = canvas.pt(block.height.max(24.0));
            let accent = parse_color(&theme.accent)?;
            let clamp01 = |v: f64| {
                if v.is_finite() {
                    v.clamp(0.0, 1.0)
                } else {
                    0.0
                }
            };
            let node_box = |node: &crate::model::SlideDiagramNode| -> (f64, f64, f64, f64) {
                let nw = node.w.filter(|v| v.is_finite() && *v > 0.0).unwrap_or(0.22) * width;
                let nh = node.h.filter(|v| v.is_finite() && *v > 0.0).unwrap_or(0.22) * height;
                let cx = x + clamp01(node.x) * width;
                let cy = y + clamp01(node.y) * height;
                (cx - nw / 2.0, cy - nh / 2.0, nw, nh)
            };

            for node in &block.nodes {
                let (bx, by, bw, bh) = node_box(node);
                if !matches!(node.shape, Some(SlideDiagramNodeShape::Plain)) {
                    for (from, to) in [
                        ((bx, by), (bx + bw, by)),
                        ((bx + bw, by), (bx + bw, by + bh)),
                        ((bx + bw, by + bh), (bx, by + bh)),
                        ((bx, by + bh), (bx, by)),
                    ] {
                        canvas.segment(from, to, 1.2, accent, false, DashStyle::Solid);
                    }
                }
                canvas.text(
                    &node.text,
                    bx + canvas.pt(4.0),
                    by + bh / 2.0,
                    theme.body_size,
                    text_color,
                );
            }

            for edge in &block.edges {
                if edge.from == edge.to {
                    continue;
                }
                let Some(from) = block.nodes.iter().find(|n| n.id == edge.from) else {
                    continue;
                };
                let Some(to) = block.nodes.iter().find(|n| n.id == edge.to) else {
                    continue;
                };
                let (fx, fy, fw, fh) = node_box(from);
                let (tx, ty, _, th) = node_box(to);
                let start = (fx + fw, fy + fh / 2.0);
                let end = (tx, ty + th / 2.0);
                canvas.segment(start, end, 1.0, text_color, false, DashStyle::Solid);
                canvas.arrowhead(end, start, canvas.pt(4.0), text_color);
                if let Some(label) = &edge.label {
                    canvas.text(
                        label,
                        f64::midpoint(start.0, end.0),
                        f64::midpoint(start.1, end.1) - canvas.pt(6.0),
                        theme.body_size * 0.8,
                        text_color,
                    );
                }
            }
            Ok(y + height)
        }
        SlideBlock::Numberline(block) => {
            let height = canvas.pt(block.height.max(16.0));
            let axis_y = y + height / 2.0;
            let span = block.max - block.min;
            if !span.is_finite() || span <= 0.0 {
                return Ok(y + height);
            }
            let to_x = |value: f64| x + ((value - block.min) / span).clamp(0.0, 1.0) * width;

            canvas.segment(
                (x, axis_y),
                (x + width, axis_y),
                1.2,
                text_color,
                false,
                DashStyle::Solid,
            );
            canvas.arrowhead((x + width, axis_y), (x, axis_y), canvas.pt(5.0), text_color);
            canvas.arrowhead((x, axis_y), (x + width, axis_y), canvas.pt(5.0), text_color);

            // Cap the tick count so an untrusted step can't drive an unbounded loop.
            let ticks = draw_number_line_ticks(canvas, block, &to_x, axis_y, text_color, theme);
            let _ = ticks;
            for mark in &block.marks {
                if !mark.value.is_finite() || mark.value < block.min || mark.value > block.max {
                    continue;
                }
                let mx = to_x(mark.value);
                let radius = canvas.pt(3.5);
                match mark.kind {
                    NumberLineMarkKind::Closed => {
                        canvas.circle(mx, axis_y, radius, text_color, false);
                    }
                    NumberLineMarkKind::Open => {
                        draw_circle_outline(canvas, mx, axis_y, radius, 1.2, text_color);
                    }
                    NumberLineMarkKind::ArrowLeft => {
                        canvas.segment(
                            (mx, axis_y),
                            (x, axis_y),
                            1.6,
                            text_color,
                            false,
                            DashStyle::Solid,
                        );
                        canvas.arrowhead((x, axis_y), (mx, axis_y), canvas.pt(5.0), text_color);
                    }
                    NumberLineMarkKind::ArrowRight => {
                        canvas.segment(
                            (mx, axis_y),
                            (x + width, axis_y),
                            1.6,
                            text_color,
                            false,
                            DashStyle::Solid,
                        );
                        canvas.arrowhead(
                            (x + width, axis_y),
                            (mx, axis_y),
                            canvas.pt(5.0),
                            text_color,
                        );
                    }
                }
            }
            Ok(y + height)
        }
        SlideBlock::Spacer(block) => Ok(y + canvas.pt(block.height.max(0.0))),
    }
}

fn render_callout(
    canvas: &mut Canvas,
    text: &str,
    tone: SlideCalloutTone,
    size: f64,
    x: f64,
    y: f64,
    width: f64,
    theme: &SlideTheme,
) -> AppResult<f64> {
    let fill = match tone {
        SlideCalloutTone::Tip => parse_color("#dcfce7")?,
        SlideCalloutTone::Warn => parse_color("#fef3c7")?,
        SlideCalloutTone::Note => parse_color("#dbeafe")?,
    };
    let color = parse_color(&theme.text_color)?;
    let height = canvas.pt(size + 18.0);
    canvas.polygon(
        &[
            (x, y),
            (x + width, y),
            (x + width, y + height),
            (x, y + height),
        ],
        fill,
        false,
    );
    canvas.text(text, x + 8.0, y + 8.0, size, color);
    Ok(y + height + canvas.pt(6.0))
}

fn aligned_x(x: f64, width: f64, text: &str, size: f64, align: SlideAlign, scale: f64) -> f64 {
    let approximate = text.chars().count() as f64 * size * scale * 0.6;
    match align {
        SlideAlign::Left => x,
        SlideAlign::Center => x + (width - approximate) / 2.0,
        SlideAlign::Right => x + width - approximate,
    }
}

fn parse_color(value: &str) -> AppResult<Color> {
    let bytes = value.as_bytes();
    let &[b'#', r1, r2, g1, g2, b1, b2] = bytes else {
        return Err(AppError::InvalidInput(format!(
            "invalid color '{value}'; expected #rrggbb"
        )));
    };
    let parse = |high: u8, low: u8| -> AppResult<u8> {
        let digit = |byte: u8| match byte {
            b'0'..=b'9' => Some(byte - b'0'),
            b'a'..=b'f' => Some(byte - b'a' + 10),
            b'A'..=b'F' => Some(byte - b'A' + 10),
            _ => None,
        };
        let high = digit(high)
            .ok_or_else(|| AppError::InvalidInput(format!("invalid color '{value}'")))?;
        let low =
            digit(low).ok_or_else(|| AppError::InvalidInput(format!("invalid color '{value}'")))?;
        Ok(high * 16 + low)
    };
    Ok(Color {
        r: parse(r1, r2)?,
        g: parse(g1, g2)?,
        b: parse(b1, b2)?,
        a: 255,
    })
}

fn format_number(value: f64) -> String {
    if (value - value.round()).abs() < 1e-9 {
        format!("{value:.0}")
    } else {
        let formatted = format!("{value:.2}");
        formatted
            .trim_end_matches('0')
            .trim_end_matches('.')
            .to_owned()
    }
}

fn encode_pdf(pages: &[Page], images: &[RgbaImage]) -> AppResult<Vec<u8>> {
    if pages.len() != images.len() {
        return Err(AppError::Export(
            "internal page/image count mismatch".into(),
        ));
    }
    let mut document = Document::with_version("1.5");
    let pages_id = document.new_object_id();
    let catalog_id = document.new_object_id();
    let mut page_ids = Vec::with_capacity(pages.len());

    for (index, (page, image)) in pages.iter().zip(images).enumerate() {
        let image_id = document.new_object_id();
        let content_id = document.new_object_id();
        let page_id = document.new_object_id();
        page_ids.push(page_id);

        let rgb = rgba_to_rgb(image)?;
        let mut jpeg = Vec::new();
        JpegEncoder::new_with_quality(&mut jpeg, JPEG_QUALITY)
            .encode(
                rgb.as_raw(),
                rgb.width(),
                rgb.height(),
                ExtendedColorType::Rgb8,
            )
            .map_err(|error| AppError::Export(format!("encode page {index} image: {error}")))?;
        document.objects.insert(
            image_id,
            Object::Stream(Stream::new(
                dictionary! {
                    "Type" => "XObject",
                    "Subtype" => "Image",
                    "Width" => i64::from(rgb.width()),
                    "Height" => i64::from(rgb.height()),
                    "ColorSpace" => "DeviceRGB",
                    "BitsPerComponent" => 8,
                    "Filter" => "DCTDecode",
                },
                jpeg,
            )),
        );

        let image_name = format!("Im{index}");
        let (_, pdf_y) = top_left_rect_to_pdf(0.0, 0.0, page.height, page.height);
        let content = format!(
            "q\n{} 0 0 {} 0 {} cm\n/{} Do\nQ\n",
            page.width, page.height, pdf_y, image_name
        );
        document.objects.insert(
            content_id,
            Object::Stream(Stream::new(Dictionary::new(), content.into_bytes())),
        );
        let mut xobjects = Dictionary::new();
        xobjects.set(image_name.as_bytes(), Object::Reference(image_id));
        document.objects.insert(
            page_id,
            dictionary! {
                "Type" => "Page",
                "Parent" => pages_id,
                "MediaBox" => vec![0.into(), 0.into(), page.width.into(), page.height.into()],
                "Resources" => dictionary! {
                    "XObject" => xobjects,
                },
                "Contents" => content_id,
            }
            .into(),
        );
    }

    document.objects.insert(
        pages_id,
        dictionary! {
            "Type" => "Pages",
            "Kids" => page_ids.iter().copied().map(Object::Reference).collect::<Vec<_>>(),
            "Count" => i64::try_from(page_ids.len())
                .map_err(|_| AppError::ResourceLimit("PDF page count exceeds i64".into()))?,
        }
        .into(),
    );
    document.objects.insert(
        catalog_id,
        dictionary! {
            "Type" => "Catalog",
            "Pages" => pages_id,
        }
        .into(),
    );
    document.trailer.set("Root", catalog_id);
    document.compress();
    let mut output = Vec::new();
    document
        .save_to(&mut output)
        .map_err(|error| AppError::Export(format!("write PDF structure: {error}")))?;
    Ok(output)
}

fn rgba_to_rgb(image: &RgbaImage) -> AppResult<RgbImage> {
    let pixel_count = u64::from(image.width())
        .checked_mul(u64::from(image.height()))
        .ok_or_else(|| AppError::ResourceLimit("RGB pixel count overflow".into()))?;
    let byte_count = pixel_count
        .checked_mul(3)
        .ok_or_else(|| AppError::ResourceLimit("RGB byte count overflow".into()))?;
    let capacity = usize::try_from(byte_count)
        .map_err(|_| AppError::ResourceLimit("RGB image exceeds platform limit".into()))?;
    let mut bytes = Vec::with_capacity(capacity);
    for pixel in image.pixels() {
        bytes.extend_from_slice(&pixel.0[..3]);
    }
    RgbImage::from_raw(image.width(), image.height(), bytes)
        .ok_or_else(|| AppError::Export("could not construct RGB page image".into()))
}

fn validate_output_path(pdf_path: &Path, out_path: &Path) -> AppResult<PathBuf> {
    if !out_path.is_absolute() {
        return Err(AppError::InvalidOutputPath(
            "output path must be absolute".into(),
        ));
    }
    if out_path
        .components()
        .any(|component| matches!(component, Component::ParentDir))
    {
        return Err(AppError::InvalidOutputPath(
            "output path must not contain '..'".into(),
        ));
    }
    if out_path.extension().and_then(|value| value.to_str()) != Some("pdf") {
        return Err(AppError::InvalidOutputPath(
            "output filename must end in .pdf".into(),
        ));
    }
    let filename = out_path
        .file_name()
        .ok_or_else(|| AppError::InvalidOutputPath("output path must include a filename".into()))?;
    let parent = out_path.parent().ok_or_else(|| {
        AppError::InvalidOutputPath("output path must have a parent directory".into())
    })?;
    let canonical_parent = fs::canonicalize(parent).map_err(|error| {
        AppError::InvalidOutputPath(format!(
            "output directory {} is unavailable: {error}",
            parent.display()
        ))
    })?;
    if !canonical_parent.is_dir() {
        return Err(AppError::InvalidOutputPath(format!(
            "output parent is not a directory: {}",
            canonical_parent.display()
        )));
    }
    if canonical_parent.parent().is_none() {
        return Err(AppError::InvalidOutputPath(
            "refusing to write directly to the filesystem root".into(),
        ));
    }
    let output = canonical_parent.join(filename);
    if let Ok(metadata) = fs::symlink_metadata(&output) {
        if metadata.file_type().is_symlink() {
            return Err(AppError::InvalidOutputPath(
                "refusing to replace a symbolic link".into(),
            ));
        }
        if !metadata.is_file() {
            return Err(AppError::InvalidOutputPath(
                "output path exists and is not a regular file".into(),
            ));
        }
        if metadata.permissions().readonly() {
            return Err(AppError::InvalidOutputPath(
                "output file is read-only".into(),
            ));
        }
    }
    if let (Ok(source), Ok(output_existing)) =
        (fs::canonicalize(pdf_path), fs::canonicalize(&output))
    {
        if source == output_existing {
            return Err(AppError::InvalidOutputPath(
                "output path must differ from the source PDF".into(),
            ));
        }
    }
    Ok(output)
}

fn atomic_write(
    output: &Path,
    write: impl FnOnce(&mut File) -> std::io::Result<()>,
) -> AppResult<()> {
    let parent = output
        .parent()
        .ok_or_else(|| AppError::InvalidOutputPath("output has no parent directory".into()))?;
    let filename = output
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| AppError::InvalidOutputPath("output filename is not valid UTF-8".into()))?;
    let temp = unique_temp_path(parent, filename);
    let result = (|| -> std::io::Result<()> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)?;
        write(&mut file)?;
        drop(file);
        fs::rename(&temp, output)?;
        sync_directory(parent)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result.map_err(|error| {
        let detail = if error.kind() == ErrorKind::PermissionDenied {
            "permission denied or destination is read-only".to_owned()
        } else {
            error.to_string()
        };
        AppError::Export(format!(
            "atomic write to {} failed: {detail}",
            output.display()
        ))
    })
}

fn unique_temp_path(parent: &Path, filename: &str) -> PathBuf {
    let counter = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    parent.join(format!(
        ".{filename}.eldraw-export-{}-{counter}.tmp",
        std::process::id()
    ))
}

#[cfg(unix)]
fn sync_directory(parent: &Path) -> std::io::Result<()> {
    File::open(parent)?.sync_all()
}

#[cfg(not(unix))]
fn sync_directory(_parent: &Path) -> std::io::Result<()> {
    Ok(())
}

/// Convert an app-space point to native PDF user space.
fn top_left_to_pdf(x: f64, y: f64, page_height: f64) -> (f64, f64) {
    (x, page_height - y)
}

fn top_left_rect_to_pdf(x: f64, y: f64, height: f64, page_height: f64) -> (f64, f64) {
    top_left_to_pdf(x, y + height, page_height)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::TempDir;

    #[allow(clippy::needless_pass_by_value)]
    fn document(pages: Vec<serde_json::Value>) -> EldrawDocument {
        serde_json::from_value(json!({
            "version": 1,
            "pdfHash": "fixture",
            "pdfPath": null,
            "pages": pages,
            "palettes": [],
            "prefs": {},
        }))
        .unwrap()
    }

    fn page(kind: &str, index: usize) -> serde_json::Value {
        json!({
            "pageIndex": index,
            "type": kind,
            "insertedAfterPdfPage": null,
            "width": 100.0,
            "height": 200.0,
            "background": "#ffffff",
            "objects": [],
        })
    }

    fn fixture_pdf(page_count: usize) -> Vec<u8> {
        let pages: Vec<Page> = (0..page_count)
            .map(|index| serde_json::from_value(page("blank", index)).expect("fixture page"))
            .collect();
        let images: Vec<RgbaImage> = (0..page_count)
            .map(|_| RgbaImage::from_pixel(200, 400, Rgba([255, 255, 255, 255])))
            .collect();
        encode_pdf(&pages, &images).expect("fixture PDF")
    }

    #[test]
    fn coordinate_transform_flips_y_exactly() {
        assert_eq!(top_left_to_pdf(12.5, 25.0, 792.0), (12.5, 767.0));
        assert_eq!(top_left_rect_to_pdf(10.0, 20.0, 30.0, 200.0), (10.0, 150.0));
    }

    #[test]
    fn selection_honors_reorder_duplicates_and_deletion() {
        let mut p0 = page("pdf", 0);
        p0["pdfSourceIndex"] = json!(2);
        let mut p1 = page("pdf", 1);
        p1["pdfSourceIndex"] = json!(0);
        let mut p2 = page("pdf", 2);
        p2["pdfSourceIndex"] = json!(2);
        let doc = document(vec![p0, p1, p2]);
        assert_eq!(
            select_page_sources(&doc.pages).unwrap(),
            vec![PageSource::Pdf(2), PageSource::Pdf(0), PageSource::Pdf(2)]
        );
        validate_page_selection(&doc.pages, &select_page_sources(&doc.pages).unwrap(), 3).unwrap();
    }

    #[test]
    fn every_slide_block_kind_renders() {
        let mut slide = page("slide", 0);
        slide["slide"] = json!({
            "layout": "content",
            "title": "All blocks",
            "blocks": [
                {"id":"b1","kind":"text","text":"Body"},
                {"id":"b2","kind":"list","items":[{"text":"one","level":0},{"text":"sub","level":1}],
                 "marker":"decimal","markerByLevel":["decimal","alpha","roman"]},
                {"id":"b3","kind":"definitions","items":[{"term":"Term","text":"Meaning"}]},
                {"id":"b4","kind":"table","header":["h"],"rows":[["r"]],"headerOrientation":"column"},
                {"id":"b5","kind":"math","latex":"x^2","display":true},
                {"id":"b6","kind":"callout","text":"Tip","tone":"tip"},
                {"id":"b7","kind":"mapping","leftLabel":"In","rightLabel":"Out",
                 "left":["1","2"],"right":["3"],
                 "pairs":[{"from":0,"to":0},{"from":9,"to":9}],"height":80},
                {"id":"b8","kind":"diagram",
                 "nodes":[{"id":"n1","text":"x","x":0.2,"y":0.5,"shape":"box"},
                          {"id":"n2","text":"2x","x":0.8,"y":0.5,"shape":"plain"}],
                 "edges":[{"from":"n1","to":"n2","label":"double"},
                          {"from":"n1","to":"n1"},
                          {"from":"ghost","to":"n2"}],
                 "height":80},
                {"id":"b9","kind":"numberline","min":-5,"max":5,"tickStep":1,"labelStep":5,
                 "marks":[{"value":0,"kind":"closed"},{"value":2,"kind":"open"},
                          {"value":-3,"kind":"arrow-left"},{"value":99,"kind":"closed"}],
                 "height":60},
                {"id":"b10","kind":"spacer","height":20}
            ],
        });
        let doc = document(vec![slide]);
        validate_document(&doc).unwrap();
        let sources = select_page_sources(&doc.pages).unwrap();
        let image = render_page(&doc.pages[0], sources[0], None, None).unwrap();
        assert_eq!(image.dimensions(), (200, 400));
    }

    /// A degenerate number line must not drive an unbounded tick loop or panic.
    #[test]
    fn degenerate_number_line_block_is_safe() {
        for (min, max, tick, label) in [
            (0.0, 0.0, 1.0, 1.0),
            (10.0, -10.0, 1.0, 1.0),
            (-1.0, 1.0, 0.0, 0.0),
            (-1.0, 1.0, -5.0, -5.0),
            (-1000.0, 1000.0, 0.000_001, 0.000_001),
        ] {
            let mut slide = page("slide", 0);
            slide["slide"] = json!({
                "layout": "content",
                "title": "Edge",
                "blocks": [{"id":"n","kind":"numberline","min":min,"max":max,
                            "tickStep":tick,"labelStep":label,"marks":[],"height":40}],
            });
            let doc = document(vec![slide]);
            validate_document(&doc).unwrap();
            let sources = select_page_sources(&doc.pages).unwrap();
            assert!(render_page(&doc.pages[0], sources[0], None, None).is_ok());
        }
    }

    #[test]
    fn blank_and_slide_pages_render_without_source_pdf() {
        let blank = page("blank", 0);
        let mut slide = page("slide", 1);
        slide["slide"] = json!({
            "layout": "content",
            "title": "Lesson",
            "blocks": [{"id":"b1","kind":"text","text":"Hello"}],
        });
        let doc = document(vec![blank, slide]);
        validate_document(&doc).unwrap();
        let sources = select_page_sources(&doc.pages).unwrap();
        let blank_image = render_page(&doc.pages[0], sources[0], None, None).unwrap();
        let slide_image = render_page(&doc.pages[1], sources[1], None, None).unwrap();
        assert_eq!(blank_image.dimensions(), (200, 400));
        assert_eq!(slide_image.dimensions(), (200, 400));
        assert_ne!(slide_image, blank_image);
    }

    #[test]
    fn every_annotation_kind_renders_and_encodes() {
        let style = json!({
            "color": "#2255aa",
            "width": 2.0,
            "dash": "solid",
            "opacity": 0.8,
        });
        let mut annotated = page("blank", 0);
        annotated["objects"] = json!([
            {
                "id":"stroke","createdAt":0,"type":"stroke","tool":"pen","style":style,
                "points":[
                    {"x":5,"y":5,"pressure":0.2,"t":0},
                    {"x":30,"y":20,"pressure":1.0,"t":10}
                ]
            },
            {
                "id":"highlight","createdAt":0,"type":"stroke","tool":"highlighter",
                "style":{"color":"#ffff00","width":8,"dash":"solid","opacity":0.4},
                "points":[
                    {"x":5,"y":25,"pressure":0.5,"t":0},
                    {"x":40,"y":25,"pressure":0.5,"t":10}
                ]
            },
            {
                "id":"line","createdAt":0,"type":"line","style":style,
                "from":{"x":5,"y":35},"to":{"x":50,"y":35},
                "arrow":{"start":true,"end":true}
            },
            {
                "id":"rect","createdAt":0,"type":"shape","kind":"rect","style":style,
                "fill":"#ddeeff","bounds":{"x":5,"y":45,"w":25,"h":15}
            },
            {
                "id":"ellipse","createdAt":0,"type":"shape","kind":"ellipse","style":style,
                "fill":null,"bounds":{"x":35,"y":45,"w":25,"h":15}
            },
            {
                "id":"number","createdAt":0,"type":"numberline","style":style,
                "from":{"x":10,"y":75},"length":70,"min":-2,"max":2,
                "tickStep":1,"labelStep":1,
                "marks":[{"value":1,"kind":"closed"}]
            },
            {
                "id":"graph","createdAt":0,"type":"graph",
                "bounds":{"x":5,"y":95,"w":60,"h":45},
                "xRange":[-2,2],"yRange":[-2,2],"gridStep":1,
                "showAxes":true,"showGrid":true,
                "functions":[{
                    "id":"f","expr":"x","kind":"explicit","color":"#cc0000",
                    "width":1,"dash":"solid","domain":null
                }]
            },
            {
                "id":"text","createdAt":0,"type":"text","at":{"x":5,"y":145},
                "content":"y = x","latex":false,"fontSize":10,"color":"#000000"
            },
            {
                "id":"angle","createdAt":0,"type":"angleMark",
                "vertex":{"x":70,"y":170},"rayA":{"x":90,"y":170},"rayB":{"x":70,"y":150},
                "degrees":-90,"color":"#000000","width":1,"showLabel":true
            }
        ]);
        let doc = document(vec![annotated]);
        validate_document(&doc).unwrap();
        let image = render_page(&doc.pages[0], PageSource::Blank, None, None).unwrap();
        let bytes = encode_pdf(&doc.pages, &[image]).unwrap();
        assert_eq!(inspect_source_pdf(&bytes).unwrap(), 1);
    }

    #[test]
    fn blank_and_slide_pages_encode_as_pdf_pages() {
        let blank = page("blank", 0);
        let mut slide = page("slide", 1);
        slide["slide"] = json!({
            "layout": "title",
            "title": "Lesson",
            "subtitle": "Functions",
            "blocks": [{"id":"b1","kind":"callout","text":"Try it","tone":"tip"}],
        });
        let doc = document(vec![blank, slide]);
        let sources = select_page_sources(&doc.pages).unwrap();
        let images = doc
            .pages
            .iter()
            .zip(sources)
            .map(|(page, source)| render_page(page, source, None, None).unwrap())
            .collect::<Vec<_>>();
        let bytes = encode_pdf(&doc.pages, &images).unwrap();
        assert_eq!(inspect_source_pdf(&bytes).unwrap(), 2);
    }

    #[test]
    fn missing_source_file_is_typed_export_error() {
        let error =
            read_source_pdf(Path::new("/definitely/missing/eldraw-fixture.pdf")).unwrap_err();
        assert!(matches!(error, AppError::Export(_)));
        assert!(error.to_string().contains("cannot read source PDF"));
    }

    #[test]
    fn corrupt_source_file_is_typed_pdf_error() {
        let error = inspect_source_pdf(b"not a pdf").unwrap_err();
        assert!(matches!(error, AppError::Pdf(_)));
        assert!(error.to_string().contains("corrupt"));
    }

    #[test]
    fn out_of_range_pdf_source_index_is_rejected() {
        let mut pdf_page = page("pdf", 0);
        pdf_page["pdfSourceIndex"] = json!(3);
        let doc = document(vec![pdf_page]);
        let sources = select_page_sources(&doc.pages).unwrap();
        let fixture = fixture_pdf(1);
        let count = inspect_source_pdf(&fixture).unwrap();
        let error = validate_page_selection(&doc.pages, &sources, count).unwrap_err();
        assert!(matches!(error, AppError::InvalidInput(_)));
        assert!(error.to_string().contains("pdfSourceIndex 3"));
    }

    #[test]
    fn zero_size_page_is_rejected() {
        let mut blank = page("blank", 0);
        blank["width"] = json!(0);
        let error = validate_document(&document(vec![blank])).unwrap_err();
        assert!(matches!(error, AppError::InvalidInput(_)));
        assert!(error.to_string().contains("invalid page dimensions"));
    }

    #[test]
    fn empty_document_is_rejected() {
        let error = validate_document(&document(Vec::new())).unwrap_err();
        assert!(matches!(error, AppError::InvalidInput(_)));
        assert!(error.to_string().contains("empty document"));
    }

    #[test]
    fn failed_atomic_write_leaves_no_partial_output() {
        let dir = TempDir::new().unwrap();
        let output = dir.path().join("notes.pdf");
        let error = atomic_write(&output, |file| {
            file.write_all(b"partial")?;
            Err(std::io::Error::other("injected failure"))
        })
        .unwrap_err();
        assert!(matches!(error, AppError::Export(_)));
        assert!(!output.exists());
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 0);
    }

    #[test]
    fn failed_replacement_preserves_existing_output() {
        let dir = TempDir::new().unwrap();
        let output = dir.path().join("notes.pdf");
        fs::write(&output, b"original").unwrap();
        atomic_write(&output, |file| {
            file.write_all(b"replacement")?;
            Err(std::io::Error::other("injected failure"))
        })
        .unwrap_err();
        assert_eq!(fs::read(&output).unwrap(), b"original");
    }

    #[test]
    fn dimension_and_area_caps_are_enforced() {
        let dimension = pixel_size(f64::from(MAX_PIXEL_DIMENSION), 10.0).unwrap_err();
        assert!(matches!(dimension, AppError::ResourceLimit(_)));
        let area = pixel_size(4096.0, 4096.0).unwrap_err();
        assert!(matches!(area, AppError::ResourceLimit(_)));
    }

    #[test]
    fn page_count_cap_is_enforced() {
        let pages = (0..=MAX_PAGE_COUNT)
            .map(|index| page("blank", index))
            .collect();
        let error = validate_document(&document(pages)).unwrap_err();
        assert!(matches!(error, AppError::ResourceLimit(_)));
    }

    #[test]
    fn programmatic_fixture_pdf_has_requested_page_count() {
        let bytes = fixture_pdf(3);
        assert_eq!(inspect_source_pdf(&bytes).unwrap(), 3);
    }

    #[test]
    fn source_page_rasterizes_when_pdfium_binary_is_present() {
        let library_name = Pdfium::pdfium_platform_library_name();
        let library = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("pdfium")
            .join(library_name);
        if !library.exists() {
            eprintln!("pdfium binary is not installed; source raster smoke test skipped");
            return;
        }
        let bindings = Pdfium::bind_to_library(&library).expect("bind fixture pdfium");
        let engine = Pdfium::new(bindings);
        let fixture_page: Page = serde_json::from_value(page("blank", 0)).expect("fixture page");
        let mut fixture_image = RgbaImage::from_pixel(200, 400, Rgba([0, 0, 255, 255]));
        for pixel in fixture_image.rows_mut().take(200).flatten() {
            *pixel = Rgba([255, 0, 0, 255]);
        }
        let bytes = encode_pdf(&[fixture_page], &[fixture_image]).expect("fixture PDF");
        let document = load_pdfium_document(&engine, &bytes).expect("load fixture PDF");
        let image = render_source_page(
            &document,
            0,
            PixelSize {
                width: 200,
                height: 400,
            },
            100.0,
            200.0,
        )
        .expect("render fixture PDF");
        assert_eq!(image.dimensions(), (200, 400));
        assert!(image.get_pixel(100, 50).0[0] > 200, "top must stay red");
        assert!(
            image.get_pixel(100, 350).0[2] > 200,
            "bottom must stay blue"
        );
    }

    #[test]
    fn output_path_rejects_relative_and_root_paths() {
        let relative = validate_output_path(Path::new("/source.pdf"), Path::new("out.pdf"));
        assert!(matches!(relative, Err(AppError::InvalidOutputPath(_))));
        let root = validate_output_path(Path::new("/source.pdf"), Path::new("/out.pdf"));
        assert!(matches!(root, Err(AppError::InvalidOutputPath(_))));
    }

    #[test]
    fn read_only_existing_output_is_rejected() {
        let dir = TempDir::new().unwrap();
        let output = dir.path().join("notes.pdf");
        fs::write(&output, b"old").unwrap();
        let mut permissions = fs::metadata(&output).unwrap().permissions();
        permissions.set_readonly(true);
        fs::set_permissions(&output, permissions).unwrap();
        let error = validate_output_path(&dir.path().join("source.pdf"), &output).unwrap_err();
        assert!(matches!(error, AppError::InvalidOutputPath(_)));
    }
}
