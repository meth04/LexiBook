---
trigger: always_on
description: "Safe multi-agent Git handoffs and bounded file ownership"
---

# Safe collaboration
- Parent/orchestrator owns contract interfaces, package managers/lockfiles, CI/release, migration order and merge.
- No concurrent writes to same file, no unreviewed overwrite of user source, PRD or workspace rules.
- Prefer isolated worktrees or independent branches for supported subagents; otherwise sequential tasks.
- No reset --hard, force-push, git clean -fd, recursive deletion or remote push without user permission.
- Each handoff includes exact touched paths, commit id, tested commands and honest missing evidence.
