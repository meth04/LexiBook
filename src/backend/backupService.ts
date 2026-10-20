import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { unzipSync, zipSync } from 'fflate';
import type { LexiBookDbContext } from './db';
import { err, ok, validateSafeRelativePath } from './repositories';
import type {
  BackupFileEntry,
  BackupManifest,
  ExportBackupInput,
  ExportBackupResult,
  ImportBackupInput,
  ImportBackupResult,
  Result,
} from '../shared/types/contracts';

const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024; // 200 MB

interface BackupSnapshot {
  books: Array<Record<string, unknown>>;
  highlights: Array<Record<string, unknown>>;
  lexemes: Array<Record<string, unknown>>;
  senses: Array<Record<string, unknown>>;
  occurrences: Array<Record<string, unknown>>;
  study_cards: Array<Record<string, unknown>>;
  review_events: Array<Record<string, unknown>>;
  quiz_attempts: Array<Record<string, unknown>>;
  reminder_config: Array<Record<string, unknown>>;
  app_settings: Array<Record<string, unknown>>;
}

function sha256Hex(bytes: Uint8Array): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export function exportBackup(
  ctx: LexiBookDbContext,
  input: ExportBackupInput
): Result<ExportBackupResult> {
  try {
    const books = ctx.db.prepare('SELECT * FROM books ORDER BY added_at ASC').all() as Array<
      Record<string, unknown>
    >;
    const highlights = ctx.db
      .prepare('SELECT * FROM highlights ORDER BY created_at ASC')
      .all() as Array<Record<string, unknown>>;
    const lexemes = ctx.db
      .prepare('SELECT * FROM lexemes ORDER BY created_at ASC')
      .all() as Array<Record<string, unknown>>;
    const senses = ctx.db
      .prepare('SELECT * FROM senses ORDER BY created_at ASC')
      .all() as Array<Record<string, unknown>>;
    const occurrences = ctx.db
      .prepare('SELECT * FROM occurrences ORDER BY created_at ASC')
      .all() as Array<Record<string, unknown>>;
    const studyCards = ctx.db
      .prepare('SELECT * FROM study_cards ORDER BY created_at ASC')
      .all() as Array<Record<string, unknown>>;
    const reviewEvents = ctx.db
      .prepare('SELECT * FROM review_events ORDER BY reviewed_at ASC')
      .all() as Array<Record<string, unknown>>;
    const quizAttempts = ctx.db
      .prepare('SELECT * FROM quiz_attempts ORDER BY completed_at ASC')
      .all() as Array<Record<string, unknown>>;
    const reminderConfig = ctx.db.prepare('SELECT * FROM reminder_config').all() as Array<
      Record<string, unknown>
    >;
    const appSettings = ctx.db.prepare('SELECT * FROM app_settings').all() as Array<
      Record<string, unknown>
    >;

    const snapshot: BackupSnapshot = {
      books,
      highlights,
      lexemes,
      senses,
      occurrences,
      study_cards: studyCards,
      review_events: reviewEvents,
      quiz_attempts: quizAttempts,
      reminder_config: reminderConfig,
      app_settings: appSettings,
    };

    const archiveFiles: Record<string, Uint8Array> = {};
    const manifestFiles: BackupFileEntry[] = [];

    const snapshotBytes = new TextEncoder().encode(JSON.stringify(snapshot, null, 2));
    archiveFiles['snapshot.json'] = snapshotBytes;
    manifestFiles.push({
      relativePath: 'snapshot.json',
      sha256: sha256Hex(snapshotBytes),
      sizeBytes: snapshotBytes.byteLength,
    });

    if (input.includePdfs) {
      const seenPaths = new Set<string>();
      for (const b of books) {
        const managedPath = String(b.managed_path ?? '').replace(/\\/g, '/');
        if (!managedPath || seenPaths.has(managedPath)) continue;
        seenPaths.add(managedPath);

        const safeRes = validateSafeRelativePath(ctx.appDataDir, managedPath);
        if (!safeRes.ok) {
          return safeRes;
        }
        if (fs.existsSync(safeRes.data)) {
          const pdfBytes = new Uint8Array(fs.readFileSync(safeRes.data));
          archiveFiles[managedPath] = pdfBytes;
          manifestFiles.push({
            relativePath: managedPath,
            sha256: sha256Hex(pdfBytes),
            sizeBytes: pdfBytes.byteLength,
          });
        }
      }
    }

    const exportedAt = new Date().toISOString();
    const manifest: BackupManifest = {
      formatVersion: 1,
      schemaVersion: 1,
      appVersion: '0.1.0',
      exportedAt,
      includePdfs: Boolean(input.includePdfs),
      counts: {
        books: books.length,
        highlights: highlights.length,
        lexemes: lexemes.length,
        occurrences: occurrences.length,
        senses: senses.length,
        studyCards: studyCards.length,
        reviewEvents: reviewEvents.length,
      },
      files: manifestFiles,
    };

    archiveFiles['manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest, null, 2));

    const zipped = zipSync(archiveFiles, { level: 6 });
    const dateStamp = exportedAt.slice(0, 10);
    return ok({
      archiveFileName: `lexibook-backup-${dateStamp}.zip`,
      archiveBytesBase64: Buffer.from(zipped).toString('base64'),
      manifest,
    });
  } catch (e) {
    return err(
      'INTERNAL_ERROR',
      'Không thể tạo tệp sao lưu dữ liệu.',
      true,
      e instanceof Error ? e.message : String(e)
    );
  }
}

function isAllowedArchiveEntryName(entryName: string): boolean {
  if (!entryName || typeof entryName !== 'string') return false;
  if (
    entryName.includes('\0') ||
    entryName.includes(':') ||
    entryName.startsWith('/') ||
    entryName.startsWith('\\')
  ) {
    return false;
  }

  const normalized = entryName.replace(/\\/g, '/');
  const segments = normalized.split('/');
  if (segments.some((s) => s === '..' || s === '.' || s.length === 0)) {
    return false;
  }

  if (normalized === 'manifest.json' || normalized === 'snapshot.json') {
    return true;
  }

  if (
    segments.length === 2 &&
    segments[0] === 'books' &&
    /^[a-zA-Z0-9._-]+\.pdf$/i.test(segments[1])
  ) {
    return true;
  }

  return false;
}

function validateSnapshotReferentialIntegrity(snapshot: BackupSnapshot): Result<true> {
  if (
    !snapshot ||
    !Array.isArray(snapshot.books) ||
    !Array.isArray(snapshot.highlights) ||
    !Array.isArray(snapshot.lexemes) ||
    !Array.isArray(snapshot.senses) ||
    !Array.isArray(snapshot.occurrences) ||
    !Array.isArray(snapshot.study_cards) ||
    !Array.isArray(snapshot.review_events) ||
    !Array.isArray(snapshot.quiz_attempts)
  ) {
    return err('BACKUP_CORRUPT_DB', 'Cấu trúc bảng dữ liệu trong bản sao lưu bị hỏng hoặc thiếu.');
  }

  const bookIds = new Set<string>();
  for (const b of snapshot.books) {
    const id = String(b.id ?? '');
    const managedPath = String(b.managed_path ?? '');
    if (!id || !b.sha256 || !b.title || !isAllowedArchiveEntryName(managedPath)) {
      return err('BACKUP_CORRUPT_DB', 'Dữ liệu bảng books trong bản sao lưu không hợp lệ.');
    }
    bookIds.add(id);
  }

  const highlightIds = new Set<string>();
  for (const h of snapshot.highlights) {
    const id = String(h.id ?? '');
    const bookId = String(h.book_id ?? '');
    if (!id || !bookIds.has(bookId)) {
      return err(
        'BACKUP_CORRUPT_DB',
        'Phát hiện lỗi toàn vẹn khóa ngoại: highlight trỏ tới book_id không tồn tại.'
      );
    }
    highlightIds.add(id);
  }

  const lexemeIds = new Set<string>();
  for (const l of snapshot.lexemes) {
    const id = String(l.id ?? '');
    if (!id || !l.normalized_key) {
      return err('BACKUP_CORRUPT_DB', 'Dữ liệu bảng lexemes trong bản sao lưu không hợp lệ.');
    }
    lexemeIds.add(id);
  }

  const senseIds = new Set<string>();
  for (const s of snapshot.senses) {
    const id = String(s.id ?? '');
    const lexemeId = String(s.lexeme_id ?? '');
    if (!id || !lexemeIds.has(lexemeId)) {
      return err(
        'BACKUP_CORRUPT_DB',
        'Phát hiện lỗi toàn vẹn khóa ngoại: sense trỏ tới lexeme_id không tồn tại.'
      );
    }
    senseIds.add(id);
  }

  const occurrenceIds = new Set<string>();
  for (const o of snapshot.occurrences) {
    const id = String(o.id ?? '');
    const lexemeId = String(o.lexeme_id ?? '');
    const highlightId = String(o.highlight_id ?? '');
    const senseId = o.sense_id ? String(o.sense_id) : null;
    if (
      !id ||
      !lexemeIds.has(lexemeId) ||
      !highlightIds.has(highlightId) ||
      (senseId !== null && !senseIds.has(senseId))
    ) {
      return err(
        'BACKUP_CORRUPT_DB',
        'Phát hiện lỗi toàn vẹn khóa ngoại trong bảng occurrences.'
      );
    }
    occurrenceIds.add(id);
  }

  const studyCardIds = new Set<string>();
  for (const sc of snapshot.study_cards) {
    const id = String(sc.id ?? '');
    const senseId = String(sc.sense_id ?? '');
    const occId = String(sc.representative_occurrence_id ?? '');
    if (!id || !senseIds.has(senseId) || !occurrenceIds.has(occId)) {
      return err(
        'BACKUP_CORRUPT_DB',
        'Phát hiện lỗi toàn vẹn khóa ngoại trong bảng study_cards.'
      );
    }
    studyCardIds.add(id);
  }

  for (const rev of snapshot.review_events) {
    const id = String(rev.id ?? '');
    const cardId = String(rev.study_card_id ?? '');
    if (!id || !studyCardIds.has(cardId)) {
      return err(
        'BACKUP_CORRUPT_DB',
        'Phát hiện lỗi toàn vẹn khóa ngoại trong bảng review_events.'
      );
    }
  }

  return ok(true);
}

export function importBackup(
  ctx: LexiBookDbContext,
  input: ImportBackupInput
): Result<ImportBackupResult> {
  if (!input || !input.archiveBytesBase64) {
    return err('BACKUP_INVALID_ARCHIVE', 'Dữ liệu gói sao lưu trống hoặc không hợp lệ.');
  }

  let archiveBytes: Buffer;
  try {
    archiveBytes = Buffer.from(input.archiveBytesBase64, 'base64');
  } catch {
    return err('BACKUP_INVALID_ARCHIVE', 'Không thể giải mã Base64 của gói sao lưu.');
  }

  if (archiveBytes.byteLength === 0 || archiveBytes.byteLength > MAX_ARCHIVE_BYTES) {
    return err(
      'BACKUP_INVALID_ARCHIVE',
      'Kích thước gói sao lưu không hợp lệ hoặc vượt quá giới hạn an toàn (200 MB).'
    );
  }

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(archiveBytes));
  } catch (e) {
    return err(
      'BACKUP_INVALID_ARCHIVE',
      'Tệp nén ZIP bị hỏng hoặc không đúng định dạng.',
      false,
      e instanceof Error ? e.message : String(e)
    );
  }

  const entryNames = Object.keys(entries);
  if (entryNames.length === 0) {
    return err('BACKUP_INVALID_ARCHIVE', 'Gói sao lưu không chứa tệp nào.');
  }

  let totalUncompressed = 0;
  for (const rawName of entryNames) {
    if (!isAllowedArchiveEntryName(rawName)) {
      return err(
        'BACKUP_PATH_UNSAFE',
        `Phát hiện đường dẫn tệp không an toàn trong gói sao lưu: "${rawName}". Đã chặn khôi phục.`
      );
    }
    totalUncompressed += entries[rawName].byteLength;
    if (totalUncompressed > MAX_ARCHIVE_BYTES) {
      return err(
        'BACKUP_INVALID_ARCHIVE',
        'Tổng dung lượng giải nén vượt quá ngưỡng an toàn (chống Zip Bomb).'
      );
    }
  }

  const manifestBytes = entries['manifest.json'];
  const snapshotBytes = entries['snapshot.json'];
  if (!manifestBytes || !snapshotBytes) {
    return err(
      'BACKUP_INVALID_ARCHIVE',
      'Gói sao lưu thiếu tệp manifest.json hoặc snapshot.json bắt buộc.'
    );
  }

  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as BackupManifest;
  } catch {
    return err('BACKUP_INVALID_ARCHIVE', 'Không thể đọc cấu trúc manifest.json.');
  }

  if (
    !manifest ||
    manifest.formatVersion !== 1 ||
    manifest.schemaVersion !== 1 ||
    !Array.isArray(manifest.files)
  ) {
    return err(
      'BACKUP_INVALID_ARCHIVE',
      'Phiên bản định dạng gói sao lưu không tương thích với phiên bản ứng dụng hiện tại.'
    );
  }

  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexibook-restore-stage-'));
  try {
    // Stage and verify every file declared in manifest.files
    for (const fileEntry of manifest.files) {
      if (!isAllowedArchiveEntryName(fileEntry.relativePath)) {
        return err(
          'BACKUP_PATH_UNSAFE',
          `Đường dẫn trong manifest không an toàn: "${fileEntry.relativePath}".`
        );
      }

      const content = entries[fileEntry.relativePath];
      if (!content) {
        return err(
          'BACKUP_HASH_MISMATCH',
          `Thiếu tệp "${fileEntry.relativePath}" được khai báo trong manifest.`
        );
      }

      const actualHash = sha256Hex(content);
      if (actualHash.toLowerCase() !== String(fileEntry.sha256).toLowerCase()) {
        return err(
          'BACKUP_HASH_MISMATCH',
          `Mã băm SHA-256 của tệp "${fileEntry.relativePath}" không khớp với manifest. Dữ liệu có thể đã bị sửa đổi.`
        );
      }

      const stagedTarget = validateSafeRelativePath(stagingDir, fileEntry.relativePath);
      if (!stagedTarget.ok) {
        return err('BACKUP_PATH_UNSAFE', stagedTarget.error.messageVi);
      }

      fs.mkdirSync(path.dirname(stagedTarget.data), { recursive: true });
      fs.writeFileSync(stagedTarget.data, content);
    }

    let snapshot: BackupSnapshot;
    try {
      snapshot = JSON.parse(new TextDecoder().decode(snapshotBytes)) as BackupSnapshot;
    } catch {
      return err('BACKUP_CORRUPT_DB', 'Tệp snapshot.json bị hỏng cấu trúc JSON.');
    }

    const integrityRes = validateSnapshotReferentialIntegrity(snapshot);
    if (!integrityRes.ok) {
      return integrityRes;
    }

    if (
      snapshot.books.length !== manifest.counts.books ||
      snapshot.highlights.length !== manifest.counts.highlights ||
      snapshot.lexemes.length !== manifest.counts.lexemes
    ) {
      return err(
        'BACKUP_CORRUPT_DB',
        'Số lượng bản ghi trong snapshot không khớp với thống kê trong manifest.'
      );
    }

    // All staging and integrity checks passed! Now atomically replace database tables.
    ctx.db.exec('BEGIN IMMEDIATE');
    try {
      ctx.db.prepare('DELETE FROM review_events').run();
      ctx.db.prepare('DELETE FROM study_cards').run();
      ctx.db.prepare('DELETE FROM occurrences').run();
      ctx.db.prepare('DELETE FROM senses').run();
      ctx.db.prepare('DELETE FROM highlights').run();
      ctx.db.prepare('DELETE FROM lexemes').run();
      ctx.db.prepare('DELETE FROM quiz_attempts').run();
      ctx.db.prepare('DELETE FROM books').run();

      const insertBook = ctx.db.prepare(
        `INSERT INTO books (
          id, sha256, title, managed_path, page_count, last_page, last_scroll_offset,
          status, is_scan_only, added_at, last_opened_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const b of snapshot.books) {
        insertBook.run(
          String(b.id),
          String(b.sha256),
          String(b.title),
          String(b.managed_path),
          Number(b.page_count),
          Number(b.last_page ?? 1),
          Number(b.last_scroll_offset ?? 0),
          String(b.status ?? 'reading'),
          Number(b.is_scan_only ?? 0),
          String(b.added_at),
          b.last_opened_at ? String(b.last_opened_at) : null
        );
      }

      const insertHighlight = ctx.db.prepare(
        `INSERT INTO highlights (
          id, book_id, page_number_1based, selected_text, sentence_text, paragraph_text,
          text_anchor_json, normalized_quads_json, anchor_signature, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const h of snapshot.highlights) {
        insertHighlight.run(
          String(h.id),
          String(h.book_id),
          Number(h.page_number_1based),
          String(h.selected_text),
          String(h.sentence_text),
          String(h.paragraph_text),
          String(h.text_anchor_json),
          String(h.normalized_quads_json),
          String(h.anchor_signature),
          String(h.created_at)
        );
      }

      const insertLexeme = ctx.db.prepare(
        `INSERT INTO lexemes (id, normalized_key, canonical_form, part_of_speech, created_at)
         VALUES (?, ?, ?, ?, ?)`
      );
      for (const l of snapshot.lexemes) {
        insertLexeme.run(
          String(l.id),
          String(l.normalized_key),
          String(l.canonical_form),
          l.part_of_speech ? String(l.part_of_speech) : null,
          String(l.created_at)
        );
      }

      const insertSense = ctx.db.prepare(
        `INSERT INTO senses (
          id, lexeme_id, general_meanings_vi_json, contextual_meaning_vi, contextual_explanation_vi,
          contextual_translation_vi, ipa, collocation, example_en, example_vi, source_excerpt,
          generation_state, ai_metadata_json, user_edited_flags_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const s of snapshot.senses) {
        insertSense.run(
          String(s.id),
          String(s.lexeme_id),
          String(s.general_meanings_vi_json ?? '[]'),
          String(s.contextual_meaning_vi ?? ''),
          String(s.contextual_explanation_vi ?? ''),
          s.contextual_translation_vi ? String(s.contextual_translation_vi) : null,
          s.ipa ? String(s.ipa) : null,
          s.collocation ? String(s.collocation) : null,
          s.example_en ? String(s.example_en) : null,
          s.example_vi ? String(s.example_vi) : null,
          String(s.source_excerpt ?? ''),
          String(s.generation_state ?? 'succeeded'),
          s.ai_metadata_json ? String(s.ai_metadata_json) : null,
          String(s.user_edited_flags_json ?? '{}'),
          String(s.created_at),
          String(s.updated_at)
        );
      }

      const insertOccurrence = ctx.db.prepare(
        `INSERT INTO occurrences (id, lexeme_id, highlight_id, sense_id, created_at)
         VALUES (?, ?, ?, ?, ?)`
      );
      for (const o of snapshot.occurrences) {
        insertOccurrence.run(
          String(o.id),
          String(o.lexeme_id),
          String(o.highlight_id),
          o.sense_id ? String(o.sense_id) : null,
          String(o.created_at)
        );
      }

      const insertStudyCard = ctx.db.prepare(
        `INSERT INTO study_cards (
          id, sense_id, representative_occurrence_id, enabled, created_at, due_at, fsrs_state_json, is_mastered
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const sc of snapshot.study_cards) {
        insertStudyCard.run(
          String(sc.id),
          String(sc.sense_id),
          String(sc.representative_occurrence_id),
          Number(sc.enabled ?? 1),
          String(sc.created_at),
          String(sc.due_at),
          String(sc.fsrs_state_json),
          Number(sc.is_mastered ?? 0)
        );
      }

      const insertReviewEvent = ctx.db.prepare(
        `INSERT INTO review_events (
          id, study_card_id, reviewed_at, mode, grade, is_correct, response_ms, client_review_request_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const rev of snapshot.review_events) {
        insertReviewEvent.run(
          String(rev.id),
          String(rev.study_card_id),
          String(rev.reviewed_at),
          String(rev.mode ?? 'flashcard'),
          String(rev.grade),
          Number(rev.is_correct),
          Number(rev.response_ms ?? 0),
          String(rev.client_review_request_id)
        );
      }

      const insertQuizAttempt = ctx.db.prepare(
        `INSERT INTO quiz_attempts (
          id, client_attempt_id, book_id, total_questions, correct_count, answers_json, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      for (const qa of snapshot.quiz_attempts) {
        const qaBookId =
          qa.book_id && bookIdsHas(snapshot.books, String(qa.book_id))
            ? String(qa.book_id)
            : null;
        insertQuizAttempt.run(
          String(qa.id),
          String(qa.client_attempt_id),
          qaBookId,
          Number(qa.total_questions),
          Number(qa.correct_count),
          String(qa.answers_json ?? '[]'),
          String(qa.completed_at)
        );
      }

      if (Array.isArray(snapshot.reminder_config) && snapshot.reminder_config.length > 0) {
        const rc = snapshot.reminder_config[0];
        ctx.db
          .prepare(
            `UPDATE reminder_config
             SET enabled = ?, local_time = ?, quiet_start = ?, quiet_end = ?,
                 autostart_opt_in = ?, last_notified_local_date = ?, snoozed_until_iso = ?, permission_state = ?
             WHERE id = 1`
          )
          .run(
            Number(rc.enabled ?? 0),
            String(rc.local_time ?? '20:00'),
            rc.quiet_start ? String(rc.quiet_start) : null,
            rc.quiet_end ? String(rc.quiet_end) : null,
            Number(rc.autostart_opt_in ?? 0),
            rc.last_notified_local_date ? String(rc.last_notified_local_date) : null,
            rc.snoozed_until_iso ? String(rc.snoozed_until_iso) : null,
            String(rc.permission_state ?? 'prompt')
          );
      }

      if (Array.isArray(snapshot.app_settings)) {
        ctx.db.prepare('DELETE FROM app_settings').run();
        const insertSetting = ctx.db.prepare(
          'INSERT INTO app_settings (key, value_json) VALUES (?, ?)'
        );
        for (const s of snapshot.app_settings) {
          if (s.key && s.value_json) {
            insertSetting.run(String(s.key), String(s.value_json));
          }
        }
      }

      ctx.db.exec('COMMIT');
    } catch (e) {
      ctx.db.exec('ROLLBACK');
      return err(
        'BACKUP_CORRUPT_DB',
        'Lỗi giao dịch khi khôi phục dữ liệu vào SQLite. Dữ liệu hiện tại được giữ nguyên.',
        false,
        e instanceof Error ? e.message : String(e)
      );
    }

    // Copy verified PDF files from staging into managed books directory
    for (const fileEntry of manifest.files) {
      if (fileEntry.relativePath.startsWith('books/')) {
        const stagedPathRes = validateSafeRelativePath(stagingDir, fileEntry.relativePath);
        const livePathRes = validateSafeRelativePath(ctx.appDataDir, fileEntry.relativePath);
        if (stagedPathRes.ok && livePathRes.ok && fs.existsSync(stagedPathRes.data)) {
          fs.mkdirSync(path.dirname(livePathRes.data), { recursive: true });
          fs.copyFileSync(stagedPathRes.data, livePathRes.data);
        }
      }
    }

    return ok({
      manifest,
      restoredBooks: snapshot.books.length,
      restoredHighlights: snapshot.highlights.length,
      restoredStudyCards: snapshot.study_cards.length,
    });
  } finally {
    try {
      fs.rmSync(stagingDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup error
    }
  }
}

function bookIdsHas(books: Array<Record<string, unknown>>, targetId: string): boolean {
  return books.some((b) => String(b.id) === targetId);
}
