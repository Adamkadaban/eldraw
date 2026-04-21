//! Detached sidebar window (issues #38, #28).
//!
//! A second `WebviewWindow` loads the `/sidebar-window` route and mirrors
//! the sidebar state of the main window. The payload is an opaque
//! `serde_json::Value` so the Rust side doesn't have to mirror the TS
//! `SidebarState` shape — it's a pure relay.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

use crate::error::{AppError, AppResult};

pub const SIDEBAR_WINDOW_LABEL: &str = "sidebar-window";
pub const MAIN_WINDOW_LABEL: &str = "main";
pub const SIDEBAR_SYNC_EVENT: &str = "sidebar-sync";
pub const SIDEBAR_SYNC_BACK_EVENT: &str = "sidebar-sync-back";
pub const SIDEBAR_WINDOW_CLOSED_EVENT: &str = "sidebar-window-closed";

const DEFAULT_WIDTH: f64 = 260.0;
const DEFAULT_HEIGHT: f64 = 700.0;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(transparent)]
pub struct SidebarSyncPayload(pub serde_json::Value);

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn open_sidebar_window(app: AppHandle) -> AppResult<()> {
    if let Some(existing) = app.get_webview_window(SIDEBAR_WINDOW_LABEL) {
        existing.set_focus().ok();
        return Ok(());
    }

    let window = WebviewWindowBuilder::new(
        &app,
        SIDEBAR_WINDOW_LABEL,
        WebviewUrl::App("sidebar-window".into()),
    )
    .title("eldraw sidebar")
    .decorations(true)
    .resizable(true)
    .inner_size(DEFAULT_WIDTH, DEFAULT_HEIGHT)
    .min_inner_size(220.0, 400.0)
    .visible(true)
    .build()?;

    let app_handle = app.clone();
    window.on_window_event(move |event| {
        if matches!(
            event,
            WindowEvent::Destroyed | WindowEvent::CloseRequested { .. }
        ) {
            let _ = app_handle.emit(SIDEBAR_WINDOW_CLOSED_EVENT, ());
        }
    });
    Ok(())
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn close_sidebar_window(app: AppHandle) -> AppResult<()> {
    if let Some(w) = app.get_webview_window(SIDEBAR_WINDOW_LABEL) {
        w.close()?;
    }
    app.emit(SIDEBAR_WINDOW_CLOSED_EVENT, ())
        .map_err(|e| AppError::Window(format!("emit {SIDEBAR_WINDOW_CLOSED_EVENT}: {e}")))?;
    Ok(())
}

/// Forward a sidebar state snapshot from the main window to the detached
/// window. No-op if the detached window is not open.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn sidebar_sync(app: AppHandle, payload: SidebarSyncPayload) -> AppResult<()> {
    let Some(window) = app.get_webview_window(SIDEBAR_WINDOW_LABEL) else {
        return Ok(());
    };
    window
        .emit(SIDEBAR_SYNC_EVENT, &payload)
        .map_err(|e| AppError::Window(format!("emit {SIDEBAR_SYNC_EVENT}: {e}")))?;
    Ok(())
}

/// Forward a sidebar state snapshot from the detached window back to the
/// main window.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn sidebar_sync_back(app: AppHandle, payload: SidebarSyncPayload) -> AppResult<()> {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return Ok(());
    };
    window
        .emit(SIDEBAR_SYNC_BACK_EVENT, &payload)
        .map_err(|e| AppError::Window(format!("emit {SIDEBAR_SYNC_BACK_EVENT}: {e}")))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sync_payload_is_transparent() {
        let payload = SidebarSyncPayload(serde_json::json!({
            "activeTool": "pen",
            "pinned": true,
        }));
        let json = serde_json::to_value(&payload).unwrap();
        assert_eq!(json["activeTool"], "pen");
        assert_eq!(json["pinned"], true);
    }

    #[test]
    fn sync_payload_roundtrips() {
        let payload = SidebarSyncPayload(serde_json::json!({
            "activeTool": "highlighter",
            "activeColor": "#fdd835",
            "presets": [],
        }));
        let ser = serde_json::to_string(&payload).unwrap();
        let back: SidebarSyncPayload = serde_json::from_str(&ser).unwrap();
        assert_eq!(back, payload);
    }

    #[test]
    fn event_names_are_stable() {
        assert_eq!(SIDEBAR_WINDOW_LABEL, "sidebar-window");
        assert_eq!(SIDEBAR_SYNC_EVENT, "sidebar-sync");
        assert_eq!(SIDEBAR_SYNC_BACK_EVENT, "sidebar-sync-back");
        assert_eq!(SIDEBAR_WINDOW_CLOSED_EVENT, "sidebar-window-closed");
    }
}
