//! PDF ingest & raster pipeline.
//!
//! Rendering uses pdfium-render. The native pdfium library is resolved at
//! runtime by [`crate::state::pdfium`]: bundled resource dir first, then a
//! binary next to the executable, then the system loader. Installers ship
//! the matching `libpdfium.so` / `pdfium.dll` / `libpdfium.dylib` inside the
//! app's resource directory under `pdfium/`.
//!
//! Rendered pages flow through an LRU bitmap cache (see [`crate::page_cache`])
//! so page navigation on an already-visited page is an in-memory lookup.
//! The wire format for `render_page` is a small binary header
//! (`width: u32 LE` + `height: u32 LE`) followed by `width * height * 4` raw
//! RGBA bytes. Raw RGBA beat PNG by over an order of magnitude in the
//! `bench_render_png_vs_raw_rgba` ignored test below, so we ship raw.

use std::path::PathBuf;
use std::sync::Arc;

use pdfium_render::prelude::{PdfRenderConfig, Pdfium};
use sha2::{Digest, Sha256};
use tauri::ipc::Response;
use tauri::{AppHandle, State};

use crate::error::{AppError, AppResult};
use crate::model::{PageDims, PdfMeta};
use crate::page_cache::{PageBitmap, PageCache, PageKey};
use crate::state::{pdfium, AppState};

/// Lowercase hex SHA-256 digest of `bytes`.
pub fn hash_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex_lower(&hasher.finalize())
}

fn hex_lower(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 0x0f) as usize] as char);
    }
    out
}

#[allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    clippy::cast_precision_loss
)]
fn pixel_dim(points: f32, scale: f32) -> i32 {
    let raw = (points * scale).round().max(1.0).min(i32::MAX as f32);
    raw as i32
}

fn load_document<'a>(
    pdfium: &'a Pdfium,
    bytes: &'a [u8],
) -> AppResult<pdfium_render::prelude::PdfDocument<'a>> {
    pdfium
        .load_pdf_from_byte_slice(bytes, None)
        .map_err(|e| AppError::Pdf(format!("load_pdf: {e}")))
}

#[tauri::command]
pub async fn open_pdf(
    app: AppHandle,
    path: String,
    state: State<'_, AppState>,
    cache: State<'_, PageCache>,
) -> AppResult<PdfMeta> {
    let pdf_path = PathBuf::from(&path);
    let bytes = std::fs::read(&pdf_path)?;
    let hash = hash_bytes(&bytes);

    let pdfium = pdfium(&app)?;
    let doc = load_document(pdfium, &bytes)?;

    let mut pages = Vec::with_capacity(usize::try_from(doc.pages().len()).unwrap_or(0));
    for page in doc.pages().iter() {
        pages.push(PageDims {
            width: f64::from(page.width().value),
            height: f64::from(page.height().value),
        });
    }
    let page_count =
        u32::try_from(pages.len()).map_err(|_| AppError::Pdf("page count exceeds u32".into()))?;

    drop(doc);
    state.set_open(pdf_path, bytes, hash.clone())?;
    cache.clear()?;

    Ok(PdfMeta {
        path,
        hash,
        page_count,
        pages,
    })
}

/// Upper bound on the rendered bitmap size (pixels). Guards against
/// pathological scale values producing multi-GB bitmaps.
const MAX_PIXEL_AREA: u64 = 64 * 1024 * 1024;

/// Pack an `(width, height, rgba)` bitmap into the wire format consumed by
/// the frontend: `width: u32 LE | height: u32 LE | rgba bytes`.
fn encode_response(bitmap: &PageBitmap) -> Vec<u8> {
    let mut out = Vec::with_capacity(8 + bitmap.rgba.len());
    out.extend_from_slice(&bitmap.width.to_le_bytes());
    out.extend_from_slice(&bitmap.height.to_le_bytes());
    out.extend_from_slice(&bitmap.rgba);
    out
}

fn render_to_bitmap(
    app: &AppHandle,
    bytes: &[u8],
    page_index: u32,
    scale: f32,
) -> AppResult<PageBitmap> {
    let pdfium = pdfium(app)?;
    let doc = load_document(pdfium, bytes)?;
    let page = doc
        .pages()
        .get(
            i32::try_from(page_index)
                .map_err(|_| AppError::Pdf(format!("page_index {page_index} out of range")))?,
        )
        .map_err(|_| AppError::Pdf(format!("page_index {page_index} out of range")))?;

    let width_px = pixel_dim(page.width().value, scale);
    let height_px = pixel_dim(page.height().value, scale);
    let area = u64::from(width_px.unsigned_abs()) * u64::from(height_px.unsigned_abs());
    if area > MAX_PIXEL_AREA {
        return Err(AppError::Pdf(format!(
            "requested bitmap {width_px}x{height_px} exceeds {MAX_PIXEL_AREA}-pixel cap"
        )));
    }

    let config = PdfRenderConfig::new()
        .set_target_width(width_px)
        .set_target_height(height_px);
    let pdf_bitmap = page
        .render_with_config(&config)
        .map_err(|e| AppError::Pdf(format!("render: {e}")))?;
    let rgba = pdf_bitmap
        .as_image()
        .map_err(|e| AppError::Pdf(format!("bitmap: {e}")))?
        .into_rgba8();
    let (width, height) = rgba.dimensions();
    Ok(PageBitmap {
        width,
        height,
        rgba: rgba.into_raw(),
    })
}

#[tauri::command]
pub async fn render_page(
    app: AppHandle,
    page_index: u32,
    scale: f32,
    pdf_id: Option<String>,
    state: State<'_, AppState>,
    cache: State<'_, PageCache>,
) -> AppResult<Response> {
    if !scale.is_finite() || scale <= 0.0 {
        return Err(AppError::Pdf(format!("invalid scale: {scale}")));
    }

    let hash = state.with_open(|open| {
        if let Some(expected) = pdf_id.as_deref() {
            if expected != open.hash {
                return Err(AppError::InvalidInput(format!(
                    "pdf_id {expected} does not match the currently-open document"
                )));
            }
        }
        Ok(open.hash.clone())
    })?;

    let key = PageKey::new(&hash, page_index, scale);
    if let Some(hit) = cache.get(&key)? {
        state.with_open(|open| {
            if let Some(expected) = pdf_id.as_deref() {
                if expected != open.hash {
                    return Err(AppError::InvalidInput(format!(
                        "pdf_id {expected} does not match the currently-open document"
                    )));
                }
            }
            if open.hash != hash {
                return Err(AppError::InvalidInput("pdf changed during render".into()));
            }
            Ok(())
        })?;
        return Ok(Response::new(encode_response(&hit)));
    }

    let bitmap = state.with_open(|open| {
        if open.hash != hash {
            return Err(AppError::InvalidInput("pdf changed during render".into()));
        }
        render_to_bitmap(&app, &open.bytes, page_index, scale)
    })?;

    let shared = Arc::new(bitmap);
    cache.insert(key, Arc::clone(&shared))?;
    Ok(Response::new(encode_response(&shared)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sha256_of_abc_matches_nist_vector() {
        assert_eq!(
            hash_bytes(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn sha256_of_empty_matches_nist_vector() {
        assert_eq!(
            hash_bytes(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn hex_lower_pads_leading_zeros() {
        assert_eq!(hex_lower(&[0x00, 0x0f, 0xff]), "000fff");
    }

    #[test]
    fn encode_response_prefixes_header_then_rgba() {
        let bitmap = PageBitmap {
            width: 3,
            height: 2,
            rgba: vec![0xaa; 24],
        };
        let out = encode_response(&bitmap);
        assert_eq!(&out[..4], 3u32.to_le_bytes());
        assert_eq!(&out[4..8], 2u32.to_le_bytes());
        assert_eq!(&out[8..], &[0xaa; 24]);
    }

    /// One-off benchmark comparing PNG encoding against raw RGBA payload
    /// assembly for the same rendered bitmap. Ignored by default; run with:
    ///
    /// ```text
    /// cargo test --manifest-path src-tauri/Cargo.toml -- \
    ///     --ignored bench_render_png_vs_raw_rgba --nocapture
    /// ```
    ///
    /// Local measurement (synthetic 1224x1584 RGBA, debug build, 20 iters):
    /// PNG encode averaged ~1174 ms/iter; raw RGBA packaging averaged
    /// ~1.4 ms/iter. Release narrows the gap but raw still wins by more than
    /// an order of magnitude, which is why `render_page` returns raw bytes.
    #[test]
    #[ignore = "benchmark; run explicitly with --ignored"]
    fn bench_render_png_vs_raw_rgba() {
        use image::{ImageBuffer, ImageFormat, Rgba};
        use std::io::Cursor;
        use std::time::Instant;

        let (w, h) = (1224u32, 1584u32);
        let mut buf: ImageBuffer<Rgba<u8>, Vec<u8>> = ImageBuffer::new(w, h);
        for (i, px) in buf.pixels_mut().enumerate() {
            let v = u8::try_from(i & 0xff).unwrap_or(0);
            *px = Rgba([v, v.wrapping_add(64), v.wrapping_add(128), 0xff]);
        }

        let iters = 20u32;

        let t_png = Instant::now();
        for _ in 0..iters {
            let mut out = Cursor::new(Vec::<u8>::new());
            buf.write_to(&mut out, ImageFormat::Png).unwrap();
            std::hint::black_box(out.into_inner());
        }
        let png_ms = t_png.elapsed().as_secs_f64() * 1000.0 / f64::from(iters);

        let t_raw = Instant::now();
        for _ in 0..iters {
            let bitmap = PageBitmap {
                width: w,
                height: h,
                rgba: buf.as_raw().clone(),
            };
            std::hint::black_box(encode_response(&bitmap));
        }
        let raw_ms = t_raw.elapsed().as_secs_f64() * 1000.0 / f64::from(iters);

        println!("png encode: {png_ms:.2} ms/iter; raw rgba: {raw_ms:.2} ms/iter");
        assert!(raw_ms < png_ms, "raw RGBA must beat PNG");
    }
}
