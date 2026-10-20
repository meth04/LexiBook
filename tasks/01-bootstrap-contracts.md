# TASK 01 — Tauri bootstrap, shared contracts and test infrastructure

**Lead:** orchestrator  
**Dependencies:** 00  
**Status:** NOT STARTED (update `docs/STATUS_TRACKER.md` only after actual execution)

## Objective
Create a real launchable Tauri2 desktop shell with React/TS strict and a repeatable test/build toolchain, without discarding existing dependencies.

## Implementation sequence
1. If repo contains scaffold, adapt it; otherwise initialize React+Vite+TypeScript and Tauri v2 per current docs; pin consistent Node/Rust dependencies and commit lockfiles.
2. Configure strict TS/lint/format, Tailwind, native Tauri command adapter, routing/navigation and a single typed `Result`/error contract.
3. Create Rust modules for commands, services and database, typed DTO code for Book, Highlight, Lexeme, Occurrence, Sense, StudyCard, ReviewEvent based on `docs/CONTRACTS.md`.
4. Choose supported test stack (Vitest + Testing Library, Rust tests, desktop E2E strategy with documented limitations). Add scripts `lint`, `typecheck`, `test`, `test:e2e`, `build`, `tauri` unless existing scripts conflict.
5. Implement dependency injection boundaries for Gemini mocked provider, native key store, clock/timer, notification transport and appData filesystem. Never use localStorage for secrets.
6. Add .gitignore for secrets, `src-tauri/target`, installer outputs and local DB. Record Windows build prerequisites and first launch instructions.

## Acceptance criteria (must prove)
- [ ] App opens as a Tauri desktop window (if available) and navigates nonbroken shell routes.
- [ ] TypeScript, unit runner, Rust tests and builds can run with exact documented scripts.
- [ ] All 7 domain concepts have one coherent typed contract and mock interfaces; no duplicated schema structures.

## Test plan — commands and evidence
- [ ] Run exact npm/pnpm scripts for lint/typecheck/test/build and Cargo fmt/clippy/test; capture exits.
- [ ] At minimum automated smoke render for UI shell, typed IPC success/error stub, Rust command dispatch test.
- [ ] On Windows run Tauri dev launch. If not possible, mark NATIVE LAUNCH UNVERIFIED, not PASS.

## Failure / adversarial cases
- [ ] Existing repository has a different bundler or lockfile; do not replace blindly.
- [ ] Native binary is not runnable in non-Windows environment.
- [ ] Tauri API/version drift or mismatched Rust dependencies.

## File boundaries and handoff
Orchestrator exclusively owns package manifests/lockfiles, shared contracts, CI scaffold and Tauri capabilities configuration. Specialists may not edit without explicit handoff.

Use `docs/HANDOFF_TEMPLATE.md`. Provide exact paths, migration/DTO changes, actual test command + exit codes, assertions and reproducible manual checks. Never mark this task complete with only a mock screenshot. Follow root `AGENTS.md`, all applicable `.agents/rules/`, and product PRD. Do not create unsupported APIs; verify documentation and pin supported dependency versions.
