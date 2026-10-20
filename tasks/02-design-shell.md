# TASK 02 — Clean desktop UI, design system and app navigation

**Lead:** frontend-designer  
**Dependencies:** 01  
**Status:** NOT STARTED (update `docs/STATUS_TRACKER.md` only after actual execution)

## Objective
Create a highly usable Vietnamese-first application shell that preserves reading focus and has functional navigation, empty/loading/error states.

## Implementation sequence
1. Define tokens for colors/spacing/type/radii, default light warm neutral and sensible dark mode. Build reusable Button, Input, Modal/Drawer, Toast, EmptyState, Skeleton, Badge, Dialog and keyboard focus indicators.
2. Implement functional routes/screens: Library, Reader, Vocabulary, Study, Progress, Settings. Wire menu to router; save selected route using orchestrator-approved adapter.
3. Build reader 65–70% PDF region plus 30–35% resizable/collapsible vocabulary sidebar; show a real empty state before PDF is loaded, not hard-coded PDF paragraphs.
4. Create first-run onboarding notes about local books and minimum Gemini excerpt processing; allow skip API setup and immediate offline import.
5. Use well-designed consistent icons (avoid emoji decor), accessible contrast, control labels, Tab/Shift+Tab and Escape interactions.
6. Add responsive behavior for 1366×768 (minimum) through 2560×1440 and reasonable error/empty layouts.

## Acceptance criteria (must prove)
- [ ] Navigation works on keyboard and mouse without dead controls or dummy data disguised as production.
- [ ] Reader remains usable at 1366×768 with right panel collapse/resize and no cropped buttons.
- [ ] Unified theme, focus, empty/loading/errors on each major screen.

## Test plan — commands and evidence
- [ ] Component tests for navigation, dialog keyboard focus, sidebar toggle, empty and error states.
- [ ] Capture real screenshots at 1366×768 and 2560×1440 if browser/Desktop screenshot support exists.
- [ ] Run lint, typecheck and build; add accessibility automated checks where possible.

## Failure / adversarial cases
- [ ] High zoom or long Vietnamese text overflow.
- [ ] No API key, no books, zero vocabulary, offline UX.
- [ ] Invalid route/book ID and failed initial DB query.

## File boundaries and handoff
UI feature modules plus design tokens only; do not modify PDF anchor algorithm, SQLite migration, global DTO contract or Rust secret handling.

Use `docs/HANDOFF_TEMPLATE.md`. Provide exact paths, migration/DTO changes, actual test command + exit codes, assertions and reproducible manual checks. Never mark this task complete with only a mock screenshot. Follow root `AGENTS.md`, all applicable `.agents/rules/`, and product PRD. Do not create unsupported APIs; verify documentation and pin supported dependency versions.
