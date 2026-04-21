mod error;
mod export;
mod model;
mod page_cache;
mod pdf;
mod state;
mod storage;
mod thumbnails;

pub use error::{AppError, AppResult};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(state::AppState::default())
        .manage(thumbnails::ThumbnailCache::default())
        .manage(page_cache::PageCache::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            pdf::open_pdf,
            pdf::render_page,
            thumbnails::render_pdf_thumbnail,
            storage::load_sidecar,
            storage::save_sidecar,
            storage::acquire_lock,
            storage::release_lock,
            export::export_flattened_pdf,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
