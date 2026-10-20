---
trigger: model_decision
description: "Activate for SQLite schema, migrations, repositories, backup and local persistence"
---

# Data integrity
- Preserve the Book/Highlight/Lexeme/Occurrence/Sense/StudyCard/ReviewEvent separation from `docs/CONTRACTS.md`.
- Use FK constraints, transactions, ordered migrations, uniqueness/idempotency, indexed access and explicit deletion modes.
- No destructive migration without backup/rollback; migration owner is orchestrator/data-platform by assignment.
- Atomic review update and immutable event recording; no silent loss of user-edited AI definitions.
- Test database reopen, crash resilience, malformed backup and partial import rollback.
