use pdfium_render::prelude::Pdfium;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use tauri::{AppHandle, Manager};

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
/// trying, in order:
///   1. `<resource_dir>/pdfium/` — bundled library shipped with the installer.
///   2. The directory containing the current executable — useful for portable
///      layouts and local `cargo run` with a sibling binary.
///   3. The system loader — last-resort for developers who have pdfium
///      installed system-wide.
///
/// Initialization happens once per process; subsequent calls reuse the handle
/// regardless of which `app` is passed.
pub fn pdfium(app: &AppHandle) -> AppResult<&'static Pdfium> {
    static PDFIUM: OnceLock<Result<Pdfium, String>> = OnceLock::new();
    let slot = PDFIUM.get_or_init(|| {
        let mut attempts: Vec<String> = Vec::new();

        if let Ok(resource_dir) = app.path().resource_dir() {
            let bundled = resource_dir.join("pdfium");
            if let Some(pdfium) = try_bind(&bundled, &mut attempts) {
                return Ok(pdfium);
            }
        }

        if let Some(exe_dir) = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(PathBuf::from))
        {
            if let Some(pdfium) = try_bind(&exe_dir, &mut attempts) {
                return Ok(pdfium);
            }
        }

        match Pdfium::bind_to_system_library() {
            Ok(bindings) => Ok(Pdfium::new(bindings)),
            Err(e) => {
                attempts.push(format!("system: {e}"));
                Err(format!(
                    "failed to load pdfium binary; tried: {}",
                    attempts.join("; ")
                ))
            }
        }
    });
    match slot {
        Ok(p) => Ok(p),
        Err(msg) => Err(AppError::Pdf(msg.clone())),
    }
}

fn try_bind(dir: &Path, attempts: &mut Vec<String>) -> Option<Pdfium> {
    let path = Pdfium::pdfium_platform_library_name_at_path(dir);
    match Pdfium::bind_to_library(&path) {
        Ok(bindings) => Some(Pdfium::new(bindings)),
        Err(e) => {
            attempts.push(format!("{}: {e}", path.display()));
            None
        }
    }
}
