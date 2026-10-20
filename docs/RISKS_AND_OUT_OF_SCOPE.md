# Risk register and MVP non-goals

| Risk | Impact | Mitigation / exit proof |
|---|---|---|
| PDF text content has broken order | incorrect AI meaning | editable context preview; many PDF fixture layouts, transparent uncertainty |
| PDF highlight quads drift on zoom | wrong vocab anchor | normalized PDF space, anchor verification, screenshot/native regression tests |
| Gemini API model/price changes | errors/spend | supported model validation, cache, bounded retries, explicit user trigger, error mapping |
| BYOK API key exposed | privacy/billing | native key store, backend-only HTTP, artifact scan, secret redaction |
| FSRS scheduling counted twice | learning corruption | unique client request id, DB transaction, atomic state update tests |
| Shared project files edited concurrently | merge conflicts | exclusive ownership/worktrees, one integration owner |
| Windows reminders work only in tray | unmet user expectation | precise UX messaging + test once/day; no false promise post Quit |
| Backups include sensitive data or allow traversal | serious data/privacy | staged restore, hashes, path validation, credential exclusion |
| User has only Linux dev environment | Windows installer unverified | Windows CI/manual target, mark not tested until evidence |
| MVP grows into full Quizlet/cloud | delayed release | only contextual flashcards, MCQ and cloze for MVP |

**Explicit v1 exclusions:** EPUB, OCR/scan text recognition, mobile, cloud sync/login, community sets, marketplace, whole-book AI chatbot, AI image annotations, payment, collaboration. Do not mark omitted features as bugs.
