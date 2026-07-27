//! Sidecar persistence and cross-process locking.
//!
//! Sidecar path convention: `"{pdf_path}.eldraw.json"`.
//! Lock file:               `"{pdf_path}.eldraw.lock"`.
//! Writes go via `"{pdf_path}.eldraw.json.tmp"` + rename for atomicity.

use std::collections::HashMap;
use std::fs::{self, File, OpenOptions, TryLockError};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::error::{AppError, AppResult};
use crate::model::EldrawDocument;

const SUPPORTED_VERSION: u32 = 1;
static HELD_LOCKS: OnceLock<Mutex<HashMap<PathBuf, File>>> = OnceLock::new();

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
    // Write to tmp first; on any subsequent failure, remove tmp so we don't
    // leave a partial file lying next to the PDF.
    if let Err(e) = fs::write(&tmp, &json) {
        let _ = fs::remove_file(&tmp);
        return Err(e.into());
    }
    if let Err(e) = fs::rename(&tmp, &final_path) {
        let _ = fs::remove_file(&tmp);
        return Err(e.into());
    }
    Ok(())
}

fn iso_now() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs());
    format!("{secs}")
}

fn held_locks() -> &'static Mutex<HashMap<PathBuf, File>> {
    HELD_LOCKS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn acquire_lock_impl(pdf_path: &str) -> AppResult<bool> {
    let path = lock_path(pdf_path);
    ensure_parent(&path)?;
    let body = format!("{}\n{}\n", std::process::id(), iso_now());
    let mut locks = held_locks()
        .lock()
        .map_err(|_| std::io::Error::other("lock registry poisoned"))?;
    if locks.contains_key(&path) {
        return Ok(true);
    }

    let mut file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(&path)?;
    match file.try_lock() {
        Ok(()) => {
            file.set_len(0)?;
            file.write_all(body.as_bytes())?;
            file.sync_data()?;
            // OS locks live as long as their file handle, so retain it until release.
            locks.insert(path, file);
            Ok(true)
        }
        Err(TryLockError::WouldBlock) => Ok(false),
        Err(TryLockError::Error(error)) => Err(error.into()),
    }
}

pub fn release_lock_impl(pdf_path: &str) -> AppResult<()> {
    let path = lock_path(pdf_path);
    let mut locks = held_locks()
        .lock()
        .map_err(|_| std::io::Error::other("lock registry poisoned"))?;
    if let Some(file) = locks.remove(&path) {
        file.unlock()?;
    }
    // Keep the path: deleting after unlock could unlink a lock another process just acquired.
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
    use std::process::{Child, Command, Stdio};
    use std::thread;
    use std::time::{Duration, Instant};
    use tempfile::TempDir;

    fn sample_doc() -> EldrawDocument {
        serde_json::from_value(json!({
            "version": 1,
            "pdfHash": "abc123",
            "pdfPath": "/example/foo.pdf",
            "pages": [
                {"pageIndex": 0, "type": "pdf", "pdfSourceIndex": 0, "width": 612.0, "height": 792.0, "objects": [], "insertedAfterPdfPage": null}
            ],
            "palettes": [],
            "prefs": {},
        }))
        .unwrap()
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
        // Same-process re-acquire is idempotent.
        assert!(acquire_lock_impl(&pdf).unwrap());
        release_lock_impl(&pdf).unwrap();
        assert!(lock_path(&pdf).exists());
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
        let pid = contents.lines().next().unwrap().parse::<u32>().unwrap();
        assert_eq!(pid, std::process::id());
        release_lock_impl(&pdf).unwrap();
    }

    #[test]
    fn stale_lock_race_child() {
        let Ok(pdf) = std::env::var("ELDRAW_LOCK_RACE_PDF") else {
            return;
        };
        let ready = PathBuf::from(std::env::var("ELDRAW_LOCK_RACE_READY").unwrap());
        let start = PathBuf::from(std::env::var("ELDRAW_LOCK_RACE_START").unwrap());
        let finish = PathBuf::from(std::env::var("ELDRAW_LOCK_RACE_FINISH").unwrap());
        let winner = PathBuf::from(std::env::var("ELDRAW_LOCK_RACE_WINNER").unwrap());

        fs::write(&ready, []).unwrap();
        let deadline = Instant::now() + Duration::from_secs(10);
        while !start.exists() {
            assert!(
                Instant::now() < deadline,
                "timed out waiting for race start"
            );
            thread::sleep(Duration::from_millis(1));
        }

        if acquire_lock_impl(&pdf).unwrap() {
            fs::write(&winner, []).unwrap();
            let deadline = Instant::now() + Duration::from_secs(10);
            while !finish.exists() {
                assert!(
                    Instant::now() < deadline,
                    "timed out waiting for race finish"
                );
                thread::sleep(Duration::from_millis(1));
            }
            release_lock_impl(&pdf).unwrap();
        }
    }

    #[test]
    fn stale_lock_reclaim_has_exactly_one_winner() {
        const CONTENDERS: usize = 12;

        let dir = TempDir::new().unwrap();
        let pdf = pdf_str(&dir, "race.pdf");
        let fake_pid: u32 = 4_000_000_000;
        fs::write(lock_path(&pdf), format!("{fake_pid}\nstale\n")).unwrap();

        let start = dir.path().join("start");
        let finish = dir.path().join("finish");
        let test_binary = std::env::current_exe().unwrap();
        let mut children: Vec<(Child, PathBuf)> = Vec::with_capacity(CONTENDERS);

        for index in 0..CONTENDERS {
            let ready = dir.path().join(format!("ready-{index}"));
            let winner = dir.path().join(format!("winner-{index}"));
            let child = Command::new(&test_binary)
                .args(["--exact", "storage::tests::stale_lock_race_child"])
                .env("ELDRAW_LOCK_RACE_PDF", &pdf)
                .env("ELDRAW_LOCK_RACE_READY", &ready)
                .env("ELDRAW_LOCK_RACE_START", &start)
                .env("ELDRAW_LOCK_RACE_FINISH", &finish)
                .env("ELDRAW_LOCK_RACE_WINNER", &winner)
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .unwrap();
            children.push((child, winner));

            let deadline = Instant::now() + Duration::from_secs(10);
            while !ready.exists() {
                assert!(
                    Instant::now() < deadline,
                    "child {index} did not become ready"
                );
                thread::sleep(Duration::from_millis(1));
            }
        }

        fs::write(&start, []).unwrap();
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            let mut completed = 0;
            for (child, winner) in &mut children {
                if winner.exists() || child.try_wait().unwrap().is_some() {
                    completed += 1;
                }
            }
            if completed == CONTENDERS {
                break;
            }
            assert!(Instant::now() < deadline, "lock contenders did not finish");
            thread::sleep(Duration::from_millis(1));
        }

        let winners = children
            .iter()
            .filter(|(_, winner)| winner.exists())
            .count();
        fs::write(&finish, []).unwrap();
        for (mut child, _) in children {
            assert!(child.wait().unwrap().success());
        }

        assert_eq!(winners, 1, "only one process may reclaim a stale lock");
    }

    #[test]
    fn live_foreign_process_lock_blocks_acquisition() {
        let dir = TempDir::new().unwrap();
        let pdf = pdf_str(&dir, "doc.pdf");
        let ready = dir.path().join("ready");
        let start = dir.path().join("start");
        let finish = dir.path().join("finish");
        let winner = dir.path().join("winner");
        fs::write(&start, []).unwrap();

        let mut child = Command::new(std::env::current_exe().unwrap())
            .args(["--exact", "storage::tests::stale_lock_race_child"])
            .env("ELDRAW_LOCK_RACE_PDF", &pdf)
            .env("ELDRAW_LOCK_RACE_READY", &ready)
            .env("ELDRAW_LOCK_RACE_START", &start)
            .env("ELDRAW_LOCK_RACE_FINISH", &finish)
            .env("ELDRAW_LOCK_RACE_WINNER", &winner)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        let deadline = Instant::now() + Duration::from_secs(10);
        while !winner.exists() {
            assert!(Instant::now() < deadline, "child did not acquire lock");
            thread::sleep(Duration::from_millis(1));
        }

        assert!(!acquire_lock_impl(&pdf).unwrap());

        fs::write(&finish, []).unwrap();
        assert!(child.wait().unwrap().success());
    }
}
