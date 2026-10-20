# TASK 16 — Independent acceptance, release/no-go decision and handoff

**Lead:** qa-security + orchestrator  
**Dependencies:** 15  
**Status:** NOT STARTED (update `docs/STATUS_TRACKER.md` only after actual execution)

## Objective
Perform independent sign-off against product PRD, security constraints and actual Windows installed-app observations.

## Implementation sequence
1. Re-read PRD acceptance 1–13, docs test matrix/release checklist and status tracker; inspect the integrated commit and all change diffs.
2. Collect real evidence for each criterion: GUI behavior, command/test logs, installer path/hashes, native notification test and correct PDF highlight after reopen.
3. Conduct independent security audit and adversarial regression; inspect key handling, backup path security, AI provider output validation and offline privacy.
4. Run a novice-user 10-minute task flow: import PDF, highlight phrase, understand general/context meanings, add Study, flashcard + quiz, close/reopen and navigate back.
5. Mark each PRD acceptance PASS/FAIL/UNVERIFIED/BLOCKED. Any core P0/P1 or missing Windows native test blocks unconditional “ship ready”.
6. Write `docs/RELEASE_REPORT.md` with actual commit, OS/toolchains, suite results, known issues and install/use instructions; do not auto-push or tag.

## Acceptance criteria (must prove)
- [ ] Every PRD acceptance criterion has evidence or clearly stated unknown.
- [ ] No assertion of full completion unless end-to-end Windows packaged loop really passed.
- [ ] Final repo includes source, tests, README, status log, release report and correct versioned build artifacts if produced.

## Test plan — commands and evidence
- [ ] Rerun all applicable commands independently from verified base commit.
- [ ] Confirm no credentials/copyright material in Git diff or artifacts.
- [ ] Manual installed Windows flow plus review of uncertainty/limits.

## Failure / adversarial cases
- [ ] UI pass but SQLite data lost on restart.
- [ ] Unverified native reminders, installer or secure key storage.
- [ ] One failing migration, backup restore or card idempotency scenario.

## File boundaries and handoff
QA independent review first; orchestrator signs final checklist and resolves blockers. Never rewrite audit evidence solely to announce success.

Use `docs/HANDOFF_TEMPLATE.md`. Provide exact paths, migration/DTO changes, actual test command + exit codes, assertions and reproducible manual checks. Never mark this task complete with only a mock screenshot. Follow root `AGENTS.md`, all applicable `.agents/rules/`, and product PRD. Do not create unsupported APIs; verify documentation and pin supported dependency versions.
