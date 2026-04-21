//! Multi-monitor presenter window (issue #21).
//!
//! A second `WebviewWindow` loads the `/presenter` route and subscribes to
//! sync events emitted from the primary window. The presenter is a pure
//! consumer: no autosave, no input, no tool state. It reuses the
//! process-wide `AppState` so `render_page` hits the already-loaded PDF
//! bytes/hash instead of loading them a second time.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

use crate::error::{AppError, AppResult};

pub const PRESENTER_LABEL: &str = "presenter";
pub const PRESENTER_SYNC_EVENT: &str = "presenter-sync";
pub const PRESENTER_WINDOW_CLOSED_EVENT: &str = "presenter-window-closed";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PresenterSyncPayload {
    pub pdf_id: Option<String>,
    pub page_index: u32,
    pub document: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub index: usize,
    pub name: Option<String>,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
    pub is_primary: bool,
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn list_monitors(app: AppHandle) -> AppResult<Vec<MonitorInfo>> {
    let monitors = app.available_monitors()?;
    let primary = app.primary_monitor().ok().flatten();
    let primary_key = primary.as_ref().map(monitor_key);

    Ok(monitors
        .iter()
        .enumerate()
        .map(|(index, m)| {
            let pos = m.position();
            let size = m.size();
            let is_primary = primary_key.as_ref().is_some_and(|k| k == &monitor_key(m));
            MonitorInfo {
                index,
                name: m.name().cloned(),
                x: pos.x,
                y: pos.y,
                width: size.width,
                height: size.height,
                scale_factor: m.scale_factor(),
                is_primary,
            }
        })
        .collect())
}

fn monitor_key(m: &tauri::Monitor) -> (i32, i32, u32, u32) {
    let p = m.position();
    let s = m.size();
    (p.x, p.y, s.width, s.height)
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn open_presenter_window(app: AppHandle, monitor_index: Option<usize>) -> AppResult<()> {
    if let Some(existing) = app.get_webview_window(PRESENTER_LABEL) {
        existing.set_focus().ok();
        return Ok(());
    }

    let mut builder =
        WebviewWindowBuilder::new(&app, PRESENTER_LABEL, WebviewUrl::App("presenter".into()))
            .title("eldraw presenter")
            .decorations(false)
            .resizable(true)
            .visible(false);

    if let Some(idx) = monitor_index {
        let monitors = app.available_monitors()?;
        if let Some(m) = monitors.get(idx) {
            let pos = m.position();
            let size = m.size();
            builder = builder
                .position(f64::from(pos.x), f64::from(pos.y))
                .inner_size(f64::from(size.width), f64::from(size.height));
        }
    }

    let window = builder.build()?;
    let app_handle = app.clone();
    window.on_window_event(move |event| {
        if matches!(
            event,
            WindowEvent::Destroyed | WindowEvent::CloseRequested { .. }
        ) {
            let _ = app_handle.emit(PRESENTER_WINDOW_CLOSED_EVENT, ());
        }
    });
    window.set_fullscreen(true).ok();
    window.show()?;
    Ok(())
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn close_presenter_window(app: AppHandle) -> AppResult<()> {
    if let Some(w) = app.get_webview_window(PRESENTER_LABEL) {
        w.close()?;
    }
    app.emit(PRESENTER_WINDOW_CLOSED_EVENT, ())
        .map_err(|e| AppError::Window(format!("emit {PRESENTER_WINDOW_CLOSED_EVENT}: {e}")))?;
    Ok(())
}

/// Forward a sync payload from the primary window to the presenter window.
/// No-op if the presenter window is not open.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn presenter_sync(app: AppHandle, payload: PresenterSyncPayload) -> AppResult<()> {
    let Some(window) = app.get_webview_window(PRESENTER_LABEL) else {
        return Ok(());
    };
    window
        .emit(PRESENTER_SYNC_EVENT, &payload)
        .map_err(|e| AppError::Window(format!("emit {PRESENTER_SYNC_EVENT}: {e}")))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sync_payload_uses_camel_case_keys() {
        let payload = PresenterSyncPayload {
            pdf_id: Some("abc123".into()),
            page_index: 7,
            document: Some(serde_json::json!({ "pages": [] })),
        };
        let json = serde_json::to_value(&payload).unwrap();
        assert_eq!(json["pdfId"], "abc123");
        assert_eq!(json["pageIndex"], 7);
        assert!(json["document"].is_object());
        assert!(json.get("pdf_id").is_none());
        assert!(json.get("page_index").is_none());
    }

    #[test]
    fn sync_payload_null_document_is_preserved() {
        let payload = PresenterSyncPayload {
            pdf_id: None,
            page_index: 0,
            document: None,
        };
        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("\"pdfId\":null"));
        assert!(json.contains("\"document\":null"));
    }

    #[test]
    fn sync_payload_roundtrips() {
        let payload = PresenterSyncPayload {
            pdf_id: Some("h".into()),
            page_index: 3,
            document: Some(serde_json::json!({ "version": 1 })),
        };
        let ser = serde_json::to_string(&payload).unwrap();
        let back: PresenterSyncPayload = serde_json::from_str(&ser).unwrap();
        assert_eq!(back, payload);
    }
}
