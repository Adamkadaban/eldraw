//! Google Slides URL parsing and PDF export fetching.
//!
//! The public entry point [`parse_slides_url`] extracts the deck identifier
//! from the common share / present / pub / embed URL shapes. The command
//! [`fetch_slides_pdf`] downloads the deck via the public `export/pdf`
//! endpoint and writes it to the app's data directory so the existing
//! `open_pdf` pipeline can consume the file like any other local PDF.

use std::path::PathBuf;
use std::time::Duration;

use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};

/// A Google Slides deck identifier along with its variant.
///
/// The `/d/e/{id}` shape uses a *published* key that is distinct from the
/// normal document id: it only works against the `/pub?output=pdf` endpoint
/// and will 404 on `/export/pdf`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SlidesId {
    pub id: String,
    pub variant: SlidesVariant,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SlidesVariant {
    /// Standard document id (`/presentation/d/{ID}/...`).
    Document,
    /// Published key (`/presentation/d/e/{ID}/pub...`).
    Published,
}

impl SlidesId {
    /// The preferred export URL for this id.
    #[must_use]
    pub fn export_url(&self) -> String {
        match self.variant {
            SlidesVariant::Document => {
                format!(
                    "https://docs.google.com/presentation/d/{}/export/pdf",
                    self.id
                )
            }
            SlidesVariant::Published => format!(
                "https://docs.google.com/presentation/d/e/{}/pub?output=pdf",
                self.id
            ),
        }
    }

    /// Fallback URL to try if [`Self::export_url`] returns 404. Only the
    /// `Document` variant has a sensible fallback (the `/pub?output=pdf`
    /// shape); for `Published` decks the published URL is already the one
    /// the server exposes.
    #[must_use]
    pub fn fallback_url(&self) -> Option<String> {
        match self.variant {
            SlidesVariant::Document => Some(format!(
                "https://docs.google.com/presentation/d/{}/pub?output=pdf",
                self.id
            )),
            SlidesVariant::Published => None,
        }
    }
}

/// Parse a Google Slides URL and return the deck id + variant.
///
/// Accepts:
/// - `https://docs.google.com/presentation/d/{ID}/edit[...]`
/// - `https://docs.google.com/presentation/d/{ID}/present[...]`
/// - `https://docs.google.com/presentation/d/{ID}/pub[...]`
/// - `https://docs.google.com/presentation/d/{ID}/embed[...]`
/// - `https://docs.google.com/presentation/d/{ID}/export/pdf`
/// - `https://docs.google.com/presentation/d/e/{ID}/pub[...]` (published)
///
/// Trailing `?query` and `#fragment` are ignored. A bare
/// `/presentation/d/{ID}` (no trailing segment) is also accepted.
pub fn parse_slides_url(input: &str) -> AppResult<SlidesId> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidInput("empty URL".into()));
    }

    let without_scheme = trimmed
        .strip_prefix("https://")
        .or_else(|| trimmed.strip_prefix("http://"))
        .ok_or_else(|| AppError::InvalidInput("URL must start with http(s)://".into()))?;

    let path_start = without_scheme
        .find('/')
        .ok_or_else(|| AppError::InvalidInput("URL has no path".into()))?;
    let host = &without_scheme[..path_start];
    if !host.eq_ignore_ascii_case("docs.google.com") {
        return Err(AppError::InvalidInput(format!(
            "not a docs.google.com URL (host: {host})"
        )));
    }

    let path = &without_scheme[path_start..];
    let path = path.split(['?', '#']).next().unwrap_or(path);

    let rest = path
        .strip_prefix("/presentation/d/")
        .ok_or_else(|| AppError::InvalidInput("not a Google Slides URL".into()))?;

    let (variant, id_and_rest) = if let Some(remainder) = rest.strip_prefix("e/") {
        (SlidesVariant::Published, remainder)
    } else {
        (SlidesVariant::Document, rest)
    };

    let id = id_and_rest
        .split('/')
        .next()
        .unwrap_or("")
        .trim()
        .to_string();
    if id.is_empty() {
        return Err(AppError::InvalidInput("missing deck id".into()));
    }
    if !id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(AppError::InvalidInput(format!(
            "deck id contains unexpected characters: {id}"
        )));
    }

    Ok(SlidesId { id, variant })
}

fn safe_filename_stem(id: &str) -> String {
    id.chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect()
}

async fn download(url: &str) -> AppResult<reqwest::Response> {
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(60))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| AppError::InvalidInput(format!("http client: {e}")))?;

    client
        .get(url)
        .send()
        .await
        .map_err(|e| AppError::InvalidInput(format!("network error: {e}")))
}

async fn fetch_bytes(id: &SlidesId) -> AppResult<Vec<u8>> {
    let primary = id.export_url();
    let response = download(&primary).await?;

    let response = if response.status() == reqwest::StatusCode::NOT_FOUND {
        if let Some(fallback) = id.fallback_url() {
            download(&fallback).await?
        } else {
            response
        }
    } else {
        response
    };

    let status = response.status();
    if status == reqwest::StatusCode::FORBIDDEN || status == reqwest::StatusCode::UNAUTHORIZED {
        return Err(AppError::InvalidInput(
            "deck is not publicly accessible (403/401). Share it as \"Anyone with the link\" \
             or publish it to the web first."
                .into(),
        ));
    }
    if status == reqwest::StatusCode::NOT_FOUND {
        return Err(AppError::InvalidInput(
            "deck not found (404). Check that the link is correct and the deck still exists."
                .into(),
        ));
    }
    if !status.is_success() {
        return Err(AppError::InvalidInput(format!(
            "unexpected HTTP status {status} while downloading slides"
        )));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| AppError::InvalidInput(format!("read body: {e}")))?;

    if !bytes.starts_with(b"%PDF-") {
        return Err(AppError::InvalidInput(
            "server response was not a PDF (the deck may require sign-in)".into(),
        ));
    }

    Ok(bytes.to_vec())
}

fn slides_cache_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Window(format!("app_data_dir: {e}")))?;
    let dir = base.join("slides");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

#[tauri::command]
pub async fn fetch_slides_pdf(app: AppHandle, url: String) -> AppResult<String> {
    let id = parse_slides_url(&url)?;
    let bytes = fetch_bytes(&id).await?;

    let dir = slides_cache_dir(&app)?;
    let file = dir.join(format!("{}.pdf", safe_filename_stem(&id.id)));
    std::fs::write(&file, &bytes)?;

    Ok(file.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(url: &str) -> SlidesId {
        parse_slides_url(url).expect("should parse")
    }

    #[test]
    fn parses_edit_url() {
        let id = parse("https://docs.google.com/presentation/d/ABC_def-123/edit");
        assert_eq!(id.id, "ABC_def-123");
        assert_eq!(id.variant, SlidesVariant::Document);
    }

    #[test]
    fn parses_edit_with_fragment_and_query() {
        let id = parse(
            "https://docs.google.com/presentation/d/ABC_def-123/edit?usp=sharing#slide=id.p1",
        );
        assert_eq!(id.id, "ABC_def-123");
    }

    #[test]
    fn parses_present_url() {
        let id = parse("https://docs.google.com/presentation/d/DECKID/present?slide=id.p3");
        assert_eq!(id.id, "DECKID");
        assert_eq!(id.variant, SlidesVariant::Document);
    }

    #[test]
    fn parses_pub_url() {
        let id = parse("https://docs.google.com/presentation/d/DECKID/pub?start=false");
        assert_eq!(id.id, "DECKID");
        assert_eq!(id.variant, SlidesVariant::Document);
    }

    #[test]
    fn parses_published_de_url() {
        let id = parse("https://docs.google.com/presentation/d/e/2PACX-1vPUBKEY/pub?start=false");
        assert_eq!(id.id, "2PACX-1vPUBKEY");
        assert_eq!(id.variant, SlidesVariant::Published);
    }

    #[test]
    fn parses_embed_url() {
        let id = parse("https://docs.google.com/presentation/d/DECKID/embed");
        assert_eq!(id.id, "DECKID");
    }

    #[test]
    fn parses_bare_url() {
        let id = parse("https://docs.google.com/presentation/d/DECKID");
        assert_eq!(id.id, "DECKID");
    }

    #[test]
    fn rejects_non_slides_google_url() {
        assert!(parse_slides_url("https://docs.google.com/document/d/DECKID/edit").is_err());
    }

    #[test]
    fn rejects_non_google_host() {
        assert!(parse_slides_url("https://evil.example.com/presentation/d/DECKID/edit").is_err());
    }

    #[test]
    fn rejects_missing_id() {
        assert!(parse_slides_url("https://docs.google.com/presentation/d//edit").is_err());
        assert!(parse_slides_url("https://docs.google.com/presentation/d/").is_err());
    }

    #[test]
    fn rejects_missing_scheme() {
        assert!(parse_slides_url("docs.google.com/presentation/d/DECKID/edit").is_err());
    }

    #[test]
    fn rejects_empty() {
        assert!(parse_slides_url("").is_err());
        assert!(parse_slides_url("   ").is_err());
    }

    #[test]
    fn export_urls_match_variant() {
        let doc = SlidesId {
            id: "DECKID".into(),
            variant: SlidesVariant::Document,
        };
        assert_eq!(
            doc.export_url(),
            "https://docs.google.com/presentation/d/DECKID/export/pdf"
        );
        assert_eq!(
            doc.fallback_url().unwrap(),
            "https://docs.google.com/presentation/d/DECKID/pub?output=pdf"
        );

        let pubbed = SlidesId {
            id: "PKEY".into(),
            variant: SlidesVariant::Published,
        };
        assert_eq!(
            pubbed.export_url(),
            "https://docs.google.com/presentation/d/e/PKEY/pub?output=pdf"
        );
        assert!(pubbed.fallback_url().is_none());
    }

    #[test]
    fn safe_filename_stem_strips_non_ascii() {
        assert_eq!(safe_filename_stem("abc_-XYZ"), "abc_-XYZ");
        assert_eq!(safe_filename_stem("a/b.c d"), "abcd");
    }

    #[test]
    fn host_match_is_case_insensitive() {
        let id = parse("https://Docs.Google.COM/presentation/d/DECKID/edit");
        assert_eq!(id.id, "DECKID");
    }
}
