# TASK 05 — Production PDF.js reader with selectable text

**Lead:** pdf-reader  
**Dependencies:** 01 (can spike alongside 02/03)  
**Status:** NOT STARTED (update `docs/STATUS_TRACKER.md` only after actual execution)

## Objective
Integrate actual PDF.js rendering and text layer so users can select terms directly in real English PDFs with smooth navigation.

## Implementation sequence
1. Choose supported PDF.js version and worker setup for bundled offline Tauri WebView2, confirm text layer selection and usable page rendering.
2. Implement lazy page rendering, continuous and page view, pagination, zoom fit width/actual/percentage, PDF search, TOC if available and keyboard controls.
3. Persist last page and normalized within-page scroll through typed bridge; debounced updates, immediate flush on route exit/close where feasible.
4. Extract selected text and surrounding text from PDF.js text items; map cross-element selection to canonical text + page. Validate selection and allow sentence/context preview.
5. Handle scan-only: show readable PDF with disabled word selection plus clear OCR-not-in-MVP notice. Handle invalid/encrypted documents gracefully.
6. Performance bound large documents: virtualize pages, release bitmap resources and retain text layer for current/nearby pages.

## Acceptance criteria (must prove)
- [ ] PDF renders at 1366×768 and can search/select across multiple PDF text spans.
- [ ] Zoom+scroll+rotation do not corrupt text selection or crash reader.
- [ ] User returns to same logical reading position after closing/reopening app.

## Test plan — commands and evidence
- [ ] Fixture-based PDF.js selection tests across word, phrase, linebreak, ligature, repeated occurrences, two-column.
- [ ] Performance smoke on large synthetic PDF; measure page navigation and memory qualitatively/quantitatively where possible.
- [ ] Native Windows text selection/zoom manual test; document environment.

## Failure / adversarial cases
- [ ] PDF worker path fails inside packaged `tauri://` protocol.
- [ ] Invalid text layer after rotation, multi-column and tables.
- [ ] Password protected and image-only PDF.

## File boundaries and handoff
Own `src/features/reader` PDF rendering and internal anchor helpers only; request backend persistence through preagreed typed contract.

Use `docs/HANDOFF_TEMPLATE.md`. Provide exact paths, migration/DTO changes, actual test command + exit codes, assertions and reproducible manual checks. Never mark this task complete with only a mock screenshot. Follow root `AGENTS.md`, all applicable `.agents/rules/`, and product PRD. Do not create unsupported APIs; verify documentation and pin supported dependency versions.
