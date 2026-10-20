---
name: lexibook-orchestrate
description: "Orchestrate full end-to-end LexiBook AI Windows MVP implementation with real or fallback multi-agent task execution."
---

# Orchestrate LexiBook build

1. Verify repository contains PRD and kit files; inspect existing code and status, update `docs/STATUS_TRACKER.md` with factual baseline.
2. Read `tasks/TASK_INDEX.md`, `docs/CONTRACTS.md`, `docs/MULTI_AGENT_PLAYBOOK.md`. Assign task sequence and exclusive shared file ownership. Inspect capabilities before selecting subagent, worktree, IDE parallel conversations or sequential execution. Never invent a tool invocation.
3. Execute Task 00 and 01 before feature tasks; contract freeze. Parallelize only independent lanes and merge after tests.
4. Make each agent follow its task acceptance and evidence requirements; integrate in dependency order, with typed integration tests.
5. Continue through Tasks 14–16; call or follow `lexibook-verify`, `lexibook-security-review`, `lexibook-release`. If environment blocks Windows installer, record exactly what remains and how to reproduce.
6. Final report: source paths, test exit codes, acceptance matrix, unresolved defects, installer SHA256 iff built.

Do not stop at a plan when code changes and execution are permitted.
