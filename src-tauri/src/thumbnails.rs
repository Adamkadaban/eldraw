//! PDF thumbnail rendering with a process-wide LRU cache.
//!
//! Thumbnails are rendered through pdfium at a low resolution (`max_dim`
//! bounds the longest side) and cached as encoded PNG bytes keyed by
//! `(pdf_id, page_index, max_dim)`. The frontend wraps the returned bytes
//! in a `Blob` URL for `<img>` consumption.

use std::io::Cursor;
use std::num::NonZeroUsize;
use std::sync::{Arc, Mutex};

use image::ImageFormat;
use lru::LruCache;
use pdfium_render::prelude::PdfRenderConfig;
use tauri::ipc::Response;
use tauri::{AppHandle, State};

use crate::error::{AppError, AppResult};
use crate::state::{pdfium, AppState};

pub const DEFAULT_CAPACITY: usize = 64;

#[derive(Clone, Hash, Eq, PartialEq, Debug)]
pub struct ThumbKey {
    pub pdf_id: String,
    pub page_index: usize,
    pub max_dim: u32,
}

struct CacheInner {
    map: LruCache<ThumbKey, Arc<Vec<u8>>>,
    hits: u64,
    misses: u64,
}

pub struct ThumbnailCache {
    inner: Mutex<CacheInner>,
}

impl ThumbnailCache {
    pub fn with_capacity(capacity: usize) -> Self {
        let cap = NonZeroUsize::new(capacity.max(1)).expect("capacity clamped to >= 1");
        Self {
            inner: Mutex::new(CacheInner {
                map: LruCache::new(cap),
                hits: 0,
                misses: 0,
            }),
        }
    }

    pub fn get(&self, key: &ThumbKey) -> Option<Arc<Vec<u8>>> {
        let mut guard = self.inner.lock().expect("thumb cache poisoned");
        if let Some(v) = guard.map.get(key) {
            let cloned = Arc::clone(v);
            guard.hits += 1;
            Some(cloned)
        } else {
            guard.misses += 1;
            None
        }
    }

    pub fn insert(&self, key: ThumbKey, value: Arc<Vec<u8>>) {
        let mut guard = self.inner.lock().expect("thumb cache poisoned");
        guard.map.put(key, value);
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn len(&self) -> usize {
        self.inner.lock().expect("thumb cache poisoned").map.len()
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn stats(&self) -> (u64, u64) {
        let g = self.inner.lock().expect("thumb cache poisoned");
        (g.hits, g.misses)
    }
}

impl Default for ThumbnailCache {
    fn default() -> Self {
        Self::with_capacity(DEFAULT_CAPACITY)
    }
}

#[allow(
    clippy::cast_possible_truncation,
    clippy::cast_sign_loss,
    clippy::cast_precision_loss
)]
fn target_dims(width_pt: f32, height_pt: f32, max_dim: u32) -> (i32, i32) {
    let longest = width_pt.max(height_pt).max(1.0);
    let scale =
        f32::from(u16::try_from(max_dim.min(u32::from(u16::MAX))).unwrap_or(u16::MAX)) / longest;
    let w = (width_pt * scale).round().max(1.0) as i32;
    let h = (height_pt * scale).round().max(1.0) as i32;
    (w, h)
}

#[tauri::command]
pub async fn render_pdf_thumbnail(
    app: AppHandle,
    pdf_id: String,
    page_index: usize,
    max_dim: u32,
    state: State<'_, AppState>,
    cache: State<'_, ThumbnailCache>,
) -> AppResult<Response> {
    if max_dim == 0 {
        return Err(AppError::Pdf("max_dim must be > 0".into()));
    }
    let key = ThumbKey {
        pdf_id,
        page_index,
        max_dim,
    };

    if let Some(hit) = cache.get(&key) {
        return Ok(Response::new((*hit).clone()));
    }

    let bytes = state.with_open(|open| {
        let pdfium = pdfium(&app)?;
        let doc = pdfium
            .load_pdf_from_byte_slice(&open.bytes, None)
            .map_err(|e| AppError::Pdf(format!("load_pdf: {e}")))?;
        let page = doc
            .pages()
            .get(
                i32::try_from(page_index)
                    .map_err(|_| AppError::Pdf(format!("page_index {page_index} out of range")))?,
            )
            .map_err(|_| AppError::Pdf(format!("page_index {page_index} out of range")))?;

        let (w, h) = target_dims(page.width().value, page.height().value, max_dim);
        let config = PdfRenderConfig::new()
            .set_target_width(w)
            .set_target_height(h);
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

    let shared = Arc::new(bytes);
    cache.insert(key, Arc::clone(&shared));
    Ok(Response::new((*shared).clone()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key(id: &str, idx: usize) -> ThumbKey {
        ThumbKey {
            pdf_id: id.into(),
            page_index: idx,
            max_dim: 200,
        }
    }

    fn bytes(n: u8) -> Arc<Vec<u8>> {
        Arc::new(vec![n; 4])
    }

    #[test]
    fn miss_then_hit_increments_counters() {
        let cache = ThumbnailCache::with_capacity(8);
        assert!(cache.get(&key("a", 0)).is_none());
        cache.insert(key("a", 0), bytes(1));
        let got = cache.get(&key("a", 0)).expect("hit");
        assert_eq!(*got, vec![1; 4]);
        assert_eq!(cache.stats(), (1, 1));
    }

    #[test]
    fn evicts_least_recently_used_past_capacity() {
        let cache = ThumbnailCache::with_capacity(2);
        cache.insert(key("a", 0), bytes(1));
        cache.insert(key("a", 1), bytes(2));
        // Touch key 0 so key 1 becomes LRU.
        let _ = cache.get(&key("a", 0));
        cache.insert(key("a", 2), bytes(3));
        assert!(cache.get(&key("a", 1)).is_none(), "oldest must be evicted");
        assert!(cache.get(&key("a", 0)).is_some());
        assert!(cache.get(&key("a", 2)).is_some());
        assert_eq!(cache.len(), 2);
    }

    #[test]
    fn different_pdf_ids_do_not_collide() {
        let cache = ThumbnailCache::with_capacity(4);
        cache.insert(key("a", 0), bytes(1));
        cache.insert(key("b", 0), bytes(2));
        assert_eq!(*cache.get(&key("a", 0)).unwrap(), vec![1; 4]);
        assert_eq!(*cache.get(&key("b", 0)).unwrap(), vec![2; 4]);
    }

    #[test]
    fn zero_capacity_is_clamped_to_one() {
        let cache = ThumbnailCache::with_capacity(0);
        cache.insert(key("a", 0), bytes(1));
        assert!(cache.get(&key("a", 0)).is_some());
    }

    #[test]
    fn target_dims_caps_longest_side() {
        let (w, h) = target_dims(612.0, 792.0, 200);
        assert_eq!(h, 200);
        assert!(w < h);
        assert!((150..=160).contains(&w));
    }

    #[test]
    fn target_dims_landscape() {
        let (w, h) = target_dims(800.0, 400.0, 100);
        assert_eq!(w, 100);
        assert_eq!(h, 50);
    }
}
