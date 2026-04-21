//! LRU cache for rendered PDF page bitmaps, keyed by
//! `(pdf_hash, page_index, scale_bucket)`.
//!
//! Stores raw RGBA bytes plus dimensions. Raw RGBA is several times faster
//! than encoding PNG per request (see the `render_png_vs_raw_rgba` bench in
//! `pdf.rs`), and it's the format the frontend's `putImageData` needs.
//!
//! Scale is bucketed to the nearest thousandth so trivially different floats
//! (e.g. from repeated zoom-in clicks) still land on the same key.

use std::num::NonZeroUsize;
use std::sync::{Arc, Mutex};

use lru::LruCache;

use crate::error::{AppError, AppResult};

pub const DEFAULT_CAPACITY: usize = 16;

#[derive(Clone, Hash, Eq, PartialEq, Debug)]
pub struct PageKey {
    pub pdf_hash: String,
    pub page_index: u32,
    pub scale_bucket: u32,
}

impl PageKey {
    pub fn new(pdf_hash: &str, page_index: u32, scale: f32) -> Self {
        Self {
            pdf_hash: pdf_hash.to_owned(),
            page_index,
            scale_bucket: scale_bucket(scale),
        }
    }
}

#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn scale_bucket(scale: f32) -> u32 {
    (scale * 1000.0).round().max(0.0) as u32
}

pub struct PageBitmap {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

struct CacheInner {
    map: LruCache<PageKey, Arc<PageBitmap>>,
    hits: u64,
    misses: u64,
}

pub struct PageCache {
    inner: Mutex<CacheInner>,
}

fn poisoned() -> AppError {
    AppError::Pdf("page cache mutex poisoned".into())
}

impl PageCache {
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

    pub fn get(&self, key: &PageKey) -> AppResult<Option<Arc<PageBitmap>>> {
        let mut guard = self.inner.lock().map_err(|_| poisoned())?;
        if let Some(v) = guard.map.get(key) {
            let cloned = Arc::clone(v);
            guard.hits += 1;
            Ok(Some(cloned))
        } else {
            guard.misses += 1;
            Ok(None)
        }
    }

    pub fn insert(&self, key: PageKey, value: Arc<PageBitmap>) -> AppResult<()> {
        let mut guard = self.inner.lock().map_err(|_| poisoned())?;
        guard.map.put(key, value);
        Ok(())
    }

    pub fn clear(&self) -> AppResult<()> {
        let mut guard = self.inner.lock().map_err(|_| poisoned())?;
        guard.map.clear();
        Ok(())
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn len(&self) -> AppResult<usize> {
        Ok(self.inner.lock().map_err(|_| poisoned())?.map.len())
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn stats(&self) -> AppResult<(u64, u64)> {
        let g = self.inner.lock().map_err(|_| poisoned())?;
        Ok((g.hits, g.misses))
    }
}

impl Default for PageCache {
    fn default() -> Self {
        Self::with_capacity(DEFAULT_CAPACITY)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bitmap(fill: u8) -> Arc<PageBitmap> {
        Arc::new(PageBitmap {
            width: 2,
            height: 2,
            rgba: vec![fill; 16],
        })
    }

    #[test]
    fn scale_bucket_groups_near_floats() {
        assert_eq!(scale_bucket(1.0), 1000);
        assert_eq!(scale_bucket(1.0 + f32::EPSILON), 1000);
        assert_ne!(scale_bucket(1.000), scale_bucket(1.002));
    }

    #[test]
    fn hit_returns_same_bytes_as_inserted() {
        let cache = PageCache::with_capacity(4);
        let key = PageKey::new("hash-a", 0, 1.5);
        assert!(cache.get(&key).unwrap().is_none());
        cache.insert(key.clone(), bitmap(0x7f)).unwrap();
        let hit = cache.get(&key).unwrap().expect("expected cache hit");
        assert_eq!(hit.rgba, vec![0x7f; 16]);
        assert_eq!(cache.stats().unwrap(), (1, 1));
    }

    #[test]
    fn clear_drops_all_entries() {
        let cache = PageCache::with_capacity(4);
        cache.insert(PageKey::new("a", 0, 1.0), bitmap(1)).unwrap();
        cache.insert(PageKey::new("a", 1, 1.0), bitmap(2)).unwrap();
        cache.clear().unwrap();
        assert_eq!(cache.len().unwrap(), 0);
        assert!(cache.get(&PageKey::new("a", 0, 1.0)).unwrap().is_none());
    }

    #[test]
    fn different_hash_does_not_collide() {
        let cache = PageCache::with_capacity(4);
        cache.insert(PageKey::new("a", 0, 1.0), bitmap(1)).unwrap();
        cache.insert(PageKey::new("b", 0, 1.0), bitmap(2)).unwrap();
        assert_eq!(
            cache.get(&PageKey::new("a", 0, 1.0)).unwrap().unwrap().rgba,
            vec![1; 16]
        );
        assert_eq!(
            cache.get(&PageKey::new("b", 0, 1.0)).unwrap().unwrap().rgba,
            vec![2; 16]
        );
    }

    #[test]
    fn evicts_lru_past_capacity() {
        let cache = PageCache::with_capacity(2);
        cache.insert(PageKey::new("a", 0, 1.0), bitmap(1)).unwrap();
        cache.insert(PageKey::new("a", 1, 1.0), bitmap(2)).unwrap();
        let _ = cache.get(&PageKey::new("a", 0, 1.0)).unwrap();
        cache.insert(PageKey::new("a", 2, 1.0), bitmap(3)).unwrap();
        assert!(cache.get(&PageKey::new("a", 1, 1.0)).unwrap().is_none());
        assert!(cache.get(&PageKey::new("a", 0, 1.0)).unwrap().is_some());
        assert!(cache.get(&PageKey::new("a", 2, 1.0)).unwrap().is_some());
    }
}
