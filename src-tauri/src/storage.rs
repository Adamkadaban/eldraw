use crate::error::{AppError, AppResult};
use crate::model::EldrawDocument;

#[tauri::command]
pub async fn load_sidecar(pdf_path: String) -> AppResult<Option<EldrawDocument>> {
    let _ = pdf_path;
    Err(AppError::NotImplemented("load_sidecar"))
}

#[tauri::command]
pub async fn save_sidecar(pdf_path: String, doc: EldrawDocument) -> AppResult<()> {
    let _ = (pdf_path, doc);
    Err(AppError::NotImplemented("save_sidecar"))
}
