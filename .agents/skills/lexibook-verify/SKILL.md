---
name: lexibook-verify
description: "Perform independent deterministic test matrix for LexiBook PDF, vocabulary, Gemini, FSRS and local persistence."
---

# Verify release behavior

1. Inspect `docs/TEST_MATRIX.md`, `docs/RELEASE_CHECKLIST.md`, package scripts, OS/toolchains, working tree.
2. Execute frontend TS lint/typecheck/tests/build; Rust fmt/clippy/tests; E2E with stub Gemini and temp database/fixtures. Never substitute browser screenshots for actual native checks.
3. Specifically cover PDF selection and anchors across zoom/restart; AI failure offline/timeouts; lexeme multi-context; FSRS idempotency; quiz no double review; backup rollback and notifications.
4. On Windows run packaged smoke and capture reproducible evidence; otherwise mark Windows-only checks UNVERIFIED.
5. Write/update `docs/RELEASE_REPORT.md` with every PRD requirement and all test cases. Fix concrete bugs where you have file ownership; otherwise issue to agent owner and rerun.

Every claimed pass needs actual test command, result and evidence location.
