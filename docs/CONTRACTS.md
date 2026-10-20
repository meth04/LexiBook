# LexiBook contracts v1 (normative until superseded by an ADR)

## Repository convention (adapt if nonempty repository already follows standards)

- `src/app/`: routes, shell and shared layout.
- `src/features/library|reader|vocabulary|study|progress|settings/`: React feature modules and frontend tests.
- `src/shared/types/`: generated or jointly maintained frontend DTOs. **Orchestrator owns shape changes.**
- `src-tauri/src/domain|db|commands|services|security/`: Rust implementation; `src-tauri/migrations/`: ordered SQLite migrations (single owner).
- `tests/e2e/`: deterministic UI E2E with desktop-real checks documented separately.
- `tests/fixtures/`: custom-created selectable PDFs, scanned mock, malformed/truncated samples.

## Canonical entities

- `Book {id, sha256, title, managedPath, pageCount, lastPage, lastScrollOffset, status, timestamps}`. Store managedPath as application-internal relative path where possible; never trust frontend absolute file paths.
- `Highlight {id, bookId, pageNumber1Based, selectedText, sentenceText, paragraphText, textAnchor, normalizedQuads, createdAt}`.
- `Lexeme {id, normalizedKey, canonicalForm, partOfSpeech?}`. normalization uses Unicode NFC, trim and case-fold for key, but original spelling preserved.
- `Occurrence {id, lexemeId, highlightId, senseId?}`. A single lexeme may link multiple highlights/senses.
- `Sense {id, lexemeId, generalMeaningsVi[], contextualMeaningVi, contextualExplanationVi, contextualTranslationVi?, ipa?, collocation?, exampleEn?, exampleVi?, sourceExcerpt, aiMetadata?, userEditedFlags}`.
- `StudyCard {id, senseId, representativeOccurrenceId, enabled, dueAt, fsrsState}`.
- `ReviewEvent {id, studyCardId, reviewedAt, mode, grade?, isCorrect?, clientReviewRequestId}`. Unique idempotency key and transactional review event/state update.
- `ReminderConfig {enabled, localTime, quietStart?, quietEnd?, autostartOptIn, lastNotifiedLocalDate?}`.

## Mandatory service operations

| Operation | Input | Return / behavior |
|---|---|---|
| `book.importPdf` | native file picker selection or scoped path | Validate MIME/header,size; copy into managed library; hash dedupe |
| `book.list/get/update/remove` | bookId, filters | deletion choice explicit; no orphan silent data loss |
| `reader.savePosition` | bookId, page, normalized position | persisted and restored after restart |
| `highlight.create` | bookId, page, selectedText, normalizedQuads, anchor, context | atomically persist highlight/lexeme/occurrence BEFORE AI; duplicates idempotent |
| `highlight.list/find/remove` | bookId/page/filter | navigate to PDF highlight; deletion policy explicit |
| `ai.analyzeOccurrence` | occurrenceId, selected text/context from stored selection | async/cache/schema validation; cancellation; typed errors |
| `vocabulary.list/detail/edit/setStudy` | lexical/sense IDs and filters | distinct contexts retained; regenerate does not overwrite edits |
| `study.queue/review` | book filter, due/new limits; cardId+grade+requestId | transactional FSRS update; duplicate request not double-counted |
| `quiz.generate/submit` | selected cards, question type | deterministic distractors/checks; no implicit extra FSRS event |
| `reminders.get/update` | local daily schedule | opt-in, quiet hours, tray and permission states |
| `data.export/import` | export destination, explicit restore action | validated versioned backup; never include API key |

Operation names are semantic contracts, not necessarily exact Tauri command names. Expose a typed command adapter; keep Rust CLI/internal paths and credentials unexposed to renderer. If adapting names, update one typed contract + contract tests together.

## Highlight anchor format

Store:
- `pageNumber` (1-based), `quads` as PDF-page normalized coordinates with documented origin, rotation handling and rectangles sufficient for multi-line text;
- `textAnchor`: exact selected string, prefix/suffix fragments, selection start/end offsets in a deterministic canonical PDF text-layer concatenation, anchor algorithm version;
- `pdfFingerprint` / book hash and page rotation, so anchors can't accidentally apply to a different PDF.

On reopen: locate canonical text using offsets/context, verify phrase; if mismatch try fuzzy bounded repair and mark `anchor_uncertain` rather than silently highlighting the wrong text. Rendering must map normalized PDF coords through current PDF.js viewport on zoom/resize/rotation, test independently.

## Gemini typed response

The provider returns only validated fields (no rich HTML) with `lemma_or_phrase`, `part_of_speech`, `ipa|null`, `general_meanings_vi[]`, `contextual_meaning_vi`, `contextual_explanation_vi`, `contextual_translation_vi?`, `usage_note?`, `example_en?`, `example_vi?`. Never trust returned source sentence; original stored sentence is authoritative. Validate with a schema in Rust/TS boundary; preserve nullable values; fail gracefully on invalid JSON.

Cache key = SHA256(`provider + model + promptVersion + schemaVersion + normalizedTerm + canonicalSentence + boundedContext`). TTL/version invalidation explicit. HTTP 401/403, 429, 5xx, timeout and offline need distinct surfaced errors and retries with backoff but max attempt cap. No silent API charges; do not call before confirmation.

## FSRS and Quiz semantics

- Use a maintained FSRS library compatible with domain language; no hand-coded scheduling recurrence. Set new/day=10, reviews/day=50 default; timezone-aware due-day boundary; store UTC instant and review history.
- Flashcard grade Again/Hard/Good/Easy -> **one** review transaction. Use `clientReviewRequestId` to enforce idempotency.
- Quiz answers contribute quiz accuracy. MVP: **quiz does not change FSRS** unless a separate explicit post-answer grading step is implemented and audited; do not silently mark FSRS Good based on an MCQ guess.
- Cloze must mask exactly the selected term/phrase in the stored sentence (bounded matching, punctuation/inflection-aware) or gracefully skip that question.

## Backup v1

Use versioned archive manifest with schema version, exported timestamp, app version, DB snapshot, relative managed PDF files, per-file SHA256. Import to a **staging directory**; block absolute paths, `../`, symlinks, oversized compressed data, duplicate file names; verify hashes + DB FK integrity; commit atomically only on success; fail without destroying existing library. Never export credentials or caches containing key-bearing headers.

## Exit criteria for contract changes

An ADR in `docs/DECISIONS.md`, synchronized backend/TS type, migration compatibility, unit tests and affected integration tests, before merging.
