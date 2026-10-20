import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { LexiBookDbContext } from './db';
import { getAppSettings as readAppSettings, updateAppSettings as writeAppSettings } from './reminderService';
import type {
  AiAnalysisMetadata,
  AppError,
  AppSettings,
  Book,
  BookStatus,
  CreateHighlightInput,
  CreateHighlightResult,
  DeleteVocabularyInput,
  EditSenseInput,
  FsrsPersistedState,
  GenerationState,
  Highlight,
  ImportPdfInput,
  ImportPdfResult,
  Lexeme,
  ListBooksFilter,
  ListVocabularyFilter,
  NormalizedQuad,
  Occurrence,
  OccurrenceWithContext,
  RemoveBookInput,
  Result,
  SavePositionInput,
  Sense,
  SetStudyOptInInput,
  StudyCard,
  TextAnchor,
  UpdateBookInput,
  UserEditedFlags,
  VocabularyListItem,
  VocabularyStudyStatus,
} from '../shared/types/contracts';
import {
  cleanCanonicalForm,
  computeAnchorSignature,
  normalizeLexemeKey,
} from '../shared/utils/textNormalization';

const MAX_PDF_BYTES = 50 * 1024 * 1024; // 50 MB

export function makeError(
  code: AppError['code'],
  messageVi: string,
  retryable = false,
  details?: string
): AppError {
  return { code, messageVi, retryable, details };
}

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function err<T>(
  code: AppError['code'],
  messageVi: string,
  retryable = false,
  details?: string
): Result<T> {
  return { ok: false, error: makeError(code, messageVi, retryable, details) };
}

/**
 * Validates that `relPath` is a safe relative path inside `baseDir` with no traversal (`..`),
 * drive letters/colons, leading slashes, null bytes, or symbolic links.
 */
export function validateSafeRelativePath(baseDir: string, relPath: string): Result<string> {
  if (!relPath || typeof relPath !== 'string' || relPath.trim().length === 0) {
    return err('PATH_TRAVERSAL_BLOCKED', 'Đường dẫn tệp không hợp lệ hoặc để trống.');
  }

  if (
    relPath.includes('\0') ||
    relPath.includes(':') ||
    relPath.startsWith('/') ||
    relPath.startsWith('\\')
  ) {
    return err('PATH_TRAVERSAL_BLOCKED', 'Phát hiện đường dẫn tuyệt đối hoặc ký tự không an toàn.');
  }

  const normalizedRel = relPath.replace(/\\/g, '/');
  const segments = normalizedRel.split('/');
  if (segments.some((seg) => seg === '..' || seg === '.' || seg.length === 0)) {
    return err('PATH_TRAVERSAL_BLOCKED', 'Phát hiện truy cập vượt cấp thư mục (Path Traversal).');
  }

  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(baseDir, normalizedRel);
  const relativeFromBase = path.relative(resolvedBase, resolvedTarget);

  if (
    relativeFromBase.startsWith('..') ||
    path.isAbsolute(relativeFromBase) ||
    relativeFromBase.length === 0
  ) {
    return err('PATH_TRAVERSAL_BLOCKED', 'Đường dẫn nằm ngoài thư mục dữ liệu được quản lý.');
  }

  // Check intermediate and target paths for symbolic links if they exist on disk
  let currentCheck = resolvedBase;
  for (const seg of segments) {
    currentCheck = path.join(currentCheck, seg);
    if (fs.existsSync(currentCheck)) {
      const stat = fs.lstatSync(currentCheck);
      if (stat.isSymbolicLink()) {
        return err('PATH_TRAVERSAL_BLOCKED', 'Không chấp nhận liên kết tượng trưng (symlink).');
      }
    }
  }

  return ok(resolvedTarget);
}

interface BookRow {
  id: string;
  sha256: string;
  title: string;
  managed_path: string;
  page_count: number;
  last_page: number;
  last_scroll_offset: number;
  status: BookStatus;
  is_scan_only: number;
  added_at: string;
  last_opened_at: string | null;
  highlight_count?: number;
  unique_term_count?: number;
  due_card_count?: number;
}

interface HighlightRow {
  id: string;
  book_id: string;
  page_number_1based: number;
  selected_text: string;
  sentence_text: string;
  paragraph_text: string;
  text_anchor_json: string;
  normalized_quads_json: string;
  anchor_signature: string;
  created_at: string;
}

interface LexemeRow {
  id: string;
  normalized_key: string;
  canonical_form: string;
  part_of_speech: string | null;
  created_at: string;
}

interface SenseRow {
  id: string;
  lexeme_id: string;
  general_meanings_vi_json: string;
  contextual_meaning_vi: string;
  contextual_explanation_vi: string;
  contextual_translation_vi: string | null;
  ipa: string | null;
  collocation: string | null;
  example_en: string | null;
  example_vi: string | null;
  source_excerpt: string;
  generation_state: GenerationState;
  ai_metadata_json: string | null;
  user_edited_flags_json: string;
  created_at: string;
  updated_at: string;
}

interface OccurrenceRow {
  id: string;
  lexeme_id: string;
  highlight_id: string;
  sense_id: string | null;
  created_at: string;
}

interface StudyCardRow {
  id: string;
  sense_id: string;
  representative_occurrence_id: string;
  enabled: number;
  created_at: string;
  due_at: string;
  fsrs_state_json: string;
  is_mastered: number;
}

export function decodePdfStringLiteral(rawLiteral: string): string {
  if (!rawLiteral) return '';
  const bytes: number[] = [];
  let i = 0;
  while (i < rawLiteral.length) {
    const ch = rawLiteral[i];
    if (ch === '\\' && i + 1 < rawLiteral.length) {
      const next = rawLiteral[i + 1];
      if (next >= '0' && next <= '7') {
        let oct = next;
        i += 2;
        if (i < rawLiteral.length && rawLiteral[i] >= '0' && rawLiteral[i] <= '7') {
          oct += rawLiteral[i++];
          if (i < rawLiteral.length && rawLiteral[i] >= '0' && rawLiteral[i] <= '7') {
            oct += rawLiteral[i++];
          }
        }
        bytes.push(parseInt(oct, 8) & 0xff);
        continue;
      }
      i += 2;
      if (next === 'n') bytes.push(10);
      else if (next === 'r') bytes.push(13);
      else if (next === 't') bytes.push(9);
      else if (next === 'b') bytes.push(8);
      else if (next === 'f') bytes.push(12);
      else bytes.push(next.charCodeAt(0) & 0xff);
      continue;
    }
    bytes.push(rawLiteral.charCodeAt(i) & 0xff);
    i++;
  }

  const u8 = Uint8Array.from(bytes);
  let decoded = '';
  if (u8.length >= 2 && u8[0] === 0xfe && u8[1] === 0xff) {
    decoded = new TextDecoder('utf-16be').decode(u8.subarray(2));
  } else if (u8.length >= 2 && u8[0] === 0xff && u8[1] === 0xfe) {
    decoded = new TextDecoder('utf-16le').decode(u8.subarray(2));
  } else if (u8.length >= 4 && u8[0] === 0x00 && u8[1] !== 0x00 && u8[2] === 0x00) {
    decoded = new TextDecoder('utf-16be').decode(u8);
  } else {
    try {
      decoded = new TextDecoder('utf-8', { fatal: true }).decode(u8);
    } catch {
      decoded = new TextDecoder('latin1').decode(u8);
    }
  }

  const stripped = Array.from(decoded)
    .map((c) => {
      const code = c.charCodeAt(0);
      return code <= 0x1f || (code >= 0x7f && code <= 0x9f) ? ' ' : c;
    })
    .join('');

  return stripped
    .replace(/\s*,,\s*/g, ' \u2014 ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function mapBookRow(row: BookRow): Book {
  const cleanTitle =
    row.title.includes('\u0000') || row.title.startsWith('\u00fe\u00ff')
      ? decodePdfStringLiteral(row.title)
      : row.title.replace(/\s*,,\s*/g, ' \u2014 ').trim();

  return {
    id: row.id,
    sha256: row.sha256,
    title: cleanTitle || row.title,
    managedPath: row.managed_path,
    pageCount: Number(row.page_count),
    lastPage: Number(row.last_page),
    lastScrollOffset: Number(row.last_scroll_offset),
    status: row.status,
    isScanOnly: Boolean(row.is_scan_only),
    addedAt: row.added_at,
    lastOpenedAt: row.last_opened_at ?? null,
    highlightCount: row.highlight_count !== undefined ? Number(row.highlight_count) : undefined,
    uniqueTermCount: row.unique_term_count !== undefined ? Number(row.unique_term_count) : undefined,
    dueCardCount: row.due_card_count !== undefined ? Number(row.due_card_count) : undefined,
  };
}

export function mapHighlightRow(row: HighlightRow): Highlight {
  return {
    id: row.id,
    bookId: row.book_id,
    pageNumber1Based: Number(row.page_number_1based),
    selectedText: row.selected_text,
    sentenceText: row.sentence_text,
    paragraphText: row.paragraph_text,
    textAnchor: JSON.parse(row.text_anchor_json) as TextAnchor,
    normalizedQuads: JSON.parse(row.normalized_quads_json) as NormalizedQuad[],
    createdAt: row.created_at,
  };
}

export function mapLexemeRow(row: LexemeRow): Lexeme {
  return {
    id: row.id,
    normalizedKey: row.normalized_key,
    canonicalForm: row.canonical_form,
    partOfSpeech: row.part_of_speech ?? null,
    createdAt: row.created_at,
  };
}

export function mapSenseRow(row: SenseRow): Sense {
  return {
    id: row.id,
    lexemeId: row.lexeme_id,
    generalMeaningsVi: JSON.parse(row.general_meanings_vi_json || '[]') as string[],
    contextualMeaningVi: row.contextual_meaning_vi,
    contextualExplanationVi: row.contextual_explanation_vi,
    contextualTranslationVi: row.contextual_translation_vi ?? null,
    ipa: row.ipa ?? null,
    collocation: row.collocation ?? null,
    exampleEn: row.example_en ?? null,
    exampleVi: row.example_vi ?? null,
    sourceExcerpt: row.source_excerpt,
    generationState: row.generation_state,
    aiMetadata: row.ai_metadata_json
      ? (JSON.parse(row.ai_metadata_json) as AiAnalysisMetadata)
      : null,
    userEditedFlags: JSON.parse(row.user_edited_flags_json || '{}') as UserEditedFlags,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapOccurrenceRow(row: OccurrenceRow): Occurrence {
  return {
    id: row.id,
    lexemeId: row.lexeme_id,
    highlightId: row.highlight_id,
    senseId: row.sense_id ?? null,
    createdAt: row.created_at,
  };
}

export function mapStudyCardRow(row: StudyCardRow): StudyCard {
  return {
    id: row.id,
    senseId: row.sense_id,
    representativeOccurrenceId: row.representative_occurrence_id,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    dueAt: row.due_at,
    fsrsState: JSON.parse(row.fsrs_state_json) as FsrsPersistedState,
    isMastered: Boolean(row.is_mastered),
  };
}

function inspectPdfBytes(
  bytes: Buffer,
  fallbackFileName: string
): Result<{ title: string; pageCount: number; isScanOnly: boolean }> {
  if (bytes.byteLength === 0) {
    return err('INVALID_PDF_HEADER', 'Tệp PDF trống hoặc không hợp lệ.');
  }
  if (bytes.byteLength > MAX_PDF_BYTES) {
    return err(
      'PDF_OVERSIZED',
      'Tệp PDF vượt quá giới hạn dung lượng 50 MB của phiên bản MVP.'
    );
  }

  const rawText = bytes.toString('latin1');
  if (!rawText.startsWith('%PDF-') || !rawText.includes('%%EOF')) {
    return err(
      'INVALID_PDF_HEADER',
      'Tệp không đúng định dạng PDF chuẩn hoặc đã bị hỏng (thiếu cấu trúc %PDF / %%EOF).'
    );
  }

  if (/\/Encrypt\b/.test(rawText)) {
    return err(
      'PDF_ENCRYPTED',
      'Tệp PDF được bảo vệ bằng mật khẩu hoặc mã hóa DRM. Vui lòng mở khóa tệp trước khi nhập.'
    );
  }

  const pagesBlocks = [
    ...rawText.matchAll(
      /<<(?:(?!>>|\bstream\b)[\s\S])*?\/Type\s*\/Pages\b(?:(?!>>|\bstream\b)[\s\S])*?>>/g
    ),
  ];
  const declaredCounts = pagesBlocks
    .map((m) => {
      const c = m[0].match(/\/Count\s+(\d+)/);
      return c ? Number(c[1]) : 0;
    })
    .filter((n) => n > 0);

  const pageMatches = rawText.match(/\/Type\s*\/Page\b(?!s)/g);
  const pageCount =
    declaredCounts.length > 0
      ? Math.max(...declaredCounts)
      : Math.max(1, pageMatches ? pageMatches.length : 1);

  const hasFont = /\/Font\b/.test(rawText) || /\/BaseFont\b/.test(rawText);
  const hasExplicitStreamText =
    /\(([^)]+)\)\s*Tj/.test(rawText) || /\[([^\]]+)\]\s*TJ/.test(rawText);
  const hasFlateStream = /\/FlateDecode\b/.test(rawText);
  const isScanOnly = !(hasExplicitStreamText || (hasFont && hasFlateStream));

  const cleanedFallback = path
    .basename(fallbackFileName || 'Untitled.pdf')
    .replace(/\.pdf$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();

  const titleMatch = rawText.match(/\/Title\s*\(((?:\\.|[^\\)])*)\)/);
  const extractedTitle = titleMatch ? decodePdfStringLiteral(titleMatch[1]) : '';

  const title = extractedTitle || cleanedFallback || 'Sách PDF chưa đặt tên';
  return ok({ title, pageCount, isScanOnly });
}

export function createRepositories(ctx: LexiBookDbContext) {
  function getBookWithCounts(bookId: string): Book | null {
    const nowIso = new Date().toISOString();
    const row = ctx.db
      .prepare(
        `SELECT b.*,
          (SELECT COUNT(*) FROM highlights h WHERE h.book_id = b.id) AS highlight_count,
          (SELECT COUNT(DISTINCT o.lexeme_id)
             FROM occurrences o
             JOIN highlights h ON h.id = o.highlight_id
            WHERE h.book_id = b.id) AS unique_term_count,
          (SELECT COUNT(DISTINCT sc.id)
             FROM study_cards sc
             JOIN occurrences o ON o.id = sc.representative_occurrence_id
             JOIN highlights h ON h.id = o.highlight_id
            WHERE h.book_id = b.id AND sc.enabled = 1 AND sc.due_at <= ?) AS due_card_count
         FROM books b
         WHERE b.id = ?`
      )
      .get(nowIso, bookId) as BookRow | undefined;

    return row ? mapBookRow(row) : null;
  }

  function importPdf(input: ImportPdfInput): Result<ImportPdfResult> {
    if (!input || !input.bytesBase64) {
      return err('VALIDATION_ERROR', 'Dữ liệu tệp PDF đầu vào không hợp lệ.');
    }

    let bytes: Buffer;
    try {
      bytes = Buffer.from(input.bytesBase64, 'base64');
    } catch {
      return err('INVALID_PDF_HEADER', 'Không thể giải mã dữ liệu Base64 của tệp PDF.');
    }

    const inspection = inspectPdfBytes(bytes, input.fileName);
    if (!inspection.ok) {
      return inspection;
    }

    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    const resolution = input.duplicateResolution ?? 'prompt';

    const existingRow = ctx.db
      .prepare('SELECT id FROM books WHERE sha256 = ? ORDER BY added_at ASC LIMIT 1')
      .get(sha256) as { id: string } | undefined;

    if (existingRow && resolution !== 'import_copy') {
      // Auto-heal existing record if it was previously imported with garbled UTF-16 title or stale scan flag
      ctx.db
        .prepare(
          `UPDATE books
           SET title = CASE WHEN instr(title, char(0)) > 0 OR title LIKE 'þÿ%' THEN ? ELSE title END,
               page_count = ?,
               is_scan_only = ?
           WHERE id = ?`
        )
        .run(
          inspection.data.title,
          inspection.data.pageCount,
          inspection.data.isScanOnly ? 1 : 0,
          existingRow.id
        );

      const existingBook = getBookWithCounts(existingRow.id)!;
      if (resolution === 'prompt') {
        return ok({
          status: 'duplicate_detected',
          book: existingBook,
          existingBook,
        });
      }

      if (resolution === 'open_existing') {
        const nowIso = new Date().toISOString();
        ctx.db
          .prepare('UPDATE books SET last_opened_at = ? WHERE id = ?')
          .run(nowIso, existingBook.id);
        const updatedBook = getBookWithCounts(existingBook.id)!;
        return ok({
          status: 'opened_existing',
          book: updatedBook,
          existingBook: updatedBook,
        });
      }
    }

    const bookId = crypto.randomUUID();
    const managedPath = `books/${bookId.slice(0, 8)}_${sha256.slice(0, 16)}.pdf`;
    const safeTarget = validateSafeRelativePath(ctx.appDataDir, managedPath);
    if (!safeTarget.ok) {
      return safeTarget;
    }

    fs.mkdirSync(path.dirname(safeTarget.data), { recursive: true });
    fs.writeFileSync(safeTarget.data, bytes);

    const nowIso = new Date().toISOString();
    ctx.db
      .prepare(
        `INSERT INTO books (
          id, sha256, title, managed_path, page_count, last_page, last_scroll_offset,
          status, is_scan_only, added_at, last_opened_at
        ) VALUES (?, ?, ?, ?, ?, 1, 0.0, 'reading', ?, ?, ?)`
      )
      .run(
        bookId,
        sha256,
        inspection.data.title,
        managedPath,
        inspection.data.pageCount,
        inspection.data.isScanOnly ? 1 : 0,
        nowIso,
        nowIso
      );

    const createdBook = getBookWithCounts(bookId)!;
    return ok({
      status: 'imported',
      book: createdBook,
    });
  }

  function listBooks(filter?: ListBooksFilter): Result<Book[]> {
    const nowIso = new Date().toISOString();
    const conditions: string[] = [];
    const params: Array<string | number> = [nowIso];

    if (filter?.status && filter.status !== 'all') {
      conditions.push('b.status = ?');
      params.push(filter.status);
    }

    if (filter?.search && filter.search.trim().length > 0) {
      conditions.push('LOWER(b.title) LIKE ?');
      params.push(`%${filter.search.trim().toLowerCase()}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = ctx.db
      .prepare(
        `SELECT b.*,
          (SELECT COUNT(*) FROM highlights h WHERE h.book_id = b.id) AS highlight_count,
          (SELECT COUNT(DISTINCT o.lexeme_id)
             FROM occurrences o
             JOIN highlights h ON h.id = o.highlight_id
            WHERE h.book_id = b.id) AS unique_term_count,
          (SELECT COUNT(DISTINCT sc.id)
             FROM study_cards sc
             JOIN occurrences o ON o.id = sc.representative_occurrence_id
             JOIN highlights h ON h.id = o.highlight_id
            WHERE h.book_id = b.id AND sc.enabled = 1 AND sc.due_at <= ?) AS due_card_count
         FROM books b
         ${whereClause}
         ORDER BY COALESCE(b.last_opened_at, b.added_at) DESC`
      )
      .all(...params) as unknown as BookRow[];

    return ok(rows.map(mapBookRow));
  }

  function getBook(bookId: string): Result<Book> {
    const book = getBookWithCounts(bookId);
    if (!book) {
      return err('NOT_FOUND', 'Không tìm thấy sách trong thư viện.');
    }
    return ok(book);
  }

  function getBookPdfBytes(bookId: string): Result<{ bytesBase64: string; sha256: string }> {
    const book = getBookWithCounts(bookId);
    if (!book) {
      return err('NOT_FOUND', 'Không tìm thấy sách trong thư viện.');
    }

    const safePath = validateSafeRelativePath(ctx.appDataDir, book.managedPath);
    if (!safePath.ok) {
      return safePath;
    }

    if (!fs.existsSync(safePath.data)) {
      return err('NOT_FOUND', 'Tệp PDF được quản lý không tồn tại trên ổ đĩa.');
    }

    const bytes = fs.readFileSync(safePath.data);
    return ok({
      bytesBase64: bytes.toString('base64'),
      sha256: book.sha256,
    });
  }

  function updateBook(input: UpdateBookInput): Result<Book> {
    const existing = getBookWithCounts(input.bookId);
    if (!existing) {
      return err('NOT_FOUND', 'Không tìm thấy sách để cập nhật.');
    }

    const nextTitle =
      input.title !== undefined && input.title.trim().length > 0
        ? input.title.trim()
        : existing.title;
    const nextStatus = input.status ?? existing.status;

    ctx.db
      .prepare('UPDATE books SET title = ?, status = ? WHERE id = ?')
      .run(nextTitle, nextStatus, input.bookId);

    return ok(getBookWithCounts(input.bookId)!);
  }

  function removeBook(input: RemoveBookInput): Result<{ removedBookId: string }> {
    const existing = getBookWithCounts(input.bookId);
    if (!existing) {
      return err('NOT_FOUND', 'Không tìm thấy sách để xóa.');
    }

    ctx.db.exec('BEGIN IMMEDIATE');
    try {
      ctx.db.prepare('DELETE FROM books WHERE id = ?').run(input.bookId);

      if (input.deleteRetainedVocabulary) {
        ctx.db
          .prepare(
            `DELETE FROM lexemes
             WHERE id NOT IN (SELECT DISTINCT lexeme_id FROM occurrences)`
          )
          .run();
      }
      ctx.db.exec('COMMIT');
    } catch (e) {
      ctx.db.exec('ROLLBACK');
      return err(
        'DB_ERROR',
        'Lỗi cơ sở dữ liệu khi xóa sách.',
        false,
        e instanceof Error ? e.message : String(e)
      );
    }

    if (input.deleteManagedFile) {
      const otherRefs = ctx.db
        .prepare('SELECT COUNT(*) AS cnt FROM books WHERE managed_path = ?')
        .get(existing.managedPath) as { cnt: number } | undefined;

      if (Number(otherRefs?.cnt ?? 0) === 0) {
        const safePath = validateSafeRelativePath(ctx.appDataDir, existing.managedPath);
        if (safePath.ok && fs.existsSync(safePath.data)) {
          fs.unlinkSync(safePath.data);
        }
      }
    }

    return ok({ removedBookId: input.bookId });
  }

  function saveReadingPosition(input: SavePositionInput): Result<Book> {
    const existing = getBookWithCounts(input.bookId);
    if (!existing) {
      return err('NOT_FOUND', 'Không tìm thấy sách để lưu vị trí đọc.');
    }

    const clampedPage = Math.max(1, Math.min(existing.pageCount, Math.round(input.pageNumber1Based)));
    const clampedOffset = Math.max(0, Math.min(1, Number(input.scrollOffsetNormalized) || 0));
    const nowIso = new Date().toISOString();

    ctx.db
      .prepare(
        `UPDATE books
         SET last_page = ?, last_scroll_offset = ?, last_opened_at = ?
         WHERE id = ?`
      )
      .run(clampedPage, clampedOffset, nowIso, input.bookId);

    return ok(getBookWithCounts(input.bookId)!);
  }

  function getOccurrenceWithContextById(occurrenceId: string): OccurrenceWithContext | null {
    const occRow = ctx.db
      .prepare('SELECT * FROM occurrences WHERE id = ?')
      .get(occurrenceId) as OccurrenceRow | undefined;
    if (!occRow) return null;

    const highlightRow = ctx.db
      .prepare('SELECT * FROM highlights WHERE id = ?')
      .get(occRow.highlight_id) as HighlightRow | undefined;
    const lexemeRow = ctx.db
      .prepare('SELECT * FROM lexemes WHERE id = ?')
      .get(occRow.lexeme_id) as LexemeRow | undefined;
    if (!highlightRow || !lexemeRow) return null;

    const senseRow = occRow.sense_id
      ? (ctx.db
          .prepare('SELECT * FROM senses WHERE id = ?')
          .get(occRow.sense_id) as SenseRow | undefined)
      : undefined;

    const bookRow = ctx.db
      .prepare('SELECT title FROM books WHERE id = ?')
      .get(highlightRow.book_id) as { title: string } | undefined;

    const studyCardRow = occRow.sense_id
      ? (ctx.db
          .prepare('SELECT * FROM study_cards WHERE sense_id = ?')
          .get(occRow.sense_id) as StudyCardRow | undefined)
      : undefined;

    return {
      occurrence: mapOccurrenceRow(occRow),
      highlight: mapHighlightRow(highlightRow),
      lexeme: mapLexemeRow(lexemeRow),
      sense: senseRow ? mapSenseRow(senseRow) : null,
      bookTitle: bookRow?.title ?? 'Sách không xác định',
      studyCard: studyCardRow ? mapStudyCardRow(studyCardRow) : null,
    };
  }

  function createHighlight(input: CreateHighlightInput): Result<CreateHighlightResult> {
    const cleanSelected = cleanCanonicalForm(input.selectedText ?? '');
    const normalizedKey = normalizeLexemeKey(input.selectedText ?? '');

    if (!cleanSelected || !normalizedKey) {
      return err('VALIDATION_ERROR', 'Cụm từ được chọn không hợp lệ hoặc để trống.');
    }

    if (input.pageNumber1Based < 1) {
      return err('VALIDATION_ERROR', 'Số trang PDF phải lớn hơn hoặc bằng 1.');
    }

    const bookExists = ctx.db
      .prepare('SELECT id FROM books WHERE id = ?')
      .get(input.bookId) as { id: string } | undefined;
    if (!bookExists) {
      return err('NOT_FOUND', 'Không tìm thấy sách tương ứng với đánh dấu này.');
    }

    const anchorSignature = computeAnchorSignature(
      input.pageNumber1Based,
      input.textAnchor.startOffset,
      input.textAnchor.endOffset,
      input.selectedText
    );

    // Check idempotent duplicate highlight on the exact same passage
    const existingHighlightRow = ctx.db
      .prepare(
        `SELECT * FROM highlights
         WHERE book_id = ? AND page_number_1based = ? AND anchor_signature = ?`
      )
      .get(input.bookId, input.pageNumber1Based, anchorSignature) as HighlightRow | undefined;

    if (existingHighlightRow) {
      const occRow = ctx.db
        .prepare('SELECT * FROM occurrences WHERE highlight_id = ?')
        .get(existingHighlightRow.id) as OccurrenceRow | undefined;

      if (occRow) {
        const lexRow = ctx.db
          .prepare('SELECT * FROM lexemes WHERE id = ?')
          .get(occRow.lexeme_id) as unknown as LexemeRow;
        const senseRow = occRow.sense_id
          ? (ctx.db
              .prepare('SELECT * FROM senses WHERE id = ?')
              .get(occRow.sense_id) as SenseRow | undefined)
          : undefined;

        return ok({
          highlight: mapHighlightRow(existingHighlightRow),
          lexeme: mapLexemeRow(lexRow),
          occurrence: mapOccurrenceRow(occRow),
          sense: senseRow ? mapSenseRow(senseRow) : null,
          deduplicated: true,
        });
      }
    }

    const nowIso = new Date().toISOString();
    const highlightId = crypto.randomUUID();
    const occurrenceId = crypto.randomUUID();

    ctx.db.exec('BEGIN IMMEDIATE');
    try {
      ctx.db
        .prepare(
          `INSERT INTO highlights (
            id, book_id, page_number_1based, selected_text, sentence_text,
            paragraph_text, text_anchor_json, normalized_quads_json, anchor_signature, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          highlightId,
          input.bookId,
          input.pageNumber1Based,
          input.selectedText.trim(),
          input.sentenceText.trim() || input.selectedText.trim(),
          (input.paragraphText || input.sentenceText || input.selectedText).trim().slice(0, 800),
          JSON.stringify(input.textAnchor),
          JSON.stringify(input.normalizedQuads),
          anchorSignature,
          nowIso
        );

      let lexemeRow = ctx.db
        .prepare('SELECT * FROM lexemes WHERE normalized_key = ?')
        .get(normalizedKey) as LexemeRow | undefined;

      if (!lexemeRow) {
        const lexemeId = crypto.randomUUID();
        ctx.db
          .prepare(
            `INSERT INTO lexemes (id, normalized_key, canonical_form, part_of_speech, created_at)
             VALUES (?, ?, ?, NULL, ?)`
          )
          .run(lexemeId, normalizedKey, cleanSelected, nowIso);

        lexemeRow = ctx.db
          .prepare('SELECT * FROM lexemes WHERE id = ?')
          .get(lexemeId) as unknown as LexemeRow;
      }

      ctx.db
        .prepare(
          `INSERT INTO occurrences (id, lexeme_id, highlight_id, sense_id, created_at)
           VALUES (?, ?, ?, NULL, ?)`
        )
        .run(occurrenceId, lexemeRow.id, highlightId, nowIso);

      ctx.db
        .prepare('UPDATE books SET last_opened_at = ? WHERE id = ?')
        .run(nowIso, input.bookId);

      ctx.db.exec('COMMIT');

      const insertedHighlight = ctx.db
        .prepare('SELECT * FROM highlights WHERE id = ?')
        .get(highlightId) as unknown as HighlightRow;
      const insertedOccurrence = ctx.db
        .prepare('SELECT * FROM occurrences WHERE id = ?')
        .get(occurrenceId) as unknown as OccurrenceRow;

      return ok({
        highlight: mapHighlightRow(insertedHighlight),
        lexeme: mapLexemeRow(lexemeRow),
        occurrence: mapOccurrenceRow(insertedOccurrence),
        sense: null,
        deduplicated: false,
      });
    } catch (e) {
      ctx.db.exec('ROLLBACK');
      return err(
        'DB_ERROR',
        'Không thể lưu đánh dấu vào cơ sở dữ liệu.',
        true,
        e instanceof Error ? e.message : String(e)
      );
    }
  }

  function listHighlights(
    bookId: string,
    pageNumber1Based?: number
  ): Result<OccurrenceWithContext[]> {
    const params: Array<string | number> = [bookId];
    let pageFilter = '';
    if (pageNumber1Based !== undefined) {
      pageFilter = 'AND h.page_number_1based = ?';
      params.push(pageNumber1Based);
    }

    const occIds = ctx.db
      .prepare(
        `SELECT o.id
         FROM occurrences o
         JOIN highlights h ON h.id = o.highlight_id
         WHERE h.book_id = ? ${pageFilter}
         ORDER BY h.page_number_1based ASC, h.created_at DESC`
      )
      .all(...params) as unknown as Array<{ id: string }>;

    const items: OccurrenceWithContext[] = [];
    for (const row of occIds) {
      const full = getOccurrenceWithContextById(row.id);
      if (full) items.push(full);
    }

    return ok(items);
  }

  function removeHighlight(highlightId: string): Result<{ removedHighlightId: string }> {
    const existing = ctx.db
      .prepare('SELECT id FROM highlights WHERE id = ?')
      .get(highlightId) as { id: string } | undefined;

    if (!existing) {
      return err('NOT_FOUND', 'Không tìm thấy đánh dấu cần xóa.');
    }

    ctx.db.prepare('DELETE FROM highlights WHERE id = ?').run(highlightId);
    return ok({ removedHighlightId: highlightId });
  }

  function buildVocabularyListItem(lexemeRow: LexemeRow): VocabularyListItem {
    const occRows = ctx.db
      .prepare(
        `SELECT o.id
         FROM occurrences o
         JOIN highlights h ON h.id = o.highlight_id
         WHERE o.lexeme_id = ?
         ORDER BY o.created_at DESC`
      )
      .all(lexemeRow.id) as unknown as Array<{ id: string }>;

    const occurrences: OccurrenceWithContext[] = [];
    for (const r of occRows) {
      const full = getOccurrenceWithContextById(r.id);
      if (full) occurrences.push(full);
    }

    const sensesRows = ctx.db
      .prepare('SELECT * FROM senses WHERE lexeme_id = ? ORDER BY updated_at DESC')
      .all(lexemeRow.id) as unknown as SenseRow[];

    const primarySense =
      occurrences.find((o) => o.sense && o.sense.contextualMeaningVi.trim().length > 0)?.sense ??
      (sensesRows.length > 0 ? mapSenseRow(sensesRows[0]) : null);

    const primaryMeaningVi =
      primarySense?.contextualMeaningVi ||
      primarySense?.generalMeaningsVi?.[0] ||
      'Chưa có giải thích ngữ cảnh';

    const bookIdSet = new Set<string>();
    const bookTitleSet = new Set<string>();
    for (const occ of occurrences) {
      bookIdSet.add(occ.highlight.bookId);
      bookTitleSet.add(occ.bookTitle);
    }

    const activeCards = occurrences
      .map((o) => o.studyCard)
      .filter((c): c is StudyCard => c !== null && c.enabled);

    let studyStatus: VocabularyStudyStatus = 'saved';
    if (activeCards.some((c) => c.isMastered)) {
      studyStatus = 'mastered';
    } else if (activeCards.length > 0) {
      studyStatus = 'studying';
    }

    const nextDueAt =
      activeCards.length > 0
        ? activeCards
            .map((c) => c.dueAt)
            .sort((a, b) => a.localeCompare(b))[0]
        : null;

    const lastEncounteredAt =
      occurrences[0]?.occurrence.createdAt ?? lexemeRow.created_at;

    return {
      lexeme: mapLexemeRow(lexemeRow),
      primaryMeaningVi,
      occurrenceCount: occurrences.length,
      senseCount: sensesRows.length,
      bookIds: [...bookIdSet],
      bookTitles: [...bookTitleSet],
      lastEncounteredAt,
      studyStatus,
      nextDueAt,
      occurrences,
    };
  }

  function listVocabulary(filter?: ListVocabularyFilter): Result<VocabularyListItem[]> {
    const lexemeRows = ctx.db
      .prepare('SELECT * FROM lexemes ORDER BY created_at DESC')
      .all() as unknown as LexemeRow[];

    let items = lexemeRows
      .map(buildVocabularyListItem)
      .filter((item) => item.occurrenceCount > 0 || item.senseCount > 0);

    if (filter?.bookId) {
      items = items.filter((item) => item.bookIds.includes(filter.bookId!));
    }

    if (filter?.pageNumber1Based !== undefined) {
      items = items.filter((item) =>
        item.occurrences.some((o) => o.highlight.pageNumber1Based === filter.pageNumber1Based)
      );
    }

    if (filter?.studyStatus && filter.studyStatus !== 'all') {
      items = items.filter((item) => item.studyStatus === filter.studyStatus);
    }

    if (filter?.search && filter.search.trim().length > 0) {
      const q = filter.search.trim().toLowerCase();
      items = items.filter((item) => {
        if (item.lexeme.canonicalForm.toLowerCase().includes(q)) return true;
        if (item.primaryMeaningVi.toLowerCase().includes(q)) return true;
        return item.occurrences.some(
          (occ) =>
            occ.highlight.sentenceText.toLowerCase().includes(q) ||
            occ.sense?.contextualMeaningVi.toLowerCase().includes(q) ||
            occ.sense?.generalMeaningsVi.some((m) => m.toLowerCase().includes(q))
        );
      });
    }

    const sortBy = filter?.sortBy ?? 'recent';
    if (sortBy === 'name') {
      items.sort((a, b) =>
        a.lexeme.canonicalForm.localeCompare(b.lexeme.canonicalForm, 'en', {
          sensitivity: 'base',
        })
      );
    } else if (sortBy === 'page') {
      items.sort((a, b) => {
        const minPageA = Math.min(
          ...a.occurrences.map((o) => o.highlight.pageNumber1Based),
          Number.MAX_SAFE_INTEGER
        );
        const minPageB = Math.min(
          ...b.occurrences.map((o) => o.highlight.pageNumber1Based),
          Number.MAX_SAFE_INTEGER
        );
        return minPageA - minPageB;
      });
    } else {
      items.sort((a, b) => b.lastEncounteredAt.localeCompare(a.lastEncounteredAt));
    }

    return ok(items);
  }

  function getVocabularyDetail(lexemeId: string): Result<VocabularyListItem> {
    const lexRow = ctx.db
      .prepare('SELECT * FROM lexemes WHERE id = ?')
      .get(lexemeId) as LexemeRow | undefined;

    if (!lexRow) {
      return err('NOT_FOUND', 'Không tìm thấy mục từ vựng này.');
    }

    return ok(buildVocabularyListItem(lexRow));
  }

  function editSense(input: EditSenseInput): Result<Sense> {
    const senseRow = ctx.db
      .prepare('SELECT * FROM senses WHERE id = ?')
      .get(input.senseId) as SenseRow | undefined;

    if (!senseRow) {
      return err('NOT_FOUND', 'Không tìm thấy nghĩa ngữ cảnh cần chỉnh sửa.');
    }

    const currentSense = mapSenseRow(senseRow);
    const nextFlags: UserEditedFlags = { ...currentSense.userEditedFlags };

    let nextGeneralMeanings = currentSense.generalMeaningsVi;
    if (input.generalMeaningsVi !== undefined) {
      nextGeneralMeanings = input.generalMeaningsVi.map((s) => s.trim()).filter(Boolean);
      nextFlags.generalMeaningsVi = true;
    }

    let nextContextualMeaning = currentSense.contextualMeaningVi;
    if (input.contextualMeaningVi !== undefined) {
      nextContextualMeaning = input.contextualMeaningVi.trim();
      nextFlags.contextualMeaningVi = true;
    }

    let nextContextualExplanation = currentSense.contextualExplanationVi;
    if (input.contextualExplanationVi !== undefined) {
      nextContextualExplanation = input.contextualExplanationVi.trim();
      nextFlags.contextualExplanationVi = true;
    }

    let nextExampleEn = currentSense.exampleEn;
    if (input.exampleEn !== undefined) {
      nextExampleEn = input.exampleEn ? input.exampleEn.trim() : null;
      nextFlags.exampleEn = true;
    }

    let nextExampleVi = currentSense.exampleVi;
    if (input.exampleVi !== undefined) {
      nextExampleVi = input.exampleVi ? input.exampleVi.trim() : null;
      nextFlags.exampleVi = true;
    }

    const nextIpa = input.ipa !== undefined ? input.ipa : currentSense.ipa;
    const nextCollocation =
      input.collocation !== undefined ? input.collocation : currentSense.collocation;
    const nowIso = new Date().toISOString();

    ctx.db.exec('BEGIN IMMEDIATE');
    try {
      ctx.db
        .prepare(
          `UPDATE senses
           SET general_meanings_vi_json = ?,
               contextual_meaning_vi = ?,
               contextual_explanation_vi = ?,
               ipa = ?,
               collocation = ?,
               example_en = ?,
               example_vi = ?,
               user_edited_flags_json = ?,
               updated_at = ?
           WHERE id = ?`
        )
        .run(
          JSON.stringify(nextGeneralMeanings),
          nextContextualMeaning,
          nextContextualExplanation,
          nextIpa,
          nextCollocation,
          nextExampleEn,
          nextExampleVi,
          JSON.stringify(nextFlags),
          nowIso,
          input.senseId
        );

      if (input.canonicalForm !== undefined || input.partOfSpeech !== undefined) {
        const lexRow = ctx.db
          .prepare('SELECT * FROM lexemes WHERE id = ?')
          .get(currentSense.lexemeId) as LexemeRow | undefined;

        if (lexRow) {
          const nextCanonical =
            input.canonicalForm !== undefined && input.canonicalForm.trim().length > 0
              ? cleanCanonicalForm(input.canonicalForm)
              : lexRow.canonical_form;
          const nextPos =
            input.partOfSpeech !== undefined ? input.partOfSpeech : lexRow.part_of_speech;
          ctx.db
            .prepare('UPDATE lexemes SET canonical_form = ?, part_of_speech = ? WHERE id = ?')
            .run(nextCanonical, nextPos, lexRow.id);
        }
      }

      ctx.db.exec('COMMIT');
    } catch (e) {
      ctx.db.exec('ROLLBACK');
      return err(
        'DB_ERROR',
        'Không thể cập nhật chỉnh sửa từ vựng.',
        false,
        e instanceof Error ? e.message : String(e)
      );
    }

    const updated = ctx.db
      .prepare('SELECT * FROM senses WHERE id = ?')
      .get(input.senseId) as unknown as SenseRow;
    return ok(mapSenseRow(updated));
  }

  function setStudyOptIn(input: SetStudyOptInInput): Result<StudyCard | null> {
    const senseRow = ctx.db
      .prepare('SELECT id FROM senses WHERE id = ?')
      .get(input.senseId) as { id: string } | undefined;
    if (!senseRow) {
      return err('NOT_FOUND', 'Không tìm thấy nghĩa từ vựng để đưa vào Ôn tập.');
    }

    const occRow = ctx.db
      .prepare('SELECT id FROM occurrences WHERE id = ?')
      .get(input.representativeOccurrenceId) as { id: string } | undefined;
    if (!occRow) {
      return err('NOT_FOUND', 'Không tìm thấy ngữ cảnh xuất hiện tương ứng.');
    }

    const existingCard = ctx.db
      .prepare('SELECT * FROM study_cards WHERE sense_id = ?')
      .get(input.senseId) as StudyCardRow | undefined;

    const nowIso = new Date().toISOString();

    if (existingCard) {
      ctx.db
        .prepare(
          `UPDATE study_cards
           SET enabled = ?, representative_occurrence_id = ?
           WHERE id = ?`
        )
        .run(input.enabled ? 1 : 0, input.representativeOccurrenceId, existingCard.id);

      const updated = ctx.db
        .prepare('SELECT * FROM study_cards WHERE id = ?')
        .get(existingCard.id) as unknown as StudyCardRow;
      return ok(mapStudyCardRow(updated));
    }

    if (!input.enabled) {
      return ok(null);
    }

    const cardId = crypto.randomUUID();
    const initialFsrsState: FsrsPersistedState = {
      due: nowIso,
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 0,
      lapses: 0,
      state: 0,
      last_review: null,
    };

    ctx.db
      .prepare(
        `INSERT INTO study_cards (
          id, sense_id, representative_occurrence_id, enabled, created_at, due_at, fsrs_state_json, is_mastered
        ) VALUES (?, ?, ?, 1, ?, ?, ?, 0)`
      )
      .run(
        cardId,
        input.senseId,
        input.representativeOccurrenceId,
        nowIso,
        nowIso,
        JSON.stringify(initialFsrsState)
      );

    const created = ctx.db
      .prepare('SELECT * FROM study_cards WHERE id = ?')
      .get(cardId) as unknown as StudyCardRow;
    return ok(mapStudyCardRow(created));
  }

  function deleteVocabulary(input: DeleteVocabularyInput): Result<{ deleted: boolean }> {
    ctx.db.exec('BEGIN IMMEDIATE');
    try {
      if (input.scope === 'occurrence_only') {
        if (!input.occurrenceId) {
          ctx.db.exec('ROLLBACK');
          return err('VALIDATION_ERROR', 'Thiếu mã lần xuất hiện (occurrenceId) cần xóa.');
        }

        const occRow = ctx.db
          .prepare('SELECT * FROM occurrences WHERE id = ?')
          .get(input.occurrenceId) as OccurrenceRow | undefined;

        if (!occRow) {
          ctx.db.exec('ROLLBACK');
          return err('NOT_FOUND', 'Không tìm thấy lần xuất hiện cần xóa.');
        }

        // Deleting the highlight cascades to this specific occurrence while preserving other occurrences and senses
        ctx.db.prepare('DELETE FROM highlights WHERE id = ?').run(occRow.highlight_id);
        ctx.db.exec('COMMIT');
        return ok({ deleted: true });
      }

      if (input.scope === 'study_card_only') {
        if (input.studyCardId) {
          ctx.db.prepare('DELETE FROM study_cards WHERE id = ?').run(input.studyCardId);
        } else if (input.occurrenceId) {
          ctx.db
            .prepare('DELETE FROM study_cards WHERE representative_occurrence_id = ?')
            .run(input.occurrenceId);
        } else {
          ctx.db.exec('ROLLBACK');
          return err('VALIDATION_ERROR', 'Thiếu mã thẻ ôn tập cần xóa.');
        }
        ctx.db.exec('COMMIT');
        return ok({ deleted: true });
      }

      if (input.scope === 'lexeme_all') {
        if (!input.lexemeId) {
          ctx.db.exec('ROLLBACK');
          return err('VALIDATION_ERROR', 'Thiếu mã từ vựng (lexemeId) cần xóa.');
        }

        const highlightIds = ctx.db
          .prepare('SELECT highlight_id FROM occurrences WHERE lexeme_id = ?')
          .all(input.lexemeId) as unknown as Array<{ highlight_id: string }>;

        for (const h of highlightIds) {
          ctx.db.prepare('DELETE FROM highlights WHERE id = ?').run(h.highlight_id);
        }

        ctx.db.prepare('DELETE FROM lexemes WHERE id = ?').run(input.lexemeId);
        ctx.db.exec('COMMIT');
        return ok({ deleted: true });
      }

      ctx.db.exec('ROLLBACK');
      return err('VALIDATION_ERROR', 'Phạm vi xóa từ vựng không hợp lệ.');
    } catch (e) {
      ctx.db.exec('ROLLBACK');
      return err(
        'DB_ERROR',
        'Không thể xóa mục từ vựng.',
        false,
        e instanceof Error ? e.message : String(e)
      );
    }
  }

  function getAppSettings(): Result<AppSettings> {
    return ok(readAppSettings(ctx));
  }

  function updateAppSettings(settings: Partial<AppSettings>): Result<AppSettings> {
    return ok(writeAppSettings(ctx, settings));
  }

  return {
    importPdf,
    listBooks,
    getBook,
    getBookPdfBytes,
    updateBook,
    removeBook,
    saveReadingPosition,
    createHighlight,
    listHighlights,
    removeHighlight,
    listVocabulary,
    getVocabularyDetail,
    editSense,
    setStudyOptIn,
    deleteVocabulary,
    getAppSettings,
    updateAppSettings,
    getOccurrenceWithContextById,
  };
}
