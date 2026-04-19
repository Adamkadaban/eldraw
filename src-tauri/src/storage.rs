//! Sidecar persistence and cross-process locking.
//!
//! Sidecar path convention: `"{pdf_path}.eldraw.json"`.
//! Lock file:               `"{pdf_path}.eldraw.lock"`.
//! Writes go via `"{pdf_path}.eldraw.json.tmp"` + rename for atomicity.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use sysinfo::{Pid, System};

use crate::error::{AppError, AppResult};
use crate::model::EldrawDocument;

const SUPPORTED_VERSION: u32 = 1;

fn sidecar_path(pdf_path: &str) -> PathBuf {
    PathBuf::from(format!("{pdf_path}.eldraw.json"))
}

fn tmp_path(pdf_path: &str) -> PathBuf {
    PathBuf::from(format!("{pdf_path}.eldraw.json.tmp"))
}

fn lock_path(pdf_path: &str) -> PathBuf {
    PathBuf::from(format!("{pdf_path}.eldraw.lock"))
}

fn ensure_parent(path: &Path) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            fs::create_dir_all(parent)?;
        }
    }
    Ok(())
}

pub fn load_sidecar_impl(pdf_path: &str) -> AppResult<Option<EldrawDocument>> {
    let path = sidecar_path(pdf_path);
    if !path.exists() {
        return Ok(None);
    }
    let bytes = fs::read(&path)?;
    let doc: EldrawDocument = serde_json::from_slice(&bytes)?;
    if doc.version != SUPPORTED_VERSION {
        return Err(AppError::Version(doc.version));
    }
    Ok(Some(doc))
}

pub fn save_sidecar_impl(pdf_path: &str, doc: &EldrawDocument) -> AppResult<()> {
    let final_path = sidecar_path(pdf_path);
    let tmp = tmp_path(pdf_path);
    ensure_parent(&final_path)?;
    let json = serde_json::to_vec_pretty(doc)?;
    fs::write(&tmp, &json)?;
    fs::rename(&tmp, &final_path)?;
    Ok(())
}

fn pid_alive(pid: u32) -> bool {
    let mut sys = System::new();
    sys.refresh_processes(
        sysinfo::ProcessesToUpdate::Some(&[Pid::from_u32(pid)]),
        true,
    );
    sys.process(Pid::from_u32(pid)).is_some()
}

fn iso_now() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs());
    format!("{secs}")
}

fn parse_lock_pid(contents: &str) -> Option<u32> {
    contents
        .lines()
        .next()
        .and_then(|l| l.trim().parse::<u32>().ok())
}

pub fn acquire_lock_impl(pdf_path: &str) -> AppResult<bool> {
    let path = lock_path(pdf_path);
    ensure_parent(&path)?;
    if path.exists() {
        let contents = fs::read_to_string(&path).unwrap_or_default();
        if let Some(existing_pid) = parse_lock_pid(&contents) {
            if existing_pid != std::process::id() && pid_alive(existing_pid) {
                return Ok(false);
            }
        }
    }
    let body = format!("{}\n{}\n", std::process::id(), iso_now());
    fs::write(&path, body)?;
    Ok(true)
}

pub fn release_lock_impl(pdf_path: &str) -> AppResult<()> {
    let path = lock_path(pdf_path);
    if path.exists() {
        fs::remove_file(&path)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn load_sidecar(pdf_path: String) -> AppResult<Option<EldrawDocument>> {
    load_sidecar_impl(&pdf_path)
}

#[tauri::command]
pub async fn save_sidecar(pdf_path: String, doc: EldrawDocument) -> AppResult<()> {
    save_sidecar_impl(&pdf_path, &doc)
}

#[tauri::command]
pub async fn acquire_lock(pdf_path: String) -> AppResult<bool> {
    acquire_lock_impl(&pdf_path)
}

#[tauri::command]
pub async fn release_lock(pdf_path: String) -> AppResult<()> {
    release_lock_impl(&pdf_path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::TempDir;

    fn sample_doc() -> EldrawDocument {
        EldrawDocument {
            version: 1,
            pdf_hash: "abc123".into(),
            pdf_path: Some("/tmp/foo.pdf".into()),
            pages: vec![
                json!({"pageIndex": 0, "type": "pdf", "width": 612.0, "height": 792.0, "objects": [], "insertedAfterPdfPage": null}),
            ],
            palettes: vec![],
            prefs: json!({}),
        }
    }

    fn pdf_str(dir: &TempDir, name: &str) -> String {
        dir.path().join(name).to_string_lossy().into_owned()
    }

    #[test]
    fn missing_sidecar_returns_none() {
        let dir = TempDir::new().unwrap();
        let pdf = pdf_str(&dir, "nope.pdf");
        assert!(load_sidecar_impl(&pdf).unwrap().is_none());
    }

    #[test]
    fn round_trip_save_load() {
        let dir = TempDir::new().unwrap();
        let pdf = pdf_str(&dir, "doc.pdf");
        let doc = sample_doc();
        save_sidecar_impl(&pdf, &doc).unwrap();
        let loaded = load_sidecar_impl(&pdf).unwrap().expect("doc");
        assert_eq!(loaded.version, doc.version);
        assert_eq!(loaded.pdf_hash, doc.pdf_hash);
        assert_eq!(loaded.pages.len(), 1);
    }

    #[test]
    fn save_does_not_leave_tmp() {
        let dir = TempDir::new().unwrap();
        let pdf = pdf_str(&dir, "doc.pdf");
        save_sidecar_impl(&pdf, &sample_doc()).unwrap();
        assert!(!tmp_path(&pdf).exists());
        assert!(sidecar_path(&pdf).exists());
    }

    #[test]
    fn unsupported_version_rejected() {
        let dir = TempDir::new().unwrap();
        let pdf = pdf_str(&dir, "doc.pdf");
        let mut doc = sample_doc();
        doc.version = 99;
        fs::write(sidecar_path(&pdf), serde_json::to_vec_pretty(&doc).unwrap()).unwrap();
        match load_sidecar_impl(&pdf) {
            Err(AppError::Version(99)) => {}
            other => panic!("expected Version(99), got {other:?}"),
        }
    }

    #[test]
    fn lock_acquire_release_reacquire() {
        let dir = TempDir::new().unwrap();
        let pdf = pdf_str(&dir, "doc.pdf");
        assert!(acquire_lock_impl(&pdf).unwrap());
        // Same-process re-acquire should succeed (we treat our own PID as reclaimable).
        assert!(acquire_lock_impl(&pdf).unwrap());
        release_lock_impl(&pdf).unwrap();
        assert!(!lock_path(&pdf).exists());
        assert!(acquire_lock_impl(&pdf).unwrap());
        release_lock_impl(&pdf).unwrap();
    }

    #[test]
    fn stale_lock_is_overwritten() {
        let dir = TempDir::new().unwrap();
        let pdf = pdf_str(&dir, "doc.pdf");
        // PID 0 is never a live user process on Linux; a very high PID is also
        // extremely unlikely to be alive during tests.
        let fake_pid: u32 = 4_000_000_000;
        fs::write(lock_path(&pdf), format!("{fake_pid}\nstale\n")).unwrap();
        assert!(acquire_lock_impl(&pdf).unwrap());
        let contents = fs::read_to_string(lock_path(&pdf)).unwrap();
        let pid = parse_lock_pid(&contents).unwrap();
        assert_eq!(pid, std::process::id());
        release_lock_impl(&pdf).unwrap();
    }

    #[test]
    fn live_foreign_pid_blocks_lock() {
        let dir = TempDir::new().unwrap();
        let pdf = pdf_str(&dir, "doc.pdf");
        // Spawn a child we know is alive, write its PID into the lock, then
        // try to acquire.
        let mut child = std::process::Command::new("sleep")
            .arg("30")
            .spawn()
            .expect("spawn sleep");
        fs::write(lock_path(&pdf), format!("{}\nx\n", child.id())).unwrap();
        let result = acquire_lock_impl(&pdf).unwrap();
        let _ = child.kill();
        let _ = child.wait();
        assert!(!result, "expected acquire to fail while foreign PID alive");
        let _ = fs::remove_file(lock_path(&pdf));
    }
}
