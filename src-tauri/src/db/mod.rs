use rusqlite::Connection;
use std::path::Path;

const MIGRATION_0001: &str = include_str!("../../migrations/0001_initial.sql");

pub fn init_database(db_path: &Path) -> Result<Connection, rusqlite::Error> {
    let conn = Connection::open(db_path)?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "busy_timeout", 5000)?;
    conn.execute_batch(MIGRATION_0001)?;
    conn.execute(
        "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (1, datetime('now'))",
        [],
    )?;
    Ok(conn)
}
