import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as {
  DatabaseSync: new (path: string) => DatabaseSyncType;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_0001_PATH = path.resolve(__dirname, '../../src-tauri/migrations/0001_initial.sql');

export interface LexiBookDbContext {
  db: DatabaseSyncType;
  dbPath: string;
  appDataDir: string;
  close: () => void;
}

/**
 * Opens or creates a SQLite database at `appDataDir/lexibook.db`, enables WAL and foreign keys,
 * and applies the canonical `src-tauri/migrations/0001_initial.sql` schema idempotently.
 */
export function openLexiBookDatabase(appDataDir: string): LexiBookDbContext {
  fs.mkdirSync(appDataDir, { recursive: true });
  fs.mkdirSync(path.join(appDataDir, 'books'), { recursive: true });

  const dbPath = path.join(appDataDir, 'lexibook.db');
  const db = new DatabaseSync(dbPath);

  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');

  const migrationSql = fs.readFileSync(MIGRATION_0001_PATH, 'utf8');
  db.exec(migrationSql);

  const stmt = db.prepare(
    'INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (1, ?)'
  );
  stmt.run(new Date().toISOString());

  return {
    db,
    dbPath,
    appDataDir,
    close: () => {
      try {
        db.close();
      } catch {
        // already closed
      }
    },
  };
}
