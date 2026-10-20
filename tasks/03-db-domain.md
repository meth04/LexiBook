# TASK 03 — SQLite domain schema and repositories

**Lead:** data-platform  
**Dependencies:** 01  
**Status:** NOT STARTED (update `docs/STATUS_TRACKER.md` only after actual execution)

## Objective
Create durable, migration-safe local persistence with correct lexeme→occurrence→sense model and atomic review states.

## Implementation sequence
1. Select a supported Rust SQLite layer/library; document native appData placement and migration strategy. Enable foreign keys, transactional writes and targeted indexes.
2. Implement schema Book, Highlight, Lexeme, Occurrence, Sense, StudyCard, ReviewEvent, ReminderConfig, AppSetting, analysis cache and derived relations.
3. Ensure uniqueness: book sha256, semantic term normalized key, passage duplicate anchors; multi-book contexts produce multiple occurrences even if lemma matches.
4. Create repositories, DTO adapters, migration versioning, database init and safe lock handling. Return typed errors rather than panicking.
5. Implement transactional highlight+lexeme+occurrence insert; AI analysis later attaches a Sense. Review updates must be idempotent transactions.
6. Implement fixture generation/reset for tests in temp directories and reject path escapes/untrusted file identifiers.

## Acceptance criteria (must prove)
- [ ] Fresh database opens and schema migrates on next launch with FK consistency.
- [ ] Highlight persists before AI; same passage dedupe; same term in different contexts not collapsed into one meaning.
- [ ] Immutable review event stored atomically with FSRS state update; no key in schema.

## Test plan — commands and evidence
- [ ] Rust repository tests: migration/upgrades/reopen, FK enforcement, transaction rollback, duplicate insert concurrency and same lexeme multiple occurrences.
- [ ] Integration test: import, create highlight, kill/restart data repository, retrieve unchanged.
- [ ] Cross-check schema against `docs/CONTRACTS.md` and record any ADR.

## Failure / adversarial cases
- [ ] Concurrent writers and SQLite busy timeout.
- [ ] Corrupt SQLite DB and storage full.
- [ ] Deleting book or occurrence without orphaning other records.

## File boundaries and handoff
Rust domain/db modules exclusively; migration changes need orchestrator review. Share interface draft with Reader/Gemini/Study before feature branches start.

Use `docs/HANDOFF_TEMPLATE.md`. Provide exact paths, migration/DTO changes, actual test command + exit codes, assertions and reproducible manual checks. Never mark this task complete with only a mock screenshot. Follow root `AGENTS.md`, all applicable `.agents/rules/`, and product PRD. Do not create unsupported APIs; verify documentation and pin supported dependency versions.
