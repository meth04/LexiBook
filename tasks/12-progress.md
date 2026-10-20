# TASK 12 — Honest reading and vocabulary progress dashboard

**Lead:** frontend-designer + study-engine  
**Dependencies:** 03,09; quiz data from 10 as available  
**Status:** NOT STARTED (update `docs/STATUS_TRACKER.md` only after actual execution)

## Objective
Display truthful progress with source-derived metrics and no fictional retention percentages or study pressure.

## Implementation sequence
1. Build selectors/query services for saved unique lexemes, total occurrences, studying cards, due cards, reviewed today, quiz accuracy, daily activity and book progress.
2. Define Mastered using explicit FSRS interval/threshold documented in UI; distinguish highlighted and actually learned.
3. Use local date-based seven-day study activity counts from ReviewEvent/QuizAttempt and actual book lastPage/pageCount progress.
4. Build clean Progress UI dashboard with weekly simple visualization, book breakdown, zero-data state and accessible descriptions.
5. Avoid scoring users for mere highlighting or treating 1 correct MCQ as mastered; read time only if reliably tracked.
6. Test updates from actual review and quiz events; ensure metrics survive restart and timezone changes.

## Acceptance criteria (must prove)
- [ ] Progress changes correctly after highlight, study opt-in, card review and quiz attempt.
- [ ] Counts are consistent with database, with no misleading retention claim.
- [ ] 7-day chart and no-data state render at supported screen sizes.

## Test plan — commands and evidence
- [ ] SQL aggregation unit/integration tests on seeded timezones and book scenarios.
- [ ] UI tests missing data, high counts, zero cards, filters and screen readers.
- [ ] End-to-end check counts after session and restart.

## Failure / adversarial cases
- [ ] History spans midnight, DST and locale changes.
- [ ] Card disabled/deleted; removed book still has retained study history.
- [ ] Flashcard self-rated Good should not inflate quiz accuracy.

## File boundaries and handoff
Frontend designer owns Progress React. Study engine owns aggregation logic; orchestrator approves shared DTO/query additions.

Use `docs/HANDOFF_TEMPLATE.md`. Provide exact paths, migration/DTO changes, actual test command + exit codes, assertions and reproducible manual checks. Never mark this task complete with only a mock screenshot. Follow root `AGENTS.md`, all applicable `.agents/rules/`, and product PRD. Do not create unsupported APIs; verify documentation and pin supported dependency versions.
