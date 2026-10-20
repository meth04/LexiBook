---
trigger: always_on
description: "Truthful verification and build gates for all agents"
---

# Testing gate
- Every feature has positive, negative, persistence tests. Match IDs in `docs/TEST_MATRIX.md`.
- Show exact commands/exit codes and environments; browser-only mocks do not imply Windows-native verification.
- Do not mock the feature under test or swallow assertions; external Gemini may be mocked at HTTP boundary.
- Fix and rerun failing tests; do not hide failures by `skip` or weakening lint/typecheck.
- Final `docs/RELEASE_REPORT.md` must mark PASS, FAIL, BLOCKED or UNVERIFIED with evidence.
