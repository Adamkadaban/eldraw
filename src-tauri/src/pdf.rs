//! PDF ingest & raster pipeline.
//!
//! Rendering uses pdfium-render. The native pdfium library is resolved at
//! runtime by [`crate::state::pdfium`]: bundled resource dir first, then a
//! binary next to the executable, then the system loader. Installers ship
//! the matching `libpdfium.so` / `pdfium.dll` / `libpdfium.dylib` inside the
//! app's resource directory under `pdfium/`.

use std::io::Cursor;
use std::path::PathBuf;

use image::ImageFormat;
use pdfium_render::prelude::{PdfRenderConfig, Pdfium};
use sha2::{Digest, Sha256};
use tauri::ipc::Response;
use tauri::{AppHandle, State};

use crate::error::{AppError, AppResult};
use crate::model::{PageDims, PdfMeta};
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
    state.set_open(pdf_path, bytes)?;

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

#[tauri::command]
pub async fn render_page(
    app: AppHandle,
    page_index: u32,
    scale: f32,
    state: State<'_, AppState>,
) -> AppResult<Response> {
    if !scale.is_finite() || scale <= 0.0 {
        return Err(AppError::Pdf(format!("invalid scale: {scale}")));
    }
    let bytes = state.with_open(|open| {
        let pdfium = pdfium(&app)?;
        let doc = load_document(pdfium, &open.bytes)?;
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

        let bitmap = page
            .render_with_config(&config)
            .map_err(|e| AppError::Pdf(format!("render: {e}")))?;

        let image = bitmap
            .as_image()
            .map_err(|e| AppError::Pdf(format!("bitmap: {e}")))?;
        let mut out = Cursor::new(Vec::<u8>::new());
        image.write_to(&mut out, ImageFormat::Png)?;
        Ok(out.into_inner())
    })?;
    Ok(Response::new(bytes))
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
}
