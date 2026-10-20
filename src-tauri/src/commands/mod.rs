use crate::domain::{ErrorCode, IpcResult};
use crate::security;
use crate::AppState;
use serde_json::{json, Value};
use tauri::State;

#[tauri::command]
pub fn book_import_pdf(state: State<'_, AppState>, input: Value) -> IpcResult<Value> {
    crate::services::import_pdf(&state, input)
}

#[tauri::command]
pub fn book_list(state: State<'_, AppState>, filter: Option<Value>) -> IpcResult<Value> {
    crate::services::list_books(&state, filter)
}

#[tauri::command]
pub fn book_get(state: State<'_, AppState>, book_id: String) -> IpcResult<Value> {
    crate::services::get_book(&state, &book_id)
}

#[tauri::command]
pub fn book_get_pdf_bytes(state: State<'_, AppState>, book_id: String) -> IpcResult<Value> {
    crate::services::get_book_pdf_bytes(&state, &book_id)
}

#[tauri::command]
pub fn book_update(state: State<'_, AppState>, input: Value) -> IpcResult<Value> {
    crate::services::update_book(&state, input)
}

#[tauri::command]
pub fn book_remove(state: State<'_, AppState>, input: Value) -> IpcResult<Value> {
    crate::services::remove_book(&state, input)
}

#[tauri::command]
pub fn reader_save_position(state: State<'_, AppState>, input: Value) -> IpcResult<Value> {
    crate::services::save_reading_position(&state, input)
}

#[tauri::command]
pub fn highlight_create(state: State<'_, AppState>, input: Value) -> IpcResult<Value> {
    crate::services::create_highlight(&state, input)
}

#[tauri::command]
pub fn highlight_list(
    state: State<'_, AppState>,
    book_id: String,
    page_number1_based: Option<i64>,
) -> IpcResult<Value> {
    crate::services::list_highlights(&state, &book_id, page_number1_based)
}

#[tauri::command]
pub fn highlight_remove(state: State<'_, AppState>, highlight_id: String) -> IpcResult<Value> {
    crate::services::remove_highlight(&state, &highlight_id)
}

#[tauri::command]
pub async fn ai_analyze_occurrence(
    state: State<'_, AppState>,
    input: Value,
) -> Result<IpcResult<Value>, String> {
    Ok(crate::services::analyze_occurrence(&state, input).await)
}

#[tauri::command]
pub fn ai_cancel_analysis(occurrence_id: String) -> IpcResult<Value> {
    IpcResult::success(json!({ "cancelled": true, "occurrenceId": occurrence_id }))
}

#[tauri::command]
pub fn ai_get_key_status(state: State<'_, AppState>) -> IpcResult<Value> {
    crate::services::get_ai_key_status(&state)
}

#[tauri::command]
pub fn ai_set_key(
    state: State<'_, AppState>,
    api_key: String,
    model_id: Option<String>,
) -> IpcResult<Value> {
    if let Err(e) = security::set_gemini_api_key(&api_key) {
        return IpcResult::failure(ErrorCode::ValidationError, e, None, false);
    }
    if let Some(m) = model_id {
        let _ = crate::services::set_selected_model(&state, &m);
    }
    crate::services::get_ai_key_status(&state)
}

#[tauri::command]
pub async fn ai_test_connection(state: State<'_, AppState>) -> Result<IpcResult<Value>, String> {
    Ok(crate::services::test_ai_connection(&state).await)
}

#[tauri::command]
pub fn ai_delete_key(state: State<'_, AppState>) -> IpcResult<Value> {
    if let Err(e) = security::delete_gemini_api_key() {
        return IpcResult::failure(ErrorCode::InternalError, e, None, true);
    }
    crate::services::get_ai_key_status(&state)
}

#[tauri::command]
pub fn ai_clear_cache(state: State<'_, AppState>) -> IpcResult<Value> {
    crate::services::clear_ai_cache(&state)
}

#[tauri::command]
pub fn vocabulary_list(state: State<'_, AppState>, filter: Option<Value>) -> IpcResult<Value> {
    crate::services::list_vocabulary(&state, filter)
}

#[tauri::command]
pub fn vocabulary_get_detail(state: State<'_, AppState>, lexeme_id: String) -> IpcResult<Value> {
    crate::services::get_vocabulary_detail(&state, &lexeme_id)
}

#[tauri::command]
pub fn vocabulary_edit_sense(state: State<'_, AppState>, input: Value) -> IpcResult<Value> {
    crate::services::edit_sense(&state, input)
}

#[tauri::command]
pub fn vocabulary_set_study_opt_in(state: State<'_, AppState>, input: Value) -> IpcResult<Value> {
    crate::services::set_study_opt_in(&state, input)
}

#[tauri::command]
pub fn vocabulary_delete(state: State<'_, AppState>, input: Value) -> IpcResult<Value> {
    crate::services::delete_vocabulary(&state, input)
}

#[tauri::command]
pub fn study_get_queue(state: State<'_, AppState>, filter: Option<Value>) -> IpcResult<Value> {
    crate::services::get_study_queue(&state, filter)
}

#[tauri::command]
pub fn study_submit_review(state: State<'_, AppState>, input: Value) -> IpcResult<Value> {
    crate::services::submit_review(&state, input)
}

#[tauri::command]
pub fn quiz_generate(state: State<'_, AppState>, input: Value) -> IpcResult<Value> {
    crate::services::generate_quiz(&state, input)
}

#[tauri::command]
pub fn quiz_submit_attempt(state: State<'_, AppState>, input: Value) -> IpcResult<Value> {
    crate::services::submit_quiz_attempt(&state, input)
}

#[tauri::command]
pub fn reminders_get_config(state: State<'_, AppState>) -> IpcResult<Value> {
    crate::services::get_reminder_config(&state)
}

#[tauri::command]
pub fn reminders_update_config(state: State<'_, AppState>, config: Value) -> IpcResult<Value> {
    crate::services::update_reminder_config(&state, config)
}

#[tauri::command]
pub fn reminders_evaluate(state: State<'_, AppState>, input: Value) -> IpcResult<Value> {
    crate::services::evaluate_reminder(&state, input)
}

#[tauri::command]
pub fn reminders_snooze(
    state: State<'_, AppState>,
    minutes: i64,
    now_iso: Option<String>,
) -> IpcResult<Value> {
    crate::services::snooze_reminder(&state, minutes, now_iso)
}

#[tauri::command]
pub fn reminders_dismiss_today(state: State<'_, AppState>, local_date: String) -> IpcResult<Value> {
    crate::services::dismiss_reminder_today(&state, &local_date)
}

#[tauri::command]
pub fn settings_get(state: State<'_, AppState>) -> IpcResult<Value> {
    crate::services::get_app_settings(&state)
}

#[tauri::command]
pub fn settings_update(state: State<'_, AppState>, settings: Value) -> IpcResult<Value> {
    crate::services::update_app_settings(&state, settings)
}

#[tauri::command]
pub fn progress_get_metrics(
    state: State<'_, AppState>,
    local_date: Option<String>,
) -> IpcResult<Value> {
    crate::services::get_progress_metrics(&state, local_date)
}

#[tauri::command]
pub fn backup_export(state: State<'_, AppState>, input: Value) -> IpcResult<Value> {
    crate::services::export_backup(&state, input)
}

#[tauri::command]
pub fn backup_import(state: State<'_, AppState>, input: Value) -> IpcResult<Value> {
    crate::services::import_backup(&state, input)
}
