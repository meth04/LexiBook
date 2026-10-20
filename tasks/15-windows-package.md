# TASK 15 — Windows packaging, install/upgrade, documentation and smoke

**Lead:** windows-integration + orchestrator  
**Dependencies:** 14 quality gate  
**Status:** NOT STARTED (update `docs/STATUS_TRACKER.md` only after actual execution)

## Objective
Produce reproducible Windows MSI/NSIS installer and prove basic installed-app workflows, or transparently report Windows environment blocker.

## Implementation sequence
1. Configure Tauri app ID, version, icons (license-safe), window defaults, capabilities, native plugin permissions, code signing status and appData locations.
2. Create Windows GitHub Actions build/test workflow only after scripts run locally; use pinned toolchains and installer artifacts; no key in CI.
3. Build application and MSI/NSIS on Windows; record exact environment, generated file path, size, SHA256 and signed vs unsigned.
4. Test clean install, first run onboarding, native secure key store, import/reader/highlight/navigation, tray reminder behavior and uninstall on actual Windows 10/11.
5. Write `README.md` for prerequisite setup, development, production packaging, import PDFs, BYOK, backup/privacy, known limitations and troubleshooting.
6. Ensure build does not embed test SQLite profile/API key, proprietary fixtures or machine-specific paths. Ask permission before pushing/tagging/publishing.

## Acceptance criteria (must prove)
- [ ] Installer launches on clean Windows with actual PDF import and persisted highlight/study; or explicitly marked BLOCKED without fabricated artifact.
- [ ] Build/package script is reproducible and exact commit/installer SHA256 captured.
- [ ] Users can see the app data location and remove/backup their data.

## Test plan — commands and evidence
- [ ] Run `npm run tauri build` (or documented manager equivalent) on Windows; run clean-install smoke and capture logs.
- [ ] Run complete suites on Windows against packaged commit; compare with CI.
- [ ] Secret scan installed resources and exercise notification permissions.

## Failure / adversarial cases
- [ ] WebView2, MSVC, Windows certificate availability differences.
- [ ] OS notifications not firing in unregistered development mode.
- [ ] Installer type-specific file association and data persistence across update.

## File boundaries and handoff
Orchestrator owns manifests/CI/release tag; Windows specialist owns Windows native packaging and manual evidence, QA witnesses release gate.

Use `docs/HANDOFF_TEMPLATE.md`. Provide exact paths, migration/DTO changes, actual test command + exit codes, assertions and reproducible manual checks. Never mark this task complete with only a mock screenshot. Follow root `AGENTS.md`, all applicable `.agents/rules/`, and product PRD. Do not create unsupported APIs; verify documentation and pin supported dependency versions.
