# TASK 13 — Safe complete local export/import and rollback

**Lead:** data-platform  
**Dependencies:** 03,04,06,09  
**Status:** NOT STARTED (update `docs/STATUS_TRACKER.md` only after actual execution)

## Objective
Allow users to move/recover books, annotations, contextual vocabulary and FSRS reviews reliably, excluding credentials.

## Implementation sequence
1. Define versioned backup manifest with app/schema version, dataset hash, timestamp, relative internal paths and included managed PDFs. Document optional PDFs/no-PDF export behavior.
2. Build encrypted? Optional future; MVP can use standard archive only with a clear unencrypted warning. NEVER include Gemini API key, credential handles, session tokens, private logs or cache headers.
3. Export consistent SQLite snapshot, referenced managed PDFs and SHA256 manifest to user-selected path; atomic temp-to-final write.
4. Import only after preview/explicit confirmation: verify archive version, size limits, per-file hashes, no symlinks or `../`/absolute paths, stage in temp dir; validate SQLite FK, version/migration.
5. Perform restore as atomic swap or safe import transaction with rollback preserving current library on failure; cleaning stage is safe and scoped.
6. Write tests for full book/anchor/sense/study review roundtrip and hostile ZIP cases; document errors and storage path UI.

## Acceptance criteria (must prove)
- [ ] Backup and restore retains metadata, managed PDFs, highlights, senses, cards and review history.
- [ ] Invalid/truncated/malicious backup leaves original profile untouched; no arbitrary filesystem write.
- [ ] No API key or secret appears in exported archive/SQLite/snapshots.

## Test plan — commands and evidence
- [ ] Temp-profile integration export→restore→database and file hash comparison; reopen PDF and navigate highlights.
- [ ] Negative archive fixtures traversal/symlink/zip bomb/corrupted SQL/bad hash/duplicate names.
- [ ] Windows smoke restore after clean reinstall into isolated user profile.

## Failure / adversarial cases
- [ ] Backup created while DB write in progress and crash mid-export.
- [ ] Archive tampered after export, path normalization on Windows.
- [ ] Local library larger than available restore free space.

## File boundaries and handoff
Data-platform exclusively owns backup Rust path/archive; frontend designer can contribute Settings Data UI in disjoint files.

Use `docs/HANDOFF_TEMPLATE.md`. Provide exact paths, migration/DTO changes, actual test command + exit codes, assertions and reproducible manual checks. Never mark this task complete with only a mock screenshot. Follow root `AGENTS.md`, all applicable `.agents/rules/`, and product PRD. Do not create unsupported APIs; verify documentation and pin supported dependency versions.
