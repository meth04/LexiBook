# TASK 10 — Meaning-choice and source-sentence cloze quizzes

**Lead:** study-engine  
**Dependencies:** 09  
**Status:** NOT STARTED (update `docs/STATUS_TRACKER.md` only after actual execution)

## Objective
Provide reliable quizzes similar to Quizlet without lowering active recall quality or corrupting FSRS histories.

## Implementation sequence
1. Implement modes: 4-answer contextual meaning selection, and fill-the-missing-word/phrase from authentic book source sentence.
2. Generate unique, mutually distinguishable Vietnamese distractors using saved senses or deterministic fallback; reject ambiguous distractors, retry with another term rather than mark wrong answer unfairly.
3. Implement robust cloze masking for target spans (inflections, repeated occurrences, punctuation, case); if anchor ambiguous, skip question with transparent fallback.
4. Session sizes 5/10/20, book scope, keyboard input, answer feedback and original source context on results screen.
5. Persist QuizAttempt stats separately. Per ADR-002, quiz answer does not automatically call FSRS review unless a later explicit user-rating step is specified.
6. No Gemini cost for quiz generation by default; generate from saved local vocabulary with deterministic test mode.

## Acceptance criteria (must prove)
- [ ] Quiz starts with saved Study cards and ends with correct/incorrect count and explanation.
- [ ] Questions have exactly one correct answer and no duplicated distractor or accidentally revealed cloze term.
- [ ] Zero unrequested ReviewEvent created by quiz attempts; progress quiz accuracy uses real attempts.

## Test plan — commands and evidence
- [ ] Seeded tests for 4 unique options and ambiguous similar senses; fallback skip.
- [ ] Cloze masking test for repeated and inflected words, quotes, punctuation and multiword phrases.
- [ ] Integration tests: quiz results persisted, FSRS state identical pre/post quiz.

## Failure / adversarial cases
- [ ] Too few distinct options (under 4) for a vocabulary set.
- [ ] Answers with valid alternate translations.
- [ ] User submits twice, navigates away mid-session, offline state.

## File boundaries and handoff
Study agent owns quiz UI/service and QuizAttempt repository contract proposal; orchestrator owns shared schema changes and migrations.

Use `docs/HANDOFF_TEMPLATE.md`. Provide exact paths, migration/DTO changes, actual test command + exit codes, assertions and reproducible manual checks. Never mark this task complete with only a mock screenshot. Follow root `AGENTS.md`, all applicable `.agents/rules/`, and product PRD. Do not create unsupported APIs; verify documentation and pin supported dependency versions.
