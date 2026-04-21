//! Session sidecar storage.
//!
//! Layout:
//! ```text
//! <pdf_path>.eldraw-sessions/
//!   <session_id>/
//!     events.json
//!     audio.webm
//! ```
//!
//! All I/O is confined to `<pdf_path>.eldraw-sessions/`. Session IDs are
//! validated against an allow-list regex to prevent path traversal.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

const AUDIO_FILE: &str = "audio.webm";
const EVENTS_FILE: &str = "events.json";

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMeta {
    pub id: String,
    pub name: String,
    pub created_at: i64,
    pub duration_ms: i64,
    pub audio_file: String,
    pub audio_mime: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    #[serde(flatten)]
    pub meta: SessionMeta,
    pub events: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionListEntry {
    #[serde(flatten)]
    pub meta: SessionMeta,
    pub has_audio: bool,
}

fn valid_session_id(id: &str) -> bool {
    if id.is_empty() || id.len() > 128 {
        return false;
    }
    id.chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn sessions_root(pdf_path: &str) -> PathBuf {
    PathBuf::from(format!("{pdf_path}.eldraw-sessions"))
}

fn session_dir(pdf_path: &str, session_id: &str) -> AppResult<PathBuf> {
    if !valid_session_id(session_id) {
        return Err(AppError::InvalidInput(format!(
            "invalid session id: {session_id}"
        )));
    }
    Ok(sessions_root(pdf_path).join(session_id))
}

fn ensure_dir(path: &Path) -> AppResult<()> {
    if !path.exists() {
        fs::create_dir_all(path)?;
    }
    Ok(())
}

pub fn list_sessions_impl(pdf_path: &str) -> AppResult<Vec<SessionListEntry>> {
    let root = sessions_root(pdf_path);
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for entry in fs::read_dir(&root)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let dir = entry.path();
        let events_path = dir.join(EVENTS_FILE);
        if !events_path.exists() {
            continue;
        }
        let Ok(bytes) = fs::read(&events_path) else {
            continue;
        };
        let Ok(session) = serde_json::from_slice::<Session>(&bytes) else {
            continue;
        };
        let has_audio = dir.join(&session.meta.audio_file).exists();
        out.push(SessionListEntry {
            meta: session.meta,
            has_audio,
        });
    }
    out.sort_by_key(|b| std::cmp::Reverse(b.meta.created_at));
    Ok(out)
}

pub fn read_session_impl(pdf_path: &str, session_id: &str) -> AppResult<Session> {
    let dir = session_dir(pdf_path, session_id)?;
    let bytes = fs::read(dir.join(EVENTS_FILE))?;
    let session: Session = serde_json::from_slice(&bytes)?;
    Ok(session)
}

pub fn write_session_impl(pdf_path: &str, session_id: &str, session: &Session) -> AppResult<()> {
    if session.meta.id != session_id {
        return Err(AppError::InvalidInput(
            "session id mismatch between path and body".into(),
        ));
    }
    let dir = session_dir(pdf_path, session_id)?;
    ensure_dir(&dir)?;
    let events_path = dir.join(EVENTS_FILE);
    let tmp = dir.join(format!("{EVENTS_FILE}.tmp"));
    let json = serde_json::to_vec_pretty(session)?;
    if let Err(e) = fs::write(&tmp, &json) {
        let _ = fs::remove_file(&tmp);
        return Err(e.into());
    }
    if let Err(e) = fs::rename(&tmp, &events_path) {
        let _ = fs::remove_file(&tmp);
        return Err(e.into());
    }
    Ok(())
}

pub fn write_audio_chunk_impl(
    pdf_path: &str,
    session_id: &str,
    bytes: &[u8],
    reset: bool,
) -> AppResult<()> {
    let dir = session_dir(pdf_path, session_id)?;
    ensure_dir(&dir)?;
    let path = dir.join(AUDIO_FILE);
    if reset && path.exists() {
        fs::remove_file(&path)?;
    }
    let mut f = OpenOptions::new().create(true).append(true).open(&path)?;
    f.write_all(bytes)?;
    Ok(())
}

pub fn read_audio_impl(pdf_path: &str, session_id: &str) -> AppResult<Vec<u8>> {
    let dir = session_dir(pdf_path, session_id)?;
    let path = dir.join(AUDIO_FILE);
    if !path.exists() {
        return Ok(Vec::new());
    }
    Ok(fs::read(&path)?)
}

pub fn delete_session_impl(pdf_path: &str, session_id: &str) -> AppResult<()> {
    let dir = session_dir(pdf_path, session_id)?;
    if dir.exists() {
        fs::remove_dir_all(&dir)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn list_sessions(pdf_path: String) -> AppResult<Vec<SessionListEntry>> {
    list_sessions_impl(&pdf_path)
}

#[tauri::command]
pub async fn read_session(pdf_path: String, session_id: String) -> AppResult<Session> {
    read_session_impl(&pdf_path, &session_id)
}

#[tauri::command]
pub async fn write_session(
    pdf_path: String,
    session_id: String,
    session: Session,
) -> AppResult<()> {
    write_session_impl(&pdf_path, &session_id, &session)
}

#[tauri::command]
pub async fn write_audio_chunk(
    pdf_path: String,
    session_id: String,
    bytes: Vec<u8>,
    reset: bool,
) -> AppResult<()> {
    write_audio_chunk_impl(&pdf_path, &session_id, &bytes, reset)
}

#[tauri::command]
pub async fn read_session_audio(pdf_path: String, session_id: String) -> AppResult<Vec<u8>> {
    read_audio_impl(&pdf_path, &session_id)
}

#[tauri::command]
pub async fn delete_session(pdf_path: String, session_id: String) -> AppResult<()> {
    delete_session_impl(&pdf_path, &session_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn pdf(dir: &TempDir, name: &str) -> String {
        dir.path().join(name).to_string_lossy().into_owned()
    }

    fn sample(id: &str) -> Session {
        Session {
            meta: SessionMeta {
                id: id.into(),
                name: "Sample".into(),
                created_at: 1_700_000_000,
                duration_ms: 5_000,
                audio_file: AUDIO_FILE.into(),
                audio_mime: "audio/webm;codecs=opus".into(),
            },
            events: vec![serde_json::json!({"kind":"pageChange","t":0,"page":0})],
        }
    }

    #[test]
    fn write_read_round_trip() {
        let dir = TempDir::new().unwrap();
        let pdf = pdf(&dir, "doc.pdf");
        let s = sample("abc-123");
        write_session_impl(&pdf, "abc-123", &s).unwrap();
        let loaded = read_session_impl(&pdf, "abc-123").unwrap();
        assert_eq!(loaded.meta.id, "abc-123");
        assert_eq!(loaded.events.len(), 1);
    }

    #[test]
    fn list_sessions_sorted_newest_first() {
        let dir = TempDir::new().unwrap();
        let pdf = pdf(&dir, "doc.pdf");
        let mut a = sample("aaa");
        a.meta.created_at = 100;
        let mut b = sample("bbb");
        b.meta.created_at = 200;
        write_session_impl(&pdf, "aaa", &a).unwrap();
        write_session_impl(&pdf, "bbb", &b).unwrap();
        let list = list_sessions_impl(&pdf).unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].meta.id, "bbb");
        assert_eq!(list[1].meta.id, "aaa");
    }

    #[test]
    fn missing_root_returns_empty() {
        let dir = TempDir::new().unwrap();
        let pdf = pdf(&dir, "nope.pdf");
        assert!(list_sessions_impl(&pdf).unwrap().is_empty());
    }

    #[test]
    fn rejects_traversal_ids() {
        let dir = TempDir::new().unwrap();
        let pdf = pdf(&dir, "doc.pdf");
        assert!(write_audio_chunk_impl(&pdf, "..", b"x", true).is_err());
        assert!(write_audio_chunk_impl(&pdf, "a/b", b"x", true).is_err());
        assert!(write_audio_chunk_impl(&pdf, "", b"x", true).is_err());
    }

    #[test]
    fn audio_chunks_append_unless_reset() {
        let dir = TempDir::new().unwrap();
        let pdf = pdf(&dir, "doc.pdf");
        write_audio_chunk_impl(&pdf, "sid", b"abc", true).unwrap();
        write_audio_chunk_impl(&pdf, "sid", b"def", false).unwrap();
        let bytes = read_audio_impl(&pdf, "sid").unwrap();
        assert_eq!(bytes, b"abcdef");

        write_audio_chunk_impl(&pdf, "sid", b"zz", true).unwrap();
        let bytes = read_audio_impl(&pdf, "sid").unwrap();
        assert_eq!(bytes, b"zz");
    }

    #[test]
    fn delete_removes_dir() {
        let dir = TempDir::new().unwrap();
        let pdf = pdf(&dir, "doc.pdf");
        write_session_impl(&pdf, "sid", &sample("sid")).unwrap();
        write_audio_chunk_impl(&pdf, "sid", b"abc", true).unwrap();
        delete_session_impl(&pdf, "sid").unwrap();
        assert!(list_sessions_impl(&pdf).unwrap().is_empty());
    }

    #[test]
    fn write_rejects_id_mismatch() {
        let dir = TempDir::new().unwrap();
        let pdf = pdf(&dir, "doc.pdf");
        let s = sample("good");
        let err = write_session_impl(&pdf, "other", &s).unwrap_err();
        match err {
            AppError::InvalidInput(_) => {}
            _ => panic!("expected InvalidInput"),
        }
    }
}
