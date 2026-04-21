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
use url::Url;

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

    let parsed =
        Url::parse(trimmed).map_err(|e| AppError::InvalidInput(format!("invalid URL: {e}")))?;

    let scheme = parsed.scheme();
    if !scheme.eq_ignore_ascii_case("http") && !scheme.eq_ignore_ascii_case("https") {
        return Err(AppError::InvalidInput(
            "URL must start with http(s)://".into(),
        ));
    }

    let host = parsed
        .host_str()
        .ok_or_else(|| AppError::InvalidInput("URL has no host".into()))?;
    if !host.eq_ignore_ascii_case("docs.google.com") {
        return Err(AppError::InvalidInput(format!(
            "not a docs.google.com URL (host: {host})"
        )));
    }

    let path = parsed.path();
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

fn slides_cache_filename(id: &SlidesId) -> String {
    let variant = match id.variant {
        SlidesVariant::Document => "document",
        SlidesVariant::Published => "published",
    };
    format!("{variant}-{}.pdf", safe_filename_stem(&id.id))
}

fn is_allowed_google_redirect(host: &str) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    host == "google.com"
        || host.ends_with(".google.com")
        || host == "googleusercontent.com"
        || host.ends_with(".googleusercontent.com")
}

fn google_redirect_policy() -> reqwest::redirect::Policy {
    reqwest::redirect::Policy::custom(|attempt| {
        if attempt.previous().len() >= 10 {
            return attempt.error("too many redirects");
        }
        let host = attempt.url().host_str().map(str::to_owned);
        match host {
            Some(host) if is_allowed_google_redirect(&host) => attempt.follow(),
            Some(host) => attempt.error(format!("redirect to disallowed host: {host}")),
            None => attempt.error("redirect target has no host"),
        }
    })
}

async fn download(url: &str) -> AppResult<reqwest::Response> {
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(60))
        .redirect(google_redirect_policy())
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
    let file = dir.join(slides_cache_filename(&id));
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

    #[test]
    fn accepts_uppercase_scheme() {
        let id = parse("HTTPS://docs.google.com/presentation/d/DECKID/edit");
        assert_eq!(id.id, "DECKID");
    }

    #[test]
    fn accepts_explicit_port() {
        let id = parse("https://docs.google.com:443/presentation/d/DECKID/edit");
        assert_eq!(id.id, "DECKID");
    }

    #[test]
    fn cache_filename_distinguishes_variants() {
        let doc = SlidesId {
            id: "SAMEID".into(),
            variant: SlidesVariant::Document,
        };
        let pubbed = SlidesId {
            id: "SAMEID".into(),
            variant: SlidesVariant::Published,
        };
        let doc_name = slides_cache_filename(&doc);
        let pub_name = slides_cache_filename(&pubbed);
        assert_ne!(doc_name, pub_name);
        assert_eq!(doc_name, "document-SAMEID.pdf");
        assert_eq!(pub_name, "published-SAMEID.pdf");
    }

    #[test]
    fn allows_google_redirect_hosts() {
        assert!(is_allowed_google_redirect("google.com"));
        assert!(is_allowed_google_redirect("docs.google.com"));
        assert!(is_allowed_google_redirect("DOCS.GOOGLE.COM"));
        assert!(is_allowed_google_redirect("accounts.google.com"));
        assert!(is_allowed_google_redirect("googleusercontent.com"));
        assert!(is_allowed_google_redirect("foo.googleusercontent.com"));
        assert!(is_allowed_google_redirect("docs.google.com."));
    }

    #[test]
    fn rejects_non_google_redirect_hosts() {
        assert!(!is_allowed_google_redirect("evil.com"));
        assert!(!is_allowed_google_redirect("google.com.evil.com"));
        assert!(!is_allowed_google_redirect("notgoogle.com"));
        assert!(!is_allowed_google_redirect("googleusercontent.com.evil"));
        assert!(!is_allowed_google_redirect(""));
    }
}
