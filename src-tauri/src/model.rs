//! Serialization-compatible mirrors of the TS types in `src/lib/types.ts`.
//! Keep this file in sync with the TS source of truth.
//!
//! All structs use `rename_all = "camelCase"` so Rust's `snake_case` field
//! names serialize as the `camelCase` keys the frontend expects.

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfMeta {
    pub path: String,
    pub hash: String,
    pub page_count: u32,
    pub pages: Vec<PageDims>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageDims {
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EldrawDocument {
    pub version: u32,
    pub pdf_hash: String,
    pub pdf_path: Option<String>,
    pub pages: Vec<serde_json::Value>,
    pub palettes: Vec<serde_json::Value>,
    pub prefs: serde_json::Value,
}
