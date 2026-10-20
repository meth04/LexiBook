# TASK 11 — Windows review reminders, tray and opt-in startup

**Lead:** windows-integration  
**Dependencies:** 09  
**Status:** NOT STARTED (update `docs/STATUS_TRACKER.md` only after actual execution)

## Objective
Notify users when vocabulary is due without unwanted nagging or false promises that alerts work after full application exit.

## Implementation sequence
1. Build Settings opt-in daily reminder local time, quiet hours, Snooze/Dismiss, app autostart opt-in, tray minimize vs Quit; persist reminder config.
2. Use supported Tauri notification, tray and autostart plugin APIs; check permission and register native notification actions if supported on selected Windows versions.
3. While app open or in tray, check due counts via backend on schedule; prevent repeated notifications via persistent lastNotifiedLocalDate and snooze state.
4. Click opens Study with due filter; if Windows action callback not supported on chosen implementation, documented fallback opens app and due screen safely.
5. Handle OS notification disabled, timezone changes, quiet hours crossing midnight, sleep/resume and no due cards. Show in-app badge offline.
6. Disclose that full Quit stops tray-based scheduling; do not claim notification post-exit unless separately implementing Windows Task Scheduler with explicit permission.

## Acceptance criteria (must prove)
- [ ] Notifications appear on real Windows with opt-in/permissions and only when due>0 and not quiet hours.
- [ ] Snooze, Dismiss and notification click have verified behavior; reminder off means no alerts.
- [ ] No promise of alert when fully quit; badge works without notification permission.

## Test plan — commands and evidence
- [ ] Inject clock/notification transport tests for quiet intervals, once/day, DST/local shift, denial and missed schedule.
- [ ] Windows real app test tray/minimize/quit, autostart consent, native toast click if supported.
- [ ] Offline due badge and permission-disabled tests.

## Failure / adversarial cases
- [ ] Unsupported Windows version, notification not registered for unpackaged dev mode.
- [ ] App sleeps, resumes after local time passed; crossing midnight.
- [ ] Uninstall/disable autostart leaves orphaned task.

## File boundaries and handoff
Windows specialist owns native notification/tray/autostart integration only; coordinate persistent config schema through orchestrator.

Use `docs/HANDOFF_TEMPLATE.md`. Provide exact paths, migration/DTO changes, actual test command + exit codes, assertions and reproducible manual checks. Never mark this task complete with only a mock screenshot. Follow root `AGENTS.md`, all applicable `.agents/rules/`, and product PRD. Do not create unsupported APIs; verify documentation and pin supported dependency versions.
