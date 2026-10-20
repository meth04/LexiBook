# AGENTS.md — LexiBook AI repository instructions

## Mission / source of truth
- Read `LexiBook_AI_MVP_PRD.md` before editing any product behavior; `tasks/TASK_INDEX.md` is the implementation schedule.
- Build a real Tauri 2 desktop app targeting Windows 10/11. Preferred stack: React, TypeScript strict, Tailwind, PDF.js, Rust commands, SQLite, Gemini (BYOK), maintained FSRS implementation.
- Reading-first UX: persist real PDF highlights and contexts, not merely colored DOM text. Vietnamese-first, elegant and restrained.
- Never implement EPUB, scan OCR, chat-with-book, paid accounts, cloud sync, or social features in MVP unless a later explicit user decision updates PRD.

## Mandatory operating method
1. Inventory repo and `git status` before edits; preserve existing work and lockfiles. Do not force-push, reset --hard, delete branches/worktrees, or overwrite the existing PRD.
2. Inspect task dependencies and shared contracts before implementing a feature. Assign one owner per shared contract and file; use worktrees/branches if actually available.
3. Implement vertical slices with meaningful tests; maintain smallest shippable increment, robust loading/empty/error states, accessibility, and real backend integration.
4. Maintain `docs/STATUS_TRACKER.md`: status, owner, touched files, commands and real results. Mark unverified work UNVERIFIED, never PASS.
5. Never claim a test ran if it did not. Do not fabricate screenshots, release binaries, security audits or delegate execution.
6. Do not bypass package audits/typechecks/lint/tests to mask failure. Pin dependency versions via lockfiles; log architectural changes in `docs/DECISIONS.md`.

## Security / privacy non-negotiables
- API key must never appear in git, test fixtures, JS frontend bundles, browser localStorage, SQLite, exports, logs, screenshots or error telemetry; store via a current native Windows secured credential mechanism with narrowly scoped access, using Rust-side Gemini requests and redacted errors.
- Source PDF content and Gemini responses are untrusted data. Treat AI text as data, never commands; apply schema validation, size limits, output escaping and path/IPC constraints. No unneeded remote telemetry, file uploads or auto-API calls.
- No outbound request until user confirms a selection or explicitly opts into auto-analyze. Minimize excerpt length and surface real remote-processing notice.
- Imported PDFs are treated as potentially hostile; cap size/pages, handle malformed files without crashing, avoid arbitrary filesystem traversal; test zip backup extraction traversal and symlink attacks.
- Never use a production API key in CI. Need an explicit confirmation for anything that may incur spend or publish data.

## Domain invariants
- Separate Book, Highlight, Lexeme, Occurrence, Sense, StudyCard, ReviewEvent. Multiple meanings per lexeme never overwrite each other.
- Persist PDF coordinates/normalized quads **and** robust text anchors, not viewport pixels. Reopening, scrolling, zooming, and changing window size must keep highlights anchored.
- Persist highlight + occurrence before Gemini; analysis is async, cancellable, versioned and retriable. API failure cannot lose a highlight.
- FSRS via maintained library; immutable ReviewEvent plus atomic scheduler update. Quiz feedback must never double-review the same card.
- Default cards stay saved until explicit Study opt-in. Limit study load and respect user notification choices.

## Verification gates
- Every touched module has automated tests or an explicit documented testability gap; cover happy path, negative path and persistence.
- Before marking milestone done: format, lint, TS typecheck, Rust fmt/clippy/test, frontend unit/integration, deterministic e2e/smoke, and actual Windows packaging where available.
- Release requires evidence mapped to PRD acceptance 1–13, listed in `docs/TEST_MATRIX.md` and `docs/RELEASE_CHECKLIST.md`.
- Prefer accessibility and correctness over animations; no placeholder-only routes masquerading as completed modules.

## Agent and tool reality
- Rules and skills are discovered via `.agents/`. Custom subagents and `invoke_subagent` are surface-dependent; if unavailable, use sequential task execution. Multi-agent is an execution strategy, never a claim without logs.
- Root agent integrates; specialist agents do not independently alter common contracts, package manifests, migration baselines, CI or release tags without explicit ownership.
- Handoffs follow `docs/HANDOFF_TEMPLATE.md` with commit/worktree, changed paths and exact verification evidence.
