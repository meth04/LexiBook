# TASK 08 — Unified vocabulary library with contextual occurrences

**Lead:** vocabulary  
**Dependencies:** 03,06; AI contract from 07  
**Status:** NOT STARTED (update `docs/STATUS_TRACKER.md` only after actual execution)

## Objective
Build a truthful vocabulary database UI linked to precise PDF highlight occurrences and distinct senses for the same word.

## Implementation sequence
1. Create book-scoped sidebar list and global vocabulary screen: filters by book/status, search canonical term and context, sort by last encountered/page/name.
2. Present general meanings, contextual meaning, source sentence, IPA optional, examples, book/page and all occurrences; show analysis statuses with Retry/Edit.
3. Implement edit meaning with locally persisted user override and separate AI metadata; refreshing Gemini must never overwrite user-edited fields automatically.
4. Implement add/remove Study per contextual sense (not automatically every occurrence); prevent duplicate cards for same sense and permit distinct sense cards.
5. Clarify deletion options: hide/remove single highlight occurrence vs lexeme and all occurrences vs delete Study card with review history, with confirmation and safe integrity.
6. Click occurrence navigates to book and exact page/anchor, including after reopening or when another book is open.

## Acceptance criteria (must prove)
- [ ] `charge` in two books shows one lexeme with distinct contextual senses and individual source jumps.
- [ ] Edit and delete semantics do not erase unrelated occurrences or review history silently.
- [ ] Study status updates in global list and sidebar; all controls operate on actual DB data.

## Test plan — commands and evidence
- [ ] Integration tests add/edit/delete/search across books and preserve senses/user edits after AI refresh.
- [ ] E2E navigate from Vocabulary to a precise highlight in PDF after restart.
- [ ] UI tests empty/filter/pagination/error and Study opt-in toggle.

## Failure / adversarial cases
- [ ] Same phrase with different capitalizations and irregular lemma.
- [ ] Deleting book shared vocabulary and deleted source book referenced by card.
- [ ] AI analysis failed/null IPA/no example; no hidden crash.

## File boundaries and handoff
Own vocabulary UI and repository methods allocated by orchestrator, no direct SQLite mutation from React and no repeated Schema generation.

Use `docs/HANDOFF_TEMPLATE.md`. Provide exact paths, migration/DTO changes, actual test command + exit codes, assertions and reproducible manual checks. Never mark this task complete with only a mock screenshot. Follow root `AGENTS.md`, all applicable `.agents/rules/`, and product PRD. Do not create unsupported APIs; verify documentation and pin supported dependency versions.
