//! Serialization-compatible mirrors of the TS types in `src/lib/types.ts`.
//! Keep this file in sync with the TS source of truth.

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct PdfMeta {
    pub path: String,
    pub hash: String,
    pub page_count: u32,
    pub pages: Vec<PageDims>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PageDims {
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EldrawDocument {
    pub version: u32,
    #[serde(rename = "pdfHash")]
    pub pdf_hash: String,
    #[serde(rename = "pdfPath")]
    pub pdf_path: Option<String>,
    pub pages: Vec<serde_json::Value>,
    pub palettes: Vec<serde_json::Value>,
    pub prefs: serde_json::Value,
}
