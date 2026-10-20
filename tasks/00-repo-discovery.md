# TASK 00 — Repository/environment inventory and implementation plan

**Lead:** orchestrator  
**Dependencies:** PRD + kit present  
**Status:** NOT STARTED (update `docs/STATUS_TRACKER.md` only after actual execution)

## Objective
Inspect the real cloned repository before choosing modifications. Preserve any existing code and detect Windows build limitations immediately.

## Implementation sequence
1. Confirm `LexiBook_AI_MVP_PRD.md` exists and enumerate current files/dirs/branch, `git status --short`, existing README, build scripts, lockfiles and CI; take notes without changing user files.
2. Determine host OS/architecture, available Node package manager, Rust/Cargo, WebView2, Visual Studio Build Tools and Tauri CLI. Record exact versions (or unavailable).
3. Read entire PRD and this kit; compare implementation to source without assuming an empty repo. Record an actionable delta and initial high-risk unknowns.
4. Create plan with G1–G5 milestones, explicit owners/file ownership, and an integration protocol; choose subagents only after detecting actual tool support.
5. Identify if existing `.agents/` or `AGENTS.md` conflicts; reconcile manually rather than overwrite. Ensure branch/worktree strategy does not destroy uncommitted changes.
6. Update tracker, environment inventory, decision log and first smoke command list.

## Acceptance criteria (must prove)
- [ ] Inventory includes branch, dirty state, OS, Node, Rust, Tauri and missing prerequisites.
- [ ] Milestones, task ownership and merge order are recorded and PRD differences documented.
- [ ] No existing source/PRD or Git history overwritten and no secrets printed.

## Test plan — commands and evidence
- [ ] Run `git status --short`, `git log -1 --oneline`; record actual output summaries and exit codes.
- [ ] Run `node --version`, package manager version, `rustc --version`, `cargo --version` if installed.
- [ ] Validate the contents of `.agents/rules/`, `.agents/skills/`, `.agents/agents/` survive extraction.

## Failure / adversarial cases
- [ ] Repo is not empty; code may already exist.
- [ ] Host is Linux/WSL and Windows packaging cannot be honestly claimed as tested.
- [ ] Uncommitted user edits prevent isolated worktree creation or agent Git operations.

## File boundaries and handoff
Own changes only to `docs/STATUS_TRACKER.md`, `docs/DECISIONS.md` and planning docs in this task. Do not scaffold project until Task 01.

Use `docs/HANDOFF_TEMPLATE.md`. Provide exact paths, migration/DTO changes, actual test command + exit codes, assertions and reproducible manual checks. Never mark this task complete with only a mock screenshot. Follow root `AGENTS.md`, all applicable `.agents/rules/`, and product PRD. Do not create unsupported APIs; verify documentation and pin supported dependency versions.
