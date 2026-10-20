# Windows MVP release checklist — must prove, not assume

## Pre-release build
- [ ] PRD acceptance 1–13 mapped to evidence in `docs/RELEASE_REPORT.md`.
- [ ] Production installer created on Windows 10/11-supported Tauri toolchain; record OS, Node, Cargo/Rust, WebView2 and installer type.
- [ ] `npm run lint`, `npm run typecheck`, unit/integration, E2E, `npm run build`, cargo fmt/clippy/test: command, timestamp, pass count, exit code recorded.
- [ ] Test clean install, launch, uninstall; verify uninstallation policy preserves or explicitly offers to remove user data.
- [ ] Smoke import/open 3 small text-layer PDFs, highlight + jump, change zoom, close/open, quiz and FSRS due.
- [ ] API key stored natively; redaction scan on built JS/SQLite/logs/backups, no key exposure. Remove test credentials before capture.
- [ ] No keyless first launch blocker. Offline reading and existing reviews operational.
- [ ] Window width >=1366, height >=768; keyboard focus, sidebar toggling and dense-page performance verified.
- [ ] Quiet hours and reminder permissions verified; no false claims about fully exited app.
- [ ] Backup/restore destructive and malicious inputs tested in isolated profile.
- [ ] No copyrighted books or user secrets in installer, repo or reports.

## Release artifacts
- [ ] `docs/RELEASE_REPORT.md`: tested commit SHA, test summary, acceptance mapping, blocked items, exact known limitations.
- [ ] Installer filename, version, SHA256 and signed/not-signed status **only if installer exists**.
- [ ] `README.md` installation, app usage, where data is stored, secure key setup and privacy disclosure.
- [ ] `.gitignore`, lockfile, dependency notices, third-party licensing, API quota and data deletion behavior documented.
- [ ] No publish/tag/remote push without explicit user permission.

## Quality gate

Any unresolved P0 affecting data loss, broken highlight locations, leak of API key, duplicate review corruption, crashed reader, or failed backup rollback is a **NO-GO**. Block release and document reproduction rather than downgrade severity or hide the failure.
