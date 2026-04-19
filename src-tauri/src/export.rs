use crate::error::{AppError, AppResult};
use crate::model::EldrawDocument;

#[tauri::command]
pub async fn export_flattened_pdf(
    pdf_path: String,
    doc: EldrawDocument,
    out_path: String,
) -> AppResult<()> {
    let _ = (pdf_path, doc, out_path);
    Err(AppError::NotImplemented("export_flattened_pdf"))
}
