---
name: lexibook-release
description: "Complete LexiBook Windows packaging, installation smoke, release documentation and no-go quality gates."
---

# Release Windows MVP

1. Review acceptance 1–13, `docs/RELEASE_CHECKLIST.md`, `docs/RELEASE_REPORT.md`; refuse release on high-severity data/security defects.
2. On Windows, install prerequisites if approved, produce Tauri MSI/NSIS using reproducible pinned dependency versions, run clean install/launch/uninstall and persistent state smoke.
3. Test system tray reminders/permission/quiet hours, mock vs live Gemini boundaries, API key secrecy in bundle, restore/import and zoom anchor.
4. Compute actual installer SHA256 and document unsigned/signed state and provenance. If not on Windows, do **not** claim installer exists: supply exact Windows CI/build instructions and mark BLOCKED or UNVERIFIED.
5. Document installation, privacy, key setup, export location, offline behavior and known limitations. Never push/tag/publish without explicit user permission.
