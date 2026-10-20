# LexiBook AI task board (dependency-ordered)

Read PRD and `AGENTS.md` first. A task is complete only when implementation **and** its tests are verified. This board maps roles but does not guarantee the current Antigravity surface supports subagent execution.

| Task | Owner | Depends on | Parallel lane after gate | Checkpoint |
|---|---|---|---|---|
| [00](00-repo-discovery.md) | Orchestrator | PRD | none | factual baseline |
| [01](01-bootstrap-contracts.md) | Orchestrator | 00 | none | Tauri skeleton, typed interfaces, test scripts |
| [02](02-design-shell.md) | Frontend designer | 01 | with 03 & 05 | 6 navigable real-screen skeletons |
| [03](03-db-domain.md) | Data platform | 01 | with 02 & 05 | migration + repo tests |
| [04](04-library.md) | UI + Data | 02,03 | task split by paths | import/search/resume |
| [05](05-pdf-reader.md) | PDF reader | 01 | with 02 & 03 | text-layer rendering |
| [06](06-highlights.md) | PDF reader | 03,04,05 | none | highlight reopens at correct location |
| [07](07-gemini.md) | Gemini AI | 01,03,06 contracts | with 08 UI after interfaces | BYOK, schema+cache+errors |
| [08](08-vocabulary.md) | Vocabulary | 03,06,07 contracts | with 07 after contracts | editable contexts, study opt-in |
| [09](09-flashcards-fsrs.md) | Study engine | 03,08 | none | review transaction + UI |
| [10](10-quiz.md) | Study engine | 09 | with 11 & 12 | meaningful quiz |
| [11](11-windows-reminders.md) | Windows integration | 09 | with 10 & 12 | opt-in native reminders |
| [12](12-progress.md) | Frontend + Study | 03,09 | with 10,11 | honest metrics |
| [13](13-backup-restore.md) | Data platform | 03,04,06,09 | with 11,12 | secure migration-safe restore |
| [14](14-e2e-qa.md) | QA + Orchestrator | 04–13 | independent verification | test matrix green or explicit gap |
| [15](15-windows-package.md) | Windows integration + Orchestrator | 14 | none | installer and docs |
| [16](16-final-audit.md) | QA/Orchestrator | 15 | none | evidence-based acceptance 1–13 |

## Sprint-style release gates

- **Gate G1**: bootstrap, types, DB migration and text-selection proof-of-concept compile (01–05 relevant parts).
- **Gate G2**: real persistence of PDF→highlight→context and accurate return-to-location, with mocked Gemini (06–08).
- **Gate G3**: flashcard, FSRS, quiz and offline review survive restart (09–10).
- **Gate G4**: opt-in Windows reminder, truthful stats and reversible data backup (11–13).
- **Gate G5**: integrated tests, security audit, Windows installer and human acceptance (14–16).

Complete gates sequentially; deliver usable vertical slices. Do not mark a feature done based on mock UI alone. At each gate, update `docs/STATUS_TRACKER.md` and carry unmet tests forward as blockers.
