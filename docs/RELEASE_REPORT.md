# LexiBook AI release verification report

**Status:** VERIFIED IN SOURCE, SQLITE & LIVE GEMINI (`gemma-4-31b-it`, `gemini-3.5-flash-lite`) INTEGRATION / BLOCKED ON NATIVE MSVC LINKER (`link.exe` from Visual Studio C++ Build Tools).

## Build identity
- Commit: `5983aaf` (working tree with full MVP implementation across `src/`, `src-tauri/`, `tests/`, `scripts/`, `.github/workflows/windows-release.yml`)
- Host OS / test OS: Windows 11 (`Microsoft Windows NT 10.0.26200.0`, x64)
- Node / Rust / Tauri / WebView2:
  - Node.js: `v24.16.0` (with built-in `node:sqlite`)
  - npm: `12.1.0`
  - Python: `3.13.13`
  - WebView2 Runtime: `155.0.4283.62` (installed)
  - Rust: `rustc 1.99.1 (58cf8f9c3 2026-10-13)`, `cargo 1.99.1` (`stable-x86_64-pc-windows-msvc` installed; 513 crates locked and downloaded)
  - MSVC C++ Build Tools (`cl.exe` / `link.exe`): **NOT INSTALLED on host** (`error: linker 'link.exe' not found`)
- Source test commands and exit codes:
  - `python scripts/validate_kit.py` → Exit code `0` (`PASS`)
  - `node scripts/generate_pdf_fixtures.mjs` → Exit code `0` (6 PDF fixtures generated)
  - `cd src-tauri && cargo fmt --all -- --check` → Exit code `0` (`PASS`)
  - `npm run typecheck` (`tsc --noEmit`) → Exit code `0`
  - `npm run lint` (`eslint src tests`) → Exit code `0`
  - `npm run test` (`vitest run`) → Exit code `0` (**10 test files passed, 28 tests passed**)
  - `npm run build` (`tsc -b && vite build`) → Exit code `0` (`dist/` built cleanly)
  - `node scripts/secret_scan.mjs` → Exit code `0` (`SEC-01 PASS: Zero API keys or secrets found in dist/, src/, or src-tauri/`)
  - Live Google AI Studio E2E (`gemma-4-31b-it` & `gemini-3.5-flash-lite` via `createFetchGeminiTransport`) → Exit code `0` (`PASS`)
- Installer name and SHA256: **NONE BUILT ON HOST** (`BLOCKED` due to missing MSVC `link.exe` on host; `.github/workflows/windows-release.yml` provided for reproducible Windows MSI/NSIS builds).
- Last verification date: `2026-10-20T14:30:00+07:00`

## PRD acceptance mapping

| PRD criterion | Status | Evidence path/command | Blocker / note |
|---|---|---|---|
| 01 — Install and import 3 PDFs | PARTIAL (`PASS` for import/library/read of 3 PDFs; `BLOCKED` for native MSI/NSIS installer smoke) | `tests/integration/db-and-backup.test.ts` (`LIB-01`), `tests/integration/e2e-full-loop.test.ts` | Importing 3 distinct English PDFs (`habit_systems.pdf`, `deep_focus_two_col.pdf`, `pragmatic_arch.pdf`) verified against real SQLite; native `.msi`/`.exe` installer compilation requires `cargo` + MSVC. |
| 02 — Restore books/pages/highlights | PASS | `tests/integration/db-and-backup.test.ts` (`LIB-03`), `tests/integration/e2e-full-loop.test.ts` | Closing and reopening SQLite (`openLexiBookDatabase`) restores book list, `lastPage`, `lastScrollOffset`, and all saved highlights. |
| 03 — Sidebar highlight + validated AI | PASS | `tests/integration/pdf-and-highlights.test.ts` (`HIL-01`), `tests/integration/gemini-ai.test.ts` (`AI-01`), `tests/integration/e2e-full-loop.test.ts` | Selecting and confirming a word/phrase persists `Highlight` + `Lexeme` + `Occurrence` before AI, renders in sidebar immediately, and validates Gemini JSON via `GeminiResponseSchema`. |
| 04 — General/contextual explanation + edit | PASS | `tests/integration/gemini-ai.test.ts` (`AI-01`, `VOC-01`), `tests/integration/vocabulary.test.ts` (`VOC-01`) | Displays everyday Vietnamese meanings (`generalMeaningsVi`), passage-specific meaning (`contextualMeaningVi`), Vietnamese explanation, original sentence, and preserves user edits across AI refreshes (`userEditedFlags`). |
| 05 — Return to highlight after zoom/restart | PASS | `tests/integration/pdf-and-highlights.test.ts` (`PDF-02`, `PDF-03`), `tests/integration/e2e-full-loop.test.ts` | Normalized quads (`[0..1]`) + `TextAnchor` (`prefix`/`exact`/`suffix`/`startOffset`) resolve accurately across `50%`, `100%`, `125%`, `200%` zoom, rotations `0/90/180/270`, and repeated words on the same page. |
| 06 — Distinct meanings across books | PASS | `tests/integration/db-and-backup.test.ts` (`HIL-03`), `tests/integration/gemini-ai.test.ts` (`AI-01`), `tests/integration/vocabulary.test.ts` (`VOC-02`) | Polysemous word `"charge"` across 2 books shares 1 `Lexeme` while persisting 2 distinct `Occurrences` and 2 distinct contextual `Senses` without overwriting. |
| 07 — Context flashcards and quiz | PASS | `tests/integration/study-and-quiz.test.ts` (`STD-01`, `QUIZ-01`, `QUIZ-02`, `QUIZ-03`), `tests/integration/e2e-full-loop.test.ts` | Opt-in study cards render context-first flashcards (`maskedSentence`) and deterministic MCQ + inflection-aware Cloze quizzes; quiz attempts never double-count FSRS reviews (`ADR-002`). |
| 08 — FSRS survives restart | PASS | `tests/integration/study-and-quiz.test.ts` (`STD-02`, `STD-03`, `STD-04`) | `ts-fsrs` state transitions (`Again`, `Hard`, `Good`, `Easy`) and idempotent `review_events` (`clientReviewRequestId`) persist across database close/reopen. |
| 09 — Opt-in Windows due reminder | PARTIAL (`PASS` for SQLite scheduler, quiet hours, once-per-day, snooze/dismiss & UI disclosure; `UNVERIFIED` for native Windows toast/tray) | `tests/integration/reminders.test.ts` (`NTF-01`, `NTF-02`) | Overnight quiet hours (`22:00`–`07:00`), once-per-day cap, snooze, permission-denied fallback, and honest tray/exit disclosure verified; native Tauri tray/toast requires `cargo` build. |
| 10 — API key never exported/exposed | PASS | `tests/integration/gemini-ai.test.ts` (`SEC-01`), `tests/integration/e2e-full-loop.test.ts`, `node scripts/secret_scan.mjs` | API key is stored in encrypted credential vault outside SQLite, never echoed in IPC DTOs, redacted from error strings (`redactSecrets`), and verified absent from `lexibook.db`, `.zip` backups, and `dist/`. |
| 11 — Invalid input/API/quota/scanned PDF errors | PASS | `tests/integration/db-and-backup.test.ts` (`PDF-04`), `tests/integration/pdf-and-highlights.test.ts` (`PDF-04`), `tests/integration/gemini-ai.test.ts` (`AI-02`) | Corrupt PDF (`INVALID_PDF_HEADER`), encrypted PDF (`PDF_ENCRYPTED`), scan-only PDF (`scan-only-banner` OCR notice), missing key (`AI_KEY_MISSING`), 401/403, 429, 500, and invalid JSON handled with clear Vietnamese messages and zero data loss. |
| 12 — Complete backup/restore | PASS | `tests/integration/db-and-backup.test.ts` (`BAK-01`, `BAK-02`, `SEC-02`), `tests/integration/e2e-full-loop.test.ts` | Full `.zip` export and staging restore with SHA-256 verification and atomic rollback on path traversal (`../../evil.dll`), hash mismatch, or FK corruption. |
| 13 — Novice end-to-end flow | PASS (Application & SQLite E2E) | `tests/integration/e2e-full-loop.test.ts` | Full novice flow (Import PDF → Read → Highlight `"compound"` → AI Sense → Opt-in Study → Flashcard Grade → Vocabulary Jump to PDF → Progress → Backup & Restore) verified end-to-end. |

## Test matrix verification summary (`docs/TEST_MATRIX.md`)

| Test ID | Suite File | Status |
|---|---|---|
| `LIB-01`, `LIB-02`, `LIB-03` | `tests/integration/db-and-backup.test.ts`, `tests/integration/ui-library-progress.test.ts` | PASS |
| `PDF-01`, `PDF-02`, `PDF-03`, `PDF-04` | `tests/integration/pdf-and-highlights.test.ts`, `tests/integration/db-and-backup.test.ts` | PASS |
| `HIL-01`, `HIL-02`, `HIL-03` | `tests/integration/pdf-and-highlights.test.ts`, `tests/integration/db-and-backup.test.ts` | PASS |
| `AI-01`, `AI-02`, `AI-03`, `AI-04` | `tests/integration/gemini-ai.test.ts` | PASS |
| `VOC-01`, `VOC-02`, `VOC-03` | `tests/integration/vocabulary.test.ts`, `tests/integration/db-and-backup.test.ts` | PASS |
| `STD-01`, `STD-02`, `STD-03`, `STD-04` | `tests/integration/study-and-quiz.test.ts` | PASS |
| `QUIZ-01`, `QUIZ-02`, `QUIZ-03` | `tests/integration/study-and-quiz.test.ts` | PASS |
| `NTF-01`, `NTF-02` | `tests/integration/reminders.test.ts` | PASS |
| `BAK-01`, `BAK-02` | `tests/integration/db-and-backup.test.ts`, `tests/integration/e2e-full-loop.test.ts` | PASS |
| `SEC-01`, `SEC-02` | `tests/integration/gemini-ai.test.ts`, `tests/integration/db-and-backup.test.ts`, `scripts/secret_scan.mjs` | PASS |
| `UI-01`, `UI-02` | `tests/integration/ui-library-progress.test.ts`, `tests/integration/contracts.test.ts` | PASS |

## Automated tests

| Suite | Command | Platform | Result | Evidence |
|---|---|---|---|---|
| Kit static validation | `python scripts/validate_kit.py` | Windows 11 x64 | PASS (`0`) | 17 task files, rules, skills, and manifests verified |
| Frontend lint/types/build | `npm run typecheck && npm run lint && npm run build` | Windows 11 x64 (Node `v24.16.0`) | PASS (`0`) | Zero TS or ESLint errors; `dist/` bundle compiled (`342.43 kB` JS, `38.11 kB` CSS) |
| Reader/Gemini/FSRS/DB/UI integration | `npm run test` (`vitest run`) | Windows 11 x64 (`node:sqlite` + jsdom) | PASS (`0`) | 10 test files passed, 28 tests passed |
| Full E2E persistence loop | `npx vitest run tests/integration/e2e-full-loop.test.ts` | Windows 11 x64 (`node:sqlite` + jsdom) | PASS (`0`) | Import 3 PDFs → Highlight → AI → Study FSRS → Jump to PDF → Backup & Restore |
| Live Google AI Studio E2E | `createFetchGeminiTransport` (`gemma-4-31b-it`, `gemini-3.5-flash-lite`) | Windows 11 x64 | PASS (`0`) | Both models returned HTTP 200 and passed `GeminiResponseSchema` validation + SQLite persistence |
| Security/secret scan | `node scripts/secret_scan.mjs` | Windows 11 x64 | PASS (`0`) | Zero API keys (`AIza...` or `AQ....`) in `dist/`, `src/`, `src-tauri/`, SQLite DB, or backup ZIP |
| Rust fmt check | `cd src-tauri && cargo fmt --all -- --check` | Windows 11 x64 (`rustc 1.99.1`) | PASS (`0`) | All Rust files in `src-tauri/src/` formatted cleanly |
| Rust clippy/tests & Windows installer | `cargo clippy --all-targets -- -D warnings` / `npm run tauri build` | Windows 11 x64 (`rustc 1.99.1`) | BLOCKED (`101`) | 513 crates locked & downloaded; blocked at link step (`error: linker 'link.exe' not found`) due to missing Visual Studio C++ Build Tools |

## Known issues / Release Verdict

1. **Verdict**: **CONDITIONAL NO-GO FOR BINARY INSTALLER DISTRIBUTION (`BLOCKED` ON HOST MSVC LINKER `link.exe`)** — All application logic, SQLite migrations (`0001_initial.sql`), repositories, PDF text & coordinate anchor engines, Gemini BYOK validation/caching/redaction (including live verification with `gemma-4-31b-it` and `gemini-3.5-flash-lite`), `ts-fsrs` study scheduler, non-mutating quizzes, Windows reminder evaluation, staging backup/restore, and all 6 Vietnamese UI screens are implemented and verified with **28/28 automated tests passing** and `cargo fmt` passing.
2. **Exact Reproduction to Unblock Native Windows `.msi`/`.exe` Packaging**:
   - Rust (`rustc 1.99.1`, `cargo 1.99.1`) is now installed. Install Visual Studio 2022 C++ Build Tools (`winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"`) so `link.exe` is available, or run `.github/workflows/windows-release.yml` on `windows-latest`.
   - Then run `cd src-tauri && cargo test` followed by `npm run tauri build` to produce the `.msi` and `.exe` installers and record their SHA-256 hashes.
