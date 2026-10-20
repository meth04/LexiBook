# TASK 14 — Integrated verification, adversarial regression and quality gates

**Lead:** qa-security + orchestrator  
**Dependencies:** 04–13 implemented  
**Status:** NOT STARTED (update `docs/STATUS_TRACKER.md` only after actual execution)

## Objective
Execute integrated deterministic verification of real application code against all 13 acceptance points; assign bug fixes with traceable evidence.

## Implementation sequence
1. Build seeded mock Gemini provider with stable responses, temp SQLite/user-data isolated per test and original selectable PDF fixtures.
2. Run test matrix `docs/TEST_MATRIX.md` across Library, PDF, highlights, AI, vocabulary, FSRS, quiz, notifications, backup, UI and offline.
3. Implement Playwright/webview-compatible UI E2E where reliable; clearly mark native-only tests requiring installed Tauri app. Do not simulate a fake highlight and call it an E2E.
4. Fuzz or adversarial-test malformed PDF, prompt injection, malicious backup entries, secret scanning in built bundle and Tauri command argument/path validation.
5. Run lint, typecheck, Rust fmt/clippy/tests, UI tests/build and E2E; record command, OS, exit code, exact failure reproduction. Fix P0/P1, rerun regression.
6. Map PRD acceptance 01–13 with PASS/FAIL/UNVERIFIED/BLOCKED in `docs/RELEASE_REPORT.md`; document time of build and commit.

## Acceptance criteria (must prove)
- [ ] No P0/P1 unresolved; real code passes automated suites or explicit report blocks release.
- [ ] Core PDF→study loop passes with verified persistence and failure cases.
- [ ] CI uses synthetic fixtures/no real key; Windows native checks separated.

## Test plan — commands and evidence
- [ ] Full regression commands from `docs/TEST_MATRIX.md` with exit codes and logs.
- [ ] Integration e2e with process restart/temp profile, not just component mocks.
- [ ] Security review runs separately and confirms secrets not in artifacts.

## Failure / adversarial cases
- [ ] CI green by skipping tests or replacing implementations with mocks.
- [ ] Desktop-only functionality cannot be reproduced in browser runner.
- [ ] Accidental inclusion of user books/keys or unsupported Windows build environment.

## File boundaries and handoff
QA reviews and writes E2E/fixture tests; orchestrator coordinates code fixes with feature owners. Avoid QA simultaneously editing feature files.

Use `docs/HANDOFF_TEMPLATE.md`. Provide exact paths, migration/DTO changes, actual test command + exit codes, assertions and reproducible manual checks. Never mark this task complete with only a mock screenshot. Follow root `AGENTS.md`, all applicable `.agents/rules/`, and product PRD. Do not create unsupported APIs; verify documentation and pin supported dependency versions.
