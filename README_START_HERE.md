# LexiBook AI — Antigravity Implementation Kit

> Place the **contents** of this kit directly at the root of your existing LexiBook AI Git repository. Do **not** replace `LexiBook_AI_MVP_PRD.md`; it is the product source of truth. The kit contains instructions, not an already-built application.

## What this kit does

It supplies repository rules, custom agent profiles, callable Agent Skills, phase-specific implementation tasks, API/data contracts, testing gates, and a release plan. It is designed for Antigravity's 2026 `.agents/` layout. **Do not use legacy `.agents/workflows/`: workflows ceased being supported on October 19, 2026.**

## 5-minute setup (Windows PowerShell)

1. Make sure the cloned repository already contains `LexiBook_AI_MVP_PRD.md` at its root.
2. Extract the ZIP into a temporary directory. **Copy the folders/files inside** this kit into your repository root, preserving dot-prefixed `.agents` (enable hidden items in File Explorer). Merge folders; review conflicts with existing `AGENTS.md` or `.agents` files instead of blindly overwriting them.
3. Open the repository root in Antigravity, not the ZIP folder.
4. Create a baseline commit of the PRD + kit before implementation (only if the working tree does not contain unrelated changes). NEVER commit an API key.
5. Send the prompt in `START_PROMPT.md` to the main agent, or explicitly run the `/lexibook-orchestrate` skill.

**Windows verification:** run `Get-ChildItem -Force .agents` from the repository directory to check hidden files survived the extraction. Git should show `.agents/` files as untracked before the first commit.

## Agent usage modes

- **Antigravity App/CLI with `invoke_subagent`**: use `.agents/agents/*.md` as custom subagent profiles; parent may delegate parallel tasks using isolated Git worktrees if supported. All integration follows `docs/MULTI_AGENT_PLAYBOOK.md`.
- **Antigravity IDE**: `.agents/rules/` and `.agents/skills/` work; custom `invoke_subagent` behavior must **not** be assumed. Use parallel conversations/worktrees if the surface exposes them, or run the exact role-specific tasks sequentially. An agent saying it 'spawned agents' is not evidence: demand agent IDs or actual independent execution logs.
- **Fallback**: one orchestrator processes the same dependency-ordered tasks, still honoring tests, role boundaries and handoff notes.

## Suggested commands inside Antigravity chat

- `/lexibook-orchestrate` — inspect repository, establish contracts, implement tasks to completion.
- `/lexibook-verify` — run independent test matrix and collect evidence.
- `/lexibook-security-review` — inspect Gemini key, PDF, backup, IPC, privacy surfaces.
- `/lexibook-release` — complete Windows installer and manual smoke testing.

Or paste `START_PROMPT.md` in chat if skills are not indexed yet.

## Source-of-truth precedence

1. `LexiBook_AI_MVP_PRD.md` — user product scope / acceptance.
2. `AGENTS.md` — permanent repo-wide quality and safety constraints.
3. `docs/CONTRACTS.md` — shared typed domain/API contracts (agent may propose refinements; record an ADR).
4. `tasks/TASK_INDEX.md` and each task — execution order, concrete deliverables.
5. Current working source tree — adapt safely; do not erase existing user code.

When inconsistent, STOP only the dependent edit, record the conflict in `docs/DECISIONS.md`, choose the least invasive PRD-consistent option; do not invent product scope. Do not stall the entire project for unspecified visual details.

## Files overview

- `AGENTS.md`: permanent instructions loaded at workspace root.
- `.agents/rules/*.md`: auto-discovered contextual rules with valid trigger frontmatter.
- `.agents/agents/*.md`: specialist profiles where custom subagents are available.
- `.agents/skills/*/SKILL.md`: reusable commands for orchestration, QA, security and release.
- `tasks/00-*.md` through `tasks/16-*.md`: detailed delivery tasks.
- `docs/*`: architecture, test matrix, risks, role handoffs and live status.
- `START_PROMPT.md`: ready-to-paste master instruction.

## Important limitations

- There is no application code in this archive, and no Windows installer has yet been compiled or tested.
- Real Windows notifications, PDF text selection, Tauri secure storage and MSI/NSIS packaging must be verified on **Windows 10/11**, not assumed from browser mocks or Linux builds.
- No actual API key or licensed PDF is included. Tests must use synthetic/self-created fixtures and a stubbed Gemini response; real Gemini smoke tests are opt-in, quota-aware and never part of default CI.

## Verified upstream docs (Oct 20, 2026)

- https://antigravity.google/docs/rules/
- https://antigravity.google/docs/skills/
- https://antigravity.google/docs/subagents/
- https://antigravity.google/docs/migration/workflows-to-skills
- https://v2.tauri.app/
- https://mozilla.github.io/pdf.js/
- https://ai.google.dev/gemini-api/docs/structured-output
