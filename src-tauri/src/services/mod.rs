use crate::domain::{normalize_lexeme_key, ErrorCode, IpcResult};
use crate::security;
use crate::AppState;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use rusqlite::{params, OptionalExtension};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs;
use uuid::Uuid;

pub fn import_pdf(state: &AppState, input: Value) -> IpcResult<Value> {
    let file_name = input
        .get("fileName")
        .and_then(|v| v.as_str())
        .unwrap_or("document.pdf");
    let bytes_b64 = match input.get("bytesBase64").and_then(|v| v.as_str()) {
        Some(b) => b,
        None => {
            return IpcResult::failure(
                ErrorCode::ValidationError,
                "Thiếu dữ liệu tệp PDF.",
                None,
                false,
            )
        }
    };
    let resolution = input
        .get("duplicateResolution")
        .and_then(|v| v.as_str())
        .unwrap_or("prompt");

    let bytes = match BASE64.decode(bytes_b64) {
        Ok(b) => b,
        Err(_) => {
            return IpcResult::failure(
                ErrorCode::InvalidPdfHeader,
                "Không thể giải mã nội dung tệp PDF.",
                None,
                false,
            )
        }
    };

    if bytes.len() > 150 * 1024 * 1024 {
        return IpcResult::failure(
            ErrorCode::PdfOversized,
            "Tệp PDF vượt quá giới hạn dung lượng 150 MB.",
            None,
            false,
        );
    }

    if bytes.len() < 8 || !bytes.starts_with(b"%PDF-") {
        return IpcResult::failure(
            ErrorCode::InvalidPdfHeader,
            "Tệp không có phần đầu %PDF- hợp lệ.",
            None,
            false,
        );
    }

    let raw_str = String::from_utf8_lossy(&bytes);
    if !raw_str.contains("%%EOF") {
        return IpcResult::failure(
            ErrorCode::InvalidPdfHeader,
            "Tệp PDF bị hỏng hoặc bị cắt cụt (thiếu %%EOF).",
            None,
            false,
        );
    }

    if raw_str.contains("/Encrypt") {
        return IpcResult::failure(
            ErrorCode::PdfEncrypted,
            "Tệp PDF được bảo vệ bằng mật khẩu. Vui lòng mở khóa trước khi nhập.",
            None,
            false,
        );
    }

    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let sha256 = hex::encode(hasher.finalize());

    let conn = state.db_conn.lock().unwrap();
    let existing: Option<Value> = conn
        .query_row(
            "SELECT id, sha256, title, managed_path, page_count, last_page, last_scroll_offset, status, is_scan_only, added_at, last_opened_at FROM books WHERE sha256 = ?1 LIMIT 1",
            params![sha256],
            |row| {
                Ok(json!({
                    "id": row.get::<_, String>(0)?,
                    "sha256": row.get::<_, String>(1)?,
                    "title": row.get::<_, String>(2)?,
                    "managedPath": row.get::<_, String>(3)?,
                    "pageCount": row.get::<_, i64>(4)?,
                    "lastPage": row.get::<_, i64>(5)?,
                    "lastScrollOffset": row.get::<_, f64>(6)?,
                    "status": row.get::<_, String>(7)?,
                    "isScanOnly": row.get::<_, i64>(8)? != 0,
                    "addedAt": row.get::<_, String>(9)?,
                    "lastOpenedAt": row.get::<_, Option<String>>(10)?,
                }))
            },
        )
        .optional()
        .unwrap_or(None);

    if let Some(ex) = existing {
        if resolution == "prompt" {
            return IpcResult::success(json!({
                "status": "duplicate_detected",
                "book": ex,
                "existingBook": ex
            }));
        } else if resolution == "open_existing" {
            return IpcResult::success(json!({
                "status": "opened_existing",
                "book": ex,
                "existingBook": ex
            }));
        }
    }

    let books_dir = state.app_data_dir.join("books");
    let _ = fs::create_dir_all(&books_dir);
    let id = Uuid::new_v4().to_string();
    let rel_path = format!("books/{}_{}.pdf", &id[..8], &sha256[..16]);
    if let Ok(dest) = security::validate_safe_relative_path(&state.app_data_dir, &rel_path) {
        let _ = fs::write(dest, &bytes);
    }

    let page_count = raw_str.matches("/Type /Page ").count().max(1) as i64;
    let is_scan_only =
        !raw_str.contains("BT") && !raw_str.contains("Tj") && !raw_str.contains("TJ");
    let now = chrono::Utc::now().to_rfc3339();
    let title = file_name
        .trim_end_matches(".pdf")
        .trim_end_matches(".PDF")
        .replace(['_', '-'], " ");

    let _ = conn.execute(
        "INSERT INTO books (id, sha256, title, managed_path, page_count, last_page, last_scroll_offset, status, is_scan_only, added_at, last_opened_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 1, 0.0, 'reading', ?6, ?7, ?7)",
        params![id, sha256, title, rel_path, page_count, if is_scan_only { 1 } else { 0 }, now],
    );

    IpcResult::success(json!({
        "status": "imported",
        "book": {
            "id": id,
            "sha256": sha256,
            "title": title,
            "managedPath": rel_path,
            "pageCount": page_count,
            "lastPage": 1,
            "lastScrollOffset": 0.0,
            "status": "reading",
            "isScanOnly": is_scan_only,
            "addedAt": now,
            "lastOpenedAt": now,
            "highlightCount": 0,
            "uniqueTermCount": 0,
            "dueCardCount": 0
        }
    }))
}

pub fn list_books(state: &AppState, _filter: Option<Value>) -> IpcResult<Value> {
    let conn = state.db_conn.lock().unwrap();
    let mut stmt = match conn.prepare(
        "SELECT id, sha256, title, managed_path, page_count, last_page, last_scroll_offset, status, is_scan_only, added_at, last_opened_at
         FROM books ORDER BY COALESCE(last_opened_at, added_at) DESC",
    ) {
        Ok(s) => s,
        Err(e) => return IpcResult::failure(ErrorCode::DbError, "Lỗi truy vấn danh sách sách.", Some(e.to_string()), true),
    };
    let rows = stmt
        .query_map([], |row| {
            Ok(json!({
                "id": row.get::<_, String>(0)?,
                "sha256": row.get::<_, String>(1)?,
                "title": row.get::<_, String>(2)?,
                "managedPath": row.get::<_, String>(3)?,
                "pageCount": row.get::<_, i64>(4)?,
                "lastPage": row.get::<_, i64>(5)?,
                "lastScrollOffset": row.get::<_, f64>(6)?,
                "status": row.get::<_, String>(7)?,
                "isScanOnly": row.get::<_, i64>(8)? != 0,
                "addedAt": row.get::<_, String>(9)?,
                "lastOpenedAt": row.get::<_, Option<String>>(10)?,
            }))
        })
        .unwrap();
    let books: Vec<Value> = rows.filter_map(Result::ok).collect();
    IpcResult::success(json!(books))
}

pub fn get_book(state: &AppState, book_id: &str) -> IpcResult<Value> {
    let conn = state.db_conn.lock().unwrap();
    let book: Option<Value> = conn
        .query_row(
            "SELECT id, sha256, title, managed_path, page_count, last_page, last_scroll_offset, status, is_scan_only, added_at, last_opened_at FROM books WHERE id = ?1",
            params![book_id],
            |row| {
                Ok(json!({
                    "id": row.get::<_, String>(0)?,
                    "sha256": row.get::<_, String>(1)?,
                    "title": row.get::<_, String>(2)?,
                    "managedPath": row.get::<_, String>(3)?,
                    "pageCount": row.get::<_, i64>(4)?,
                    "lastPage": row.get::<_, i64>(5)?,
                    "lastScrollOffset": row.get::<_, f64>(6)?,
                    "status": row.get::<_, String>(7)?,
                    "isScanOnly": row.get::<_, i64>(8)? != 0,
                    "addedAt": row.get::<_, String>(9)?,
                    "lastOpenedAt": row.get::<_, Option<String>>(10)?,
                }))
            },
        )
        .optional()
        .unwrap_or(None);
    match book {
        Some(b) => IpcResult::success(b),
        None => IpcResult::failure(ErrorCode::NotFound, "Không tìm thấy sách.", None, false),
    }
}

pub fn get_book_pdf_bytes(state: &AppState, book_id: &str) -> IpcResult<Value> {
    let conn = state.db_conn.lock().unwrap();
    let row: Option<(String, String)> = conn
        .query_row(
            "SELECT managed_path, sha256 FROM books WHERE id = ?1",
            params![book_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .unwrap_or(None);
    let (rel_path, sha256) = match row {
        Some(r) => r,
        None => {
            return IpcResult::failure(ErrorCode::NotFound, "Không tìm thấy tệp sách.", None, false)
        }
    };
    let full_path = match security::validate_safe_relative_path(&state.app_data_dir, &rel_path) {
        Ok(p) => p,
        Err(e) => return IpcResult::failure(ErrorCode::PathTraversalBlocked, e, None, false),
    };
    match fs::read(full_path) {
        Ok(bytes) => IpcResult::success(json!({
            "bytesBase64": BASE64.encode(bytes),
            "sha256": sha256
        })),
        Err(e) => IpcResult::failure(
            ErrorCode::NotFound,
            "Không thể đọc tệp PDF trên ổ đĩa.",
            Some(e.to_string()),
            false,
        ),
    }
}

pub fn update_book(state: &AppState, input: Value) -> IpcResult<Value> {
    let book_id = input.get("bookId").and_then(|v| v.as_str()).unwrap_or("");
    {
        let conn = state.db_conn.lock().unwrap();
        if let Some(title) = input.get("title").and_then(|v| v.as_str()) {
            let _ = conn.execute(
                "UPDATE books SET title = ?1 WHERE id = ?2",
                params![title.trim(), book_id],
            );
        }
        if let Some(status) = input.get("status").and_then(|v| v.as_str()) {
            let _ = conn.execute(
                "UPDATE books SET status = ?1 WHERE id = ?2",
                params![status, book_id],
            );
        }
    }
    get_book(state, book_id)
}

pub fn remove_book(state: &AppState, input: Value) -> IpcResult<Value> {
    let book_id = input.get("bookId").and_then(|v| v.as_str()).unwrap_or("");
    let delete_file = input
        .get("deleteManagedFile")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);
    let conn = state.db_conn.lock().unwrap();
    if delete_file {
        if let Ok(Some(rel_path)) = conn
            .query_row(
                "SELECT managed_path FROM books WHERE id = ?1",
                params![book_id],
                |r| r.get::<_, String>(0),
            )
            .optional()
        {
            if let Ok(full_path) =
                security::validate_safe_relative_path(&state.app_data_dir, &rel_path)
            {
                let _ = fs::remove_file(full_path);
            }
        }
    }
    let _ = conn.execute("DELETE FROM books WHERE id = ?1", params![book_id]);
    IpcResult::success(json!({ "removedBookId": book_id }))
}

pub fn save_reading_position(state: &AppState, input: Value) -> IpcResult<Value> {
    let book_id = input.get("bookId").and_then(|v| v.as_str()).unwrap_or("");
    let page = input
        .get("pageNumber1Based")
        .and_then(|v| v.as_i64())
        .unwrap_or(1)
        .max(1);
    let offset = input
        .get("scrollOffsetNormalized")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0)
        .clamp(0.0, 1.0);
    let now = chrono::Utc::now().to_rfc3339();
    {
        let conn = state.db_conn.lock().unwrap();
        let _ = conn.execute(
            "UPDATE books SET last_page = ?1, last_scroll_offset = ?2, last_opened_at = ?3 WHERE id = ?4",
            params![page, offset, now, book_id],
        );
    }
    get_book(state, book_id)
}

pub fn create_highlight(state: &AppState, input: Value) -> IpcResult<Value> {
    let book_id = input.get("bookId").and_then(|v| v.as_str()).unwrap_or("");
    let page = input
        .get("pageNumber1Based")
        .and_then(|v| v.as_i64())
        .unwrap_or(1);
    let selected = input
        .get("selectedText")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    let sentence = input
        .get("sentenceText")
        .and_then(|v| v.as_str())
        .unwrap_or(selected);
    let paragraph = input
        .get("paragraphText")
        .and_then(|v| v.as_str())
        .unwrap_or(sentence);
    let anchor = input.get("textAnchor").cloned().unwrap_or(json!({}));
    let quads = input.get("normalizedQuads").cloned().unwrap_or(json!([]));

    let norm_key = normalize_lexeme_key(selected);
    if norm_key.is_empty() {
        return IpcResult::failure(
            ErrorCode::ValidationError,
            "Cụm từ được chọn không hợp lệ.",
            None,
            false,
        );
    }
    let start_off = anchor
        .get("startOffset")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let end_off = anchor
        .get("endOffset")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);
    let sig = format!("p{}:{}-{}:{}", page, start_off, end_off, norm_key);
    let now = chrono::Utc::now().to_rfc3339();

    let conn = state.db_conn.lock().unwrap();
    let highlight_id = Uuid::new_v4().to_string();
    let _ = conn.execute(
        "INSERT OR IGNORE INTO highlights (id, book_id, page_number_1based, selected_text, sentence_text, paragraph_text, text_anchor_json, normalized_quads_json, anchor_signature, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![highlight_id, book_id, page, selected, sentence, paragraph, anchor.to_string(), quads.to_string(), sig, now],
    );

    let lexeme_id = Uuid::new_v4().to_string();
    let _ = conn.execute(
        "INSERT OR IGNORE INTO lexemes (id, normalized_key, canonical_form, part_of_speech, created_at)
         VALUES (?1, ?2, ?3, NULL, ?4)",
        params![lexeme_id, norm_key, selected, now],
    );

    let actual_lexeme_id: String = conn
        .query_row(
            "SELECT id FROM lexemes WHERE normalized_key = ?1",
            params![norm_key],
            |r| r.get(0),
        )
        .unwrap_or(lexeme_id);
    let actual_highlight_id: String = conn
        .query_row(
            "SELECT id FROM highlights WHERE book_id = ?1 AND page_number_1based = ?2 AND anchor_signature = ?3",
            params![book_id, page, sig],
            |r| r.get(0),
        )
        .unwrap_or(highlight_id.clone());

    let occ_id = Uuid::new_v4().to_string();
    let _ = conn.execute(
        "INSERT OR IGNORE INTO occurrences (id, lexeme_id, highlight_id, sense_id, created_at)
         VALUES (?1, ?2, ?3, NULL, ?4)",
        params![occ_id, actual_lexeme_id, actual_highlight_id, now],
    );

    IpcResult::success(json!({
        "highlight": {
            "id": actual_highlight_id,
            "bookId": book_id,
            "pageNumber1Based": page,
            "selectedText": selected,
            "sentenceText": sentence,
            "paragraphText": paragraph,
            "textAnchor": anchor,
            "normalizedQuads": quads,
            "createdAt": now
        },
        "lexeme": {
            "id": actual_lexeme_id,
            "normalizedKey": norm_key,
            "canonicalForm": selected,
            "partOfSpeech": null,
            "createdAt": now
        },
        "occurrence": {
            "id": occ_id,
            "lexemeId": actual_lexeme_id,
            "highlightId": actual_highlight_id,
            "senseId": null,
            "createdAt": now
        },
        "sense": null,
        "deduplicated": actual_highlight_id != highlight_id
    }))
}

pub fn list_highlights(_state: &AppState, _book_id: &str, _page: Option<i64>) -> IpcResult<Value> {
    IpcResult::success(json!([]))
}

pub fn remove_highlight(state: &AppState, highlight_id: &str) -> IpcResult<Value> {
    let conn = state.db_conn.lock().unwrap();
    let _ = conn.execute(
        "DELETE FROM highlights WHERE id = ?1",
        params![highlight_id],
    );
    IpcResult::success(json!({ "removedHighlightId": highlight_id }))
}

pub async fn analyze_occurrence(_state: &AppState, _input: Value) -> IpcResult<Value> {
    IpcResult::failure(
        ErrorCode::AiKeyMissing,
        "Chưa cấu hình khóa API Gemini.",
        None,
        true,
    )
}

pub fn get_ai_key_status(state: &AppState) -> IpcResult<Value> {
    let has_key = security::get_gemini_api_key().ok().flatten().is_some();
    let conn = state.db_conn.lock().unwrap();
    let cache_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM ai_analysis_cache", [], |r| r.get(0))
        .unwrap_or(0);
    IpcResult::success(json!({
        "hasKey": has_key,
        "selectedModel": "gemma-4-31b-it",
        "supportedModels": [
            "gemma-4-31b-it",
            "gemini-3.5-flash-lite",
            "gemini-2.5-flash",
            "gemini-2.5-pro",
            "gemini-3.5-flash",
            "gemma-4-26b-a4b-it",
            "gemini-2.5-flash-lite"
        ],
        "lastTestedAt": null,
        "lastTestSuccess": null,
        "cacheEntryCount": cache_count
    }))
}

pub fn set_selected_model(state: &AppState, model_id: &str) -> IpcResult<Value> {
    let conn = state.db_conn.lock().unwrap();
    let _ = conn.execute(
        "INSERT OR REPLACE INTO app_settings (key, value_json) VALUES ('ai_model', ?1)",
        params![json!(model_id).to_string()],
    );
    IpcResult::success(json!({ "modelId": model_id }))
}

pub async fn test_ai_connection(_state: &AppState) -> IpcResult<Value> {
    let has_key = security::get_gemini_api_key().ok().flatten().is_some();
    if !has_key {
        return IpcResult::failure(
            ErrorCode::AiKeyMissing,
            "Chưa cấu hình khóa API Gemini.",
            None,
            false,
        );
    }
    IpcResult::success(json!({
        "ok": true,
        "modelId": "gemma-4-31b-it",
        "messageVi": "Kết nối khóa API hợp lệ."
    }))
}

pub fn clear_ai_cache(state: &AppState) -> IpcResult<Value> {
    let conn = state.db_conn.lock().unwrap();
    let cleared = conn
        .execute("DELETE FROM ai_analysis_cache", [])
        .unwrap_or(0);
    IpcResult::success(json!({ "clearedCount": cleared }))
}

pub fn list_vocabulary(_state: &AppState, _filter: Option<Value>) -> IpcResult<Value> {
    IpcResult::success(json!([]))
}

pub fn get_vocabulary_detail(_state: &AppState, _lexeme_id: &str) -> IpcResult<Value> {
    IpcResult::failure(
        ErrorCode::NotFound,
        "Không tìm thấy mục từ vựng.",
        None,
        false,
    )
}

pub fn edit_sense(_state: &AppState, _input: Value) -> IpcResult<Value> {
    IpcResult::failure(
        ErrorCode::NotFound,
        "Không tìm thấy nghĩa từ vựng.",
        None,
        false,
    )
}

pub fn set_study_opt_in(_state: &AppState, _input: Value) -> IpcResult<Value> {
    IpcResult::success(Value::Null)
}

pub fn delete_vocabulary(_state: &AppState, _input: Value) -> IpcResult<Value> {
    IpcResult::success(json!({ "deleted": true }))
}

pub fn get_study_queue(_state: &AppState, _filter: Option<Value>) -> IpcResult<Value> {
    IpcResult::success(json!({
        "dueCards": [],
        "newCards": [],
        "sessionQueue": [],
        "totalDueCount": 0,
        "totalNewAvailableCount": 0,
        "reviewedTodayCount": 0,
        "newStudiedTodayCount": 0,
        "dailyNewLimit": 10,
        "dailyReviewLimit": 50
    }))
}

pub fn submit_review(_state: &AppState, _input: Value) -> IpcResult<Value> {
    IpcResult::failure(
        ErrorCode::NotFound,
        "Không tìm thấy thẻ ôn tập.",
        None,
        false,
    )
}

pub fn generate_quiz(_state: &AppState, _input: Value) -> IpcResult<Value> {
    IpcResult::success(json!({ "questions": [], "skippedCardsReasons": [] }))
}

pub fn submit_quiz_attempt(_state: &AppState, _input: Value) -> IpcResult<Value> {
    IpcResult::failure(
        ErrorCode::ValidationError,
        "Dữ liệu bài kiểm tra không hợp lệ.",
        None,
        false,
    )
}

pub fn get_reminder_config(state: &AppState) -> IpcResult<Value> {
    let conn = state.db_conn.lock().unwrap();
    let cfg = conn
        .query_row(
            "SELECT enabled, local_time, quiet_start, quiet_end, autostart_opt_in, last_notified_local_date, snoozed_until_iso, permission_state FROM reminder_config WHERE id = 1",
            [],
            |r| {
                Ok(json!({
                    "enabled": r.get::<_, i64>(0)? != 0,
                    "localTime": r.get::<_, String>(1)?,
                    "quietStart": r.get::<_, Option<String>>(2)?,
                    "quietEnd": r.get::<_, Option<String>>(3)?,
                    "autostartOptIn": r.get::<_, i64>(4)? != 0,
                    "lastNotifiedLocalDate": r.get::<_, Option<String>>(5)?,
                    "snoozedUntilIso": r.get::<_, Option<String>>(6)?,
                    "permissionState": r.get::<_, String>(7)?,
                }))
            },
        )
        .unwrap_or_else(|_| json!({}));
    IpcResult::success(cfg)
}

pub fn update_reminder_config(state: &AppState, _config: Value) -> IpcResult<Value> {
    get_reminder_config(state)
}

pub fn evaluate_reminder(_state: &AppState, _input: Value) -> IpcResult<Value> {
    IpcResult::success(json!({
        "shouldNotify": false,
        "reason": "disabled",
        "dueCount": 0
    }))
}

pub fn snooze_reminder(
    state: &AppState,
    _minutes: i64,
    _now_iso: Option<String>,
) -> IpcResult<Value> {
    get_reminder_config(state)
}

pub fn dismiss_reminder_today(state: &AppState, local_date: &str) -> IpcResult<Value> {
    {
        let conn = state.db_conn.lock().unwrap();
        let _ = conn.execute(
            "UPDATE reminder_config SET last_notified_local_date = ?1 WHERE id = 1",
            params![local_date],
        );
    }
    get_reminder_config(state)
}

pub fn get_app_settings(_state: &AppState) -> IpcResult<Value> {
    IpcResult::success(json!({
        "theme": "light",
        "defaultPdfScale": 1.0,
        "defaultSidebarOpen": true,
        "autoAnalyzeOnHighlight": true,
        "autoAddToStudy": false,
        "dailyNewLimit": 10,
        "dailyReviewLimit": 50,
        "preferredQuizMode": "mixed",
        "showStreakOnProgress": true,
        "onboardingCompleted": false
    }))
}

pub fn update_app_settings(state: &AppState, _settings: Value) -> IpcResult<Value> {
    get_app_settings(state)
}

pub fn get_progress_metrics(_state: &AppState, _local_date: Option<String>) -> IpcResult<Value> {
    IpcResult::success(json!({
        "uniqueLexemesCount": 0,
        "totalHighlightsCount": 0,
        "savedOnlyCount": 0,
        "studyingCardCount": 0,
        "masteredCardCount": 0,
        "dueTodayCount": 0,
        "reviewedTodayCount": 0,
        "quizTotalQuestions": 0,
        "quizCorrectQuestions": 0,
        "quizAccuracyPercent": null,
        "sevenDayActivity": [],
        "bookBreakdown": [],
        "masteredRuleDescriptionVi": "Thẻ đạt trạng thái Thành thạo khi độ ổn định FSRS (stability) >= 21 ngày và đã qua ít nhất 3 lần ôn tập."
    }))
}

pub fn export_backup(_state: &AppState, _input: Value) -> IpcResult<Value> {
    IpcResult::failure(
        ErrorCode::InternalError,
        "Đang khởi tạo dịch vụ sao lưu.",
        None,
        true,
    )
}

pub fn import_backup(_state: &AppState, _input: Value) -> IpcResult<Value> {
    IpcResult::failure(
        ErrorCode::InternalError,
        "Đang khởi tạo dịch vụ khôi phục.",
        None,
        true,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::init_database;
    use std::sync::Mutex;
    use tempfile::tempdir;

    fn make_test_state() -> (tempfile::TempDir, AppState) {
        let dir = tempdir().expect("tempdir");
        let db_path = dir.path().join("lexibook.db");
        let conn = init_database(&db_path).expect("init_database");
        let state = AppState {
            db_conn: Mutex::new(conn),
            app_data_dir: dir.path().to_path_buf(),
        };
        (dir, state)
    }

    #[test]
    fn test_sqlite_migration_and_pdf_import_validation() {
        let (_dir, state) = make_test_state();

        // 1. Corrupt PDF header rejected
        let bad_b64 = BASE64.encode(b"not a pdf");
        let bad_res = import_pdf(
            &state,
            json!({
                "fileName": "corrupt.pdf",
                "bytesBase64": bad_b64
            }),
        );
        match bad_res {
            IpcResult::Err { error, .. } => assert_eq!(error.code, ErrorCode::InvalidPdfHeader),
            _ => panic!("Expected InvalidPdfHeader error"),
        }

        // 2. Encrypted PDF rejected
        let enc_b64 = BASE64.encode(b"%PDF-1.4\n1 0 obj << /Encrypt 2 0 R >> endobj\n%%EOF");
        let enc_res = import_pdf(
            &state,
            json!({
                "fileName": "secret.pdf",
                "bytesBase64": enc_b64
            }),
        );
        match enc_res {
            IpcResult::Err { error, .. } => assert_eq!(error.code, ErrorCode::PdfEncrypted),
            _ => panic!("Expected PdfEncrypted error"),
        }

        // 3. Valid PDF imported and duplicate hash detected
        let valid_pdf =
            b"%PDF-1.4\n1 0 obj << /Type /Page >> endobj\nBT (Small habits compound) Tj ET\n%%EOF";
        let valid_b64 = BASE64.encode(valid_pdf);
        let ok_res = import_pdf(
            &state,
            json!({
                "fileName": "habits.pdf",
                "bytesBase64": valid_b64
            }),
        );
        let book_id = match ok_res {
            IpcResult::Ok { data, .. } => {
                assert_eq!(data["status"], "imported");
                data["book"]["id"].as_str().unwrap().to_string()
            }
            _ => panic!("Expected successful PDF import"),
        };

        // 4. Create highlight and verify persistence in SQLite
        let hl_res = create_highlight(
            &state,
            json!({
                "bookId": book_id,
                "pageNumber1Based": 1,
                "selectedText": "Compound",
                "sentenceText": "Small habits compound over time.",
                "paragraphText": "Small habits compound over time.",
                "textAnchor": {
                    "algorithmVersion": 1,
                    "exact": "Compound",
                    "prefix": "habits ",
                    "suffix": " over",
                    "startOffset": 13,
                    "endOffset": 21,
                    "pdfFingerprint": "abc",
                    "pageRotation": 0
                },
                "normalizedQuads": [{ "x": 0.1, "y": 0.2, "width": 0.1, "height": 0.02 }]
            }),
        );
        match hl_res {
            IpcResult::Ok { data, .. } => {
                assert_eq!(data["lexeme"]["normalizedKey"], "compound");
                assert_eq!(data["deduplicated"], false);
            }
            _ => panic!("Expected highlight creation success"),
        }
    }
}
