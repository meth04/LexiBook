# TASK 06 — Persistent context-aware highlight selection and return-to-source

**Lead:** pdf-reader  
**Dependencies:** 03,04,05  
**Status:** NOT STARTED (update `docs/STATUS_TRACKER.md` only after actual execution)

## Objective
Turn highlighted words and phrases into permanent, zoom-stable book occurrences and a live vocabulary sidebar.

## Implementation sequence
1. Implement selection confirmation (toolbar or one-click save; no API spending on every accidental mouse selection). Determine selected exact phrase, page, sentence, bounded paragraph and anchor preview.
2. Use PDF.js viewport transformations to compute normalized PDF quads (multiple line rects) and text anchor offsets/prefix/suffix; store anchor version, page and book hash.
3. Persist highlight+lexeme+occurrence through atomic Rust service, update sidebar immediately, show AI analysis loading only after confirmed save.
4. Rehydrate overlays across scroll/zoom/resize/rotation and after process restart; precise hit-testing selection and click highlight detail.
5. Implement sidebar list filter This Page / This Book, search, sort, selected detail; selecting row scrolls to anchor and focuses the overlay.
6. Handle duplicates idempotently; uncertainties trigger editable context preview and warnings, not fake context; protect UI if network fails.

## Acceptance criteria (must prove)
- [ ] Original page/phrase + sentence and PDF highlight persist before any Gemini request.
- [ ] Click saved item navigates to correct PDF text at zoom 50%, 125%, 200% and after restart.
- [ ] New occurrence is preserved per book/page/context; repeated exact selection does not create duplicate.

## Test plan — commands and evidence
- [ ] PDF fixture unit/integration anchor transformation tests, offset reconstruction and clipped multipage selection handling.
- [ ] E2E highlight save/reload/zoom/revisit; visually verify glyph alignment on several samples.
- [ ] Failure injection: DB write fails, AI timeout, page disposed while request pending.

## Failure / adversarial cases
- [ ] Cross-page selection and multi-column extraction uncertainty.
- [ ] Duplicate phrase appears five times on same page.
- [ ] Zoom 200%/rotation/multiline and escaped PDF text.

## File boundaries and handoff
PDF agent owns reader/highlight presentation and anchor helpers; data-platform owns service transaction; orchestrator resolves typed interface changes.

Use `docs/HANDOFF_TEMPLATE.md`. Provide exact paths, migration/DTO changes, actual test command + exit codes, assertions and reproducible manual checks. Never mark this task complete with only a mock screenshot. Follow root `AGENTS.md`, all applicable `.agents/rules/`, and product PRD. Do not create unsupported APIs; verify documentation and pin supported dependency versions.
