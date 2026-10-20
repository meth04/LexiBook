-- LexiBook AI — Canonical SQLite Migration 0001
-- Owned by: Orchestrator + Data Platform (see docs/CONTRACTS.md, ADR-004, ADR-005)
-- Invariant: No API keys or credentials are ever stored in SQLite tables.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY NOT NULL,
  sha256 TEXT NOT NULL,
  title TEXT NOT NULL,
  managed_path TEXT NOT NULL,
  page_count INTEGER NOT NULL CHECK (page_count >= 1),
  last_page INTEGER NOT NULL DEFAULT 1 CHECK (last_page >= 1),
  last_scroll_offset REAL NOT NULL DEFAULT 0.0 CHECK (last_scroll_offset >= 0.0 AND last_scroll_offset <= 1.0),
  status TEXT NOT NULL DEFAULT 'reading' CHECK (status IN ('reading', 'finished')),
  is_scan_only INTEGER NOT NULL DEFAULT 0 CHECK (is_scan_only IN (0, 1)),
  added_at TEXT NOT NULL,
  last_opened_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_books_sha256 ON books(sha256);
CREATE INDEX IF NOT EXISTS idx_books_last_opened ON books(last_opened_at DESC, added_at DESC);

CREATE TABLE IF NOT EXISTS highlights (
  id TEXT PRIMARY KEY NOT NULL,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  page_number_1based INTEGER NOT NULL CHECK (page_number_1based >= 1),
  selected_text TEXT NOT NULL,
  sentence_text TEXT NOT NULL,
  paragraph_text TEXT NOT NULL,
  text_anchor_json TEXT NOT NULL,
  normalized_quads_json TEXT NOT NULL,
  anchor_signature TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(book_id, page_number_1based, anchor_signature)
);

CREATE INDEX IF NOT EXISTS idx_highlights_book_page ON highlights(book_id, page_number_1based);

CREATE TABLE IF NOT EXISTS lexemes (
  id TEXT PRIMARY KEY NOT NULL,
  normalized_key TEXT NOT NULL UNIQUE,
  canonical_form TEXT NOT NULL,
  part_of_speech TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lexemes_normalized_key ON lexemes(normalized_key);

CREATE TABLE IF NOT EXISTS senses (
  id TEXT PRIMARY KEY NOT NULL,
  lexeme_id TEXT NOT NULL REFERENCES lexemes(id) ON DELETE CASCADE,
  general_meanings_vi_json TEXT NOT NULL DEFAULT '[]',
  contextual_meaning_vi TEXT NOT NULL DEFAULT '',
  contextual_explanation_vi TEXT NOT NULL DEFAULT '',
  contextual_translation_vi TEXT,
  ipa TEXT,
  collocation TEXT,
  example_en TEXT,
  example_vi TEXT,
  source_excerpt TEXT NOT NULL,
  generation_state TEXT NOT NULL DEFAULT 'idle' CHECK (generation_state IN ('idle', 'queued', 'loading', 'succeeded', 'failed', 'cancelled')),
  ai_metadata_json TEXT,
  user_edited_flags_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_senses_lexeme ON senses(lexeme_id);

CREATE TABLE IF NOT EXISTS occurrences (
  id TEXT PRIMARY KEY NOT NULL,
  lexeme_id TEXT NOT NULL REFERENCES lexemes(id) ON DELETE CASCADE,
  highlight_id TEXT NOT NULL UNIQUE REFERENCES highlights(id) ON DELETE CASCADE,
  sense_id TEXT REFERENCES senses(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_occurrences_lexeme ON occurrences(lexeme_id);
CREATE INDEX IF NOT EXISTS idx_occurrences_sense ON occurrences(sense_id);

CREATE TABLE IF NOT EXISTS study_cards (
  id TEXT PRIMARY KEY NOT NULL,
  sense_id TEXT NOT NULL UNIQUE REFERENCES senses(id) ON DELETE CASCADE,
  representative_occurrence_id TEXT NOT NULL REFERENCES occurrences(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  due_at TEXT NOT NULL,
  fsrs_state_json TEXT NOT NULL,
  is_mastered INTEGER NOT NULL DEFAULT 0 CHECK (is_mastered IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_study_cards_due ON study_cards(enabled, due_at);

CREATE TABLE IF NOT EXISTS review_events (
  id TEXT PRIMARY KEY NOT NULL,
  study_card_id TEXT NOT NULL REFERENCES study_cards(id) ON DELETE CASCADE,
  reviewed_at TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'flashcard' CHECK (mode IN ('flashcard')),
  grade TEXT NOT NULL CHECK (grade IN ('again', 'hard', 'good', 'easy')),
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  response_ms INTEGER NOT NULL DEFAULT 0,
  client_review_request_id TEXT NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_review_events_card ON review_events(study_card_id, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_events_reviewed_at ON review_events(reviewed_at);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id TEXT PRIMARY KEY NOT NULL,
  client_attempt_id TEXT NOT NULL UNIQUE,
  book_id TEXT REFERENCES books(id) ON DELETE SET NULL,
  total_questions INTEGER NOT NULL CHECK (total_questions >= 1),
  correct_count INTEGER NOT NULL CHECK (correct_count >= 0),
  answers_json TEXT NOT NULL,
  completed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_completed ON quiz_attempts(completed_at DESC);

CREATE TABLE IF NOT EXISTS ai_analysis_cache (
  cache_key TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  normalized_term TEXT NOT NULL,
  response_json TEXT NOT NULL,
  estimated_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reminder_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  local_time TEXT NOT NULL DEFAULT '20:00',
  quiet_start TEXT DEFAULT '22:00',
  quiet_end TEXT DEFAULT '07:00',
  autostart_opt_in INTEGER NOT NULL DEFAULT 0 CHECK (autostart_opt_in IN (0, 1)),
  last_notified_local_date TEXT,
  snoozed_until_iso TEXT,
  permission_state TEXT NOT NULL DEFAULT 'prompt' CHECK (permission_state IN ('granted', 'denied', 'prompt'))
);

INSERT OR IGNORE INTO reminder_config (
  id, enabled, local_time, quiet_start, quiet_end, autostart_opt_in, last_notified_local_date, snoozed_until_iso, permission_state
) VALUES (
  1, 0, '20:00', '22:00', '07:00', 0, NULL, NULL, 'prompt'
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value_json TEXT NOT NULL
);
