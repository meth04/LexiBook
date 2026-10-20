# TASK 09 — FSRS scheduler, contextual flashcards and review session

**Lead:** study-engine  
**Dependencies:** 03,08  
**Status:** NOT STARTED (update `docs/STATUS_TRACKER.md` only after actual execution)

## Objective
Enable deliberate learning from sentences encountered in books using maintained FSRS scheduling with reliable state persistence.

## Implementation sequence
1. Pin a maintained FSRS package suitable for chosen runtime; read its current API and defaults, persist versioned FSRS state to DB, document upgrade/migration policy.
2. Create Study Queue with due-first ordering, book filter, new/day=10, max reviews/day=50, daily timezone-boundary semantics and opt-in card creation.
3. Implement active-recall flashcard: front cloze masks term in genuine original sentence (optionally meaning hint); back English phrase, general+context meaning, source/book.
4. Implement Again/Hard/Good/Easy grade with immutable ReviewEvent and atomic scheduler state transition; idempotency token blocks accidental double click.
5. Develop progress for current session, skip/stop/resume flows, empty due cards, offline card access, timer/accurate correct counts.
6. Write scheduler tests with injected clock in UTC, timezone +07, daylight-saving zones for portability, forward clock changes, overdue cards and repeat submissions.

## Acceptance criteria (must prove)
- [ ] Correct review due_at, state and event survive process restart and can be reviewed offline.
- [ ] Exactly one event per grade action even with repeated request ID or double click.
- [ ] Non-study Saved vocabulary never appears as forced homework; daily limits respected.

## Test plan — commands and evidence
- [ ] Unit tests of maintained FSRS adapter deterministic timestamp transition and grade selection.
- [ ] SQL transaction/idempotency tests and UI session restore.
- [ ] E2E Save→Add Study→Review→Exit/Restart→state persisted.

## Failure / adversarial cases
- [ ] Source text no longer available because book removed.
- [ ] Term appears multiple times or masking fails.
- [ ] Clock skew, leap dates and already-reviewed same-day cards.

## File boundaries and handoff
Study agent owns scheduler adapter, study UI and review domain service, but coordinates immutable event and migration with data-platform and orchestrator.

Use `docs/HANDOFF_TEMPLATE.md`. Provide exact paths, migration/DTO changes, actual test command + exit codes, assertions and reproducible manual checks. Never mark this task complete with only a mock screenshot. Follow root `AGENTS.md`, all applicable `.agents/rules/`, and product PRD. Do not create unsupported APIs; verify documentation and pin supported dependency versions.
