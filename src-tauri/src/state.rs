use pdfium_render::prelude::Pdfium;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use crate::error::{AppError, AppResult};

/// Owns the currently-open PDF bytes, keyed by canonical absolute path, plus
/// a lazily initialised Pdfium handle shared across commands.
#[derive(Default)]
pub struct AppState {
    inner: Mutex<Option<OpenPdf>>,
}

pub struct OpenPdf {
    #[allow(dead_code)] // retained for future cache invalidation / diagnostics
    pub path: PathBuf,
    pub bytes: Vec<u8>,
}

impl AppState {
    pub fn set_open(&self, path: PathBuf, bytes: Vec<u8>) -> AppResult<()> {
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| AppError::Pdf("state mutex poisoned".into()))?;
        let canonical = std::fs::canonicalize(&path).unwrap_or(path);
        *guard = Some(OpenPdf {
            path: canonical,
            bytes,
        });
        Ok(())
    }

    /// Run `f` with the currently open PDF bytes, if any.
    pub fn with_open<T>(&self, f: impl FnOnce(&OpenPdf) -> AppResult<T>) -> AppResult<T> {
        let guard = self
            .inner
            .lock()
            .map_err(|_| AppError::Pdf("state mutex poisoned".into()))?;
        match guard.as_ref() {
            Some(open) => f(open),
            None => Err(AppError::Pdf("no PDF is open".into())),
        }
    }
}

/// Returns a process-wide Pdfium handle. The native binary is resolved by
/// first trying `Pdfium::bind_to_system_library()`, then falling back to a
/// binary co-located with the running executable. If neither is available,
/// the error is surfaced to the caller.
pub fn pdfium() -> AppResult<&'static Pdfium> {
    static PDFIUM: OnceLock<Result<Pdfium, String>> = OnceLock::new();
    let slot = PDFIUM.get_or_init(|| {
        let bindings = Pdfium::bind_to_system_library()
            .or_else(|_| {
                let exe_dir = std::env::current_exe()
                    .ok()
                    .and_then(|p| p.parent().map(PathBuf::from))
                    .unwrap_or_else(|| PathBuf::from("."));
                Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path(&exe_dir))
            })
            .map_err(|e| format!("failed to load pdfium binary: {e}"))?;
        Ok(Pdfium::new(bindings))
    });
    match slot {
        Ok(p) => Ok(p),
        Err(msg) => Err(AppError::Pdf(msg.clone())),
    }
}
