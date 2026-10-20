# Multi-agent implementation playbook

## Reality check
- Antigravity rules: `.agents/rules/*.md` with valid frontmatter. Skills: `.agents/skills/<skill-name>/SKILL.md`. Custom agents: `.agents/agents/*.md` where supported.
- On Antigravity App/CLI, if `invoke_subagent` exists, call specialists using explicit role/task/owned paths and preferably isolated `branch` workspaces or independent Git worktrees. On IDE, do **not** assume same tool: separate conversations/worktrees if actually available, else sequential execution.
- Parallelism is an optimization. The proof is agent IDs/worktrees/diffs and tests, never narrative.

## Roles and ownership

| Role | Exclusive primary ownership | Main tasks |
|---|---|---|
| orchestrator | docs/contracts, package scripts, shared domain API, merges, CI/release | 00,01,14,15,16 |
| design-frontend | app shell, design tokens, navigation, Library/Progress UI | 02, portions 04,12 |
| data-platform | Rust SQLite migrations/repos, import/backup domain | 03, data portions 04,13 |
| pdf-reader | PDF.js page/text layer, anchors, highlight overlay | 05,06 |
| gemini-ai | secure key, provider, schema, analysis caching | 07 |
| vocabulary | list, search, occurrence/sense display and edit | 08 |
| study-engine | cards, FSRS, quiz | 09,10 |
| windows-integration | reminders, tray, opt-in autostart, Windows smoke | 11,15 |
| qa-security | independent tests, threat review, verification reports | 14,16 (review-only until fix ownership assigned) |

Agent names correspond to profile files; use as roles if the platform does not support custom agents. The orchestrator must own `src/shared/` typed contracts, `src-tauri/migrations/` migration ordering, lockfiles, and CI; require agreement before others modify them.

## Dependency graph

`00 discovery → 01 bootstrap/contracts → [02 design, 03 persistence, 05 PDF feasibility spike] → 04 library → 06 highlights → 07 Gemini → 08 vocabulary → 09 FSRS → 10 quiz → 11 notifications / 12 progress / 13 backup → 14 integration QA → 15 packaging → 16 release audit`.

Possible parallel lanes after 01: UI shell/design and DB migration design and PDF proof-of-concept; after stable contracts, provider logic in parallel with vocabulary UI; after study repository contract, scheduler tests and progress UI. Never attempt multi-agent merge into shared source until tests and contracts stabilize.

## Delivery protocol for each task

1. Orchestrator prepares task brief: paths owned, existing code to inspect, frozen interfaces, acceptance, adversarial tests, required integration test, base branch/commit.
2. Agent edits ONLY owned paths. If another shared file needs changes, send patch suggestion to orchestrator rather than commit simultaneous edits.
3. Agent runs relevant tests, commits feature branch only if authorized, completes `docs/HANDOFF_TEMPLATE.md` as a handoff message or branch-local copy.
4. Orchestrator reviews code diff, runs affected tests, integrates in dependency order (cherry-pick/merge with human-safe approvals); resolves shared conflicts centrally.
5. QA agent reviews integrated tree, not only agent branches; creates reproductions and files issues with severity and evidence.
6. At each milestone, orchestrator runs full required gates and records results. No false PASS or arbitrary deletion of failing tests.

## Conflict policy

- Both agents touching same file? Stop one writer; pick owner and integrate sequentially.
- Schema/interface mismatch? Freeze feature edits until orchestrator updates `docs/CONTRACTS.md` and a compatibility migration/test.
- New requirements outside PRD? Record a proposed ADR, defer as backlog unless required for core path.
- CLI/SDK/IDE lacks a stated tool? Document limitation and execute manually; don't hallucinate tool invocation.

## Quality and safety

- Use deterministic mocks for Gemini and local synthetic PDFs; no API key or copyrighted book fixtures.
- Avoid unconditional destructive commands (`git clean -fd`, reset, rm -rf, drop schema) and network publishing.
- UI screenshots and manual Windows test videos must be actual captures and their tested OS/build identified.
- Independent Windows smoke test must exercise an installed binary with persistent real files, not Vite dev server.

## Required final orchestrator report

Task table with owner, changes, actual commands and exit codes; app behavior demonstration evidence; remaining failed/unverified gates; Windows installer filename + SHA256 only if actually built; security summary; exact next steps for any environment-limited manual checks.
