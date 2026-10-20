# Engineering decisions / ADR log

- **ADR-000 (accepted)**: The PRD is canonical; deliver Windows-first, local-first PDF→context→vocabulary→review loop. This kit only organizes implementation and does not authorize changing scope.
- **ADR-001 (accepted)**: Shared commands/domain shapes are owned by orchestration and maintained in `docs/CONTRACTS.md`; individual specialists propose contract changes via ADR before changing shared interfaces.
- **ADR-002 (accepted)**: Quiz answers do not silently produce FSRS review events in MVP. Flashcard self-ratings generate exactly one event each with idempotency tokens.
- **ADR-003 (accepted)**: Gemini calls happen in Rust/native backend, only after explicit selection confirmation; secrets live in OS-secured credential storage.

## ADR-004 — Dual-Execution Backend Bridge (Tauri Rust + Node v24 Native SQLite) for Host Without Rust/MSVC
Status: Accepted
Date: 2026-10-20
Owner: orchestrator
Context: Host inspection (`Task 00`) confirmed Windows 11 (`10.0.26200.0`), Node.js `v24.16.0`, npm `12.1.0`, Python `3.13.13`, and WebView2 `155.0.4283.62` are installed, whereas `rustc`, `cargo`, and Visual Studio C++ Build Tools (`cl.exe`/`link.exe`) are not installed on this machine.
Options considered:
1. Write only `src-tauri/` Rust code and leave all database, domain, backup, and E2E tests unexecuted.
2. Implement complete `src-tauri/` Rust modules AND a Node v24 `node:sqlite` (`DatabaseSync`) backend service executing the exact same `src-tauri/migrations/0001_initial.sql` schema, filesystem operations, staged ZIP backup/restore, Windows DPAPI/Credential Manager secret wrapper, and maintained `ts-fsrs` scheduler so all domain/integration/E2E tests execute against real SQLite and real files on disk, while keeping `cargo` and `tauri build` honestly marked `BLOCKED`/`UNVERIFIED` until Rust + MSVC are installed.
Decision: Option 2. Both `src-tauri/` (Rust) and `src/backend/` (Node v24 native SQLite + Vite middleware bridge) share the single authoritative `src-tauri/migrations/0001_initial.sql` migration file and the typed contract in `src/shared/types/contracts.ts`.
Risk / rollback: Ensure zero divergence between `src-tauri/migrations/0001_initial.sql` and repository semantics; never claim `cargo test` or `npm run tauri build` ran when `cargo` is absent.
Contracts and tests affected: `docs/CONTRACTS.md`, `src/shared/types/contracts.ts`, `src-tauri/migrations/0001_initial.sql`, `src/backend/`, `src-tauri/src/`.

## ADR-005 — Canonical Tauri IPC & Service Contract Naming
Status: Accepted
Date: 2026-10-20
Owner: orchestrator
Context: `docs/CONTRACTS.md` specifies semantic operations (`book.importPdf`, `highlight.create`, etc.) and requires one unified typed contract adapter across frontend and backend, plus `QuizAttempt` persistence for Task 10/12.
Options considered:
1. Ad-hoc per-screen IPC calls.
2. Single `LexiBookApi` interface in `src/shared/types/contracts.ts` mapped 1:1 to Tauri command names and Node SQLite backend handlers, including `quiz_attempts` table in `0001_initial.sql`.
Decision: Option 2. Freeze `src/shared/types/contracts.ts` and `src-tauri/migrations/0001_initial.sql` in Task 01 before specialist feature lanes execute.
Risk / rollback: Any subsequent schema addition requires a new numbered migration and orchestrator approval.
Contracts and tests affected: All Tasks 01–16.

Use this template for changes:

```
## ADR-XXX — <short title>
Status: Proposed / Accepted / Rejected
Date: YYYY-MM-DD
Owner:
Context:
Options considered:
Decision:
Risk / rollback:
Contracts and tests affected:
```
