use crate::error::{AppError, AppResult};
use crate::model::PdfMeta;

#[tauri::command]
pub async fn open_pdf(path: String) -> AppResult<PdfMeta> {
    let _ = path;
    Err(AppError::NotImplemented("open_pdf"))
}

#[tauri::command]
pub async fn render_page(page_index: u32, scale: f32) -> AppResult<Vec<u8>> {
    let _ = (page_index, scale);
    Err(AppError::NotImplemented("render_page"))
}
