pub mod commands;
pub mod db;
pub mod domain;
pub mod security;
pub mod services;

use std::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    pub db_conn: Mutex<rusqlite::Connection>,
    pub app_data_dir: std::path::PathBuf,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to resolve native Windows AppData directory");
            std::fs::create_dir_all(&app_data_dir)?;
            let db_path = app_data_dir.join("lexibook.db");
            let conn = db::init_database(&db_path).expect("Failed to initialize SQLite database");
            app.manage(AppState {
                db_conn: Mutex::new(conn),
                app_data_dir,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::book_import_pdf,
            commands::book_list,
            commands::book_get,
            commands::book_get_pdf_bytes,
            commands::book_update,
            commands::book_remove,
            commands::reader_save_position,
            commands::highlight_create,
            commands::highlight_list,
            commands::highlight_remove,
            commands::ai_analyze_occurrence,
            commands::ai_cancel_analysis,
            commands::ai_get_key_status,
            commands::ai_set_key,
            commands::ai_test_connection,
            commands::ai_delete_key,
            commands::ai_clear_cache,
            commands::vocabulary_list,
            commands::vocabulary_get_detail,
            commands::vocabulary_edit_sense,
            commands::vocabulary_set_study_opt_in,
            commands::vocabulary_delete,
            commands::study_get_queue,
            commands::study_submit_review,
            commands::quiz_generate,
            commands::quiz_submit_attempt,
            commands::reminders_get_config,
            commands::reminders_update_config,
            commands::reminders_evaluate,
            commands::reminders_snooze,
            commands::reminders_dismiss_today,
            commands::settings_get,
            commands::settings_update,
            commands::progress_get_metrics,
            commands::backup_export,
            commands::backup_import,
        ])
        .run(tauri::generate_context!())
        .expect("error while running LexiBook AI Tauri application");
}
