use serde::{Deserialize, Serialize};
use unicode_normalization::UnicodeNormalization;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ErrorCode {
    ValidationError,
    NotFound,
    DuplicateBookHash,
    InvalidPdfHeader,
    PdfEncrypted,
    PdfScanOnly,
    PdfOversized,
    PathTraversalBlocked,
    DbError,
    AiKeyMissing,
    AiAuthError,
    AiQuotaExceeded,
    AiTimeout,
    AiOffline,
    AiSchemaInvalid,
    AiServerError,
    AiCancelled,
    QuizInsufficientCards,
    BackupInvalidArchive,
    BackupHashMismatch,
    BackupPathUnsafe,
    BackupCorruptDb,
    InternalError,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: ErrorCode,
    pub message_vi: String,
    pub details: Option<String>,
    pub retryable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum IpcResult<T> {
    Ok { ok: bool, data: T },
    Err { ok: bool, error: AppError },
}

impl<T> IpcResult<T> {
    pub fn success(data: T) -> Self {
        Self::Ok { ok: true, data }
    }

    pub fn failure(
        code: ErrorCode,
        message_vi: impl Into<String>,
        details: Option<String>,
        retryable: bool,
    ) -> Self {
        Self::Err {
            ok: false,
            error: AppError {
                code,
                message_vi: message_vi.into(),
                details,
                retryable,
            },
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Book {
    pub id: String,
    pub sha256: String,
    pub title: String,
    pub managed_path: String,
    pub page_count: i64,
    pub last_page: i64,
    pub last_scroll_offset: f64,
    pub status: String,
    pub is_scan_only: bool,
    pub added_at: String,
    pub last_opened_at: Option<String>,
    pub highlight_count: Option<i64>,
    pub unique_term_count: Option<i64>,
    pub due_card_count: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedQuad {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextAnchor {
    pub algorithm_version: u8,
    pub exact: String,
    pub prefix: String,
    pub suffix: String,
    pub start_offset: i64,
    pub end_offset: i64,
    pub pdf_fingerprint: String,
    pub page_rotation: i64,
    pub anchor_uncertain: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Highlight {
    pub id: String,
    pub book_id: String,
    pub page_number1_based: i64,
    pub selected_text: String,
    pub sentence_text: String,
    pub paragraph_text: String,
    pub text_anchor: TextAnchor,
    pub normalized_quads: Vec<NormalizedQuad>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Lexeme {
    pub id: String,
    pub normalized_key: String,
    pub canonical_form: String,
    pub part_of_speech: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Occurrence {
    pub id: String,
    pub lexeme_id: String,
    pub highlight_id: String,
    pub sense_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sense {
    pub id: String,
    pub lexeme_id: String,
    pub general_meanings_vi: Vec<String>,
    pub contextual_meaning_vi: String,
    pub contextual_explanation_vi: String,
    pub contextual_translation_vi: Option<String>,
    pub ipa: Option<String>,
    pub collocation: Option<String>,
    pub example_en: Option<String>,
    pub example_vi: Option<String>,
    pub source_excerpt: String,
    pub generation_state: String,
    pub ai_metadata: Option<serde_json::Value>,
    pub user_edited_flags: serde_json::Value,
    pub created_at: String,
    pub updated_at: String,
}

pub fn normalize_lexeme_key(raw: &str) -> String {
    let nfc: String = raw.nfc().collect();
    let collapsed = nfc
        .replace(['\u{2018}', '\u{2019}'], "'")
        .replace(['\u{201C}', '\u{201D}'], "\"")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    collapsed
        .trim_matches(|c: char| ".,!?;:()\"'[]{}".contains(c))
        .trim()
        .to_lowercase()
}
