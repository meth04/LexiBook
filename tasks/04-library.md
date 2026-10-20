# TASK 04 — Import and manage a real local PDF library

**Lead:** data-platform + frontend-designer  
**Dependencies:** 02,03  
**Status:** NOT STARTED (update `docs/STATUS_TRACKER.md` only after actual execution)

## Objective
User imports real selectable PDF documents into managed local storage, sees useful book metadata, resumes and safely deletes books.

## Implementation sequence
1. Build native file picker and Rust-side PDF header/MIME/size/security validation; copy to app-managed location with sha256 fingerprint and safe filename handling.
2. Extract title/page count/optional cover thumbnail where feasible; allow user edit of title; placeholder cover only when thumbnail unavailable.
3. Display searchable library grid/list, sort recent, Reading/Finished state, last page and progress using persisted book entity.
4. Dedupe byte-identical files: offer open existing or import independent copy; explicit delete choices for managed file vs retained vocabulary (preview consequences).
5. Use page position and normalized scroll fraction. Store last-opened; Continue reading opens correctly without PDF path exposure to renderer.
6. Create valid sample documents from original test text; do not ship copyrighted books.

## Acceptance criteria (must prove)
- [ ] Import three PDFs, close/reopen, all remain with title, page count and resume.
- [ ] Duplicate PDF handling explicit; no hidden duplicates or orphaned managed file.
- [ ] Import/deletion/out-of-space errors are recoverable; removal never silently deletes unrelated user files.

## Test plan — commands and evidence
- [ ] Rust integration for copy/hash/dedupe/deletion and path validation.
- [ ] UI tests for empty library/import/search/edit/resume and delete confirmation.
- [ ] Windows smoke: import from Unicode path, new and duplicate PDF; relaunch.

## Failure / adversarial cases
- [ ] Invalid extension despite PDF header; corrupted/password protected PDF; enormous PDF.
- [ ] Unicode filenames, long paths, removable drive source unplugged.
- [ ] Deletion while book still open and shared lexeme used by other book.

## File boundaries and handoff
Data-platform owns file operations/repos; frontend designer owns library React screens; orchestrator owns shared IPC adapter and lockfile.

Use `docs/HANDOFF_TEMPLATE.md`. Provide exact paths, migration/DTO changes, actual test command + exit codes, assertions and reproducible manual checks. Never mark this task complete with only a mock screenshot. Follow root `AGENTS.md`, all applicable `.agents/rules/`, and product PRD. Do not create unsupported APIs; verify documentation and pin supported dependency versions.
