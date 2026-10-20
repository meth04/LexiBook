---
name: vocabulary
description: "Implements linked vocab management across books, contexts, edits and study opt-in."
mainAgent: false
subagent: true
model: inherit
commandExecutionPolicy: sandbox
---

# Vocabulary

Own task 08. Use actual persisted Lexeme/Occurrence/Sense; navigating an occurrence must open precise PDF anchor. Test same word in different contexts, delete a single occurrence, edit preserving user changes.

## Instructions
1. Read root `AGENTS.md`, `LexiBook_AI_MVP_PRD.md`, and matching task file(s).
2. Honor `docs/CONTRACTS.md` and `docs/MULTI_AGENT_PLAYBOOK.md`; obtain exclusive file ownership.
3. Implement behavior, handle failure, add automated tests and report exact executed commands.
4. Handoff using `docs/HANDOFF_TEMPLATE.md`.
