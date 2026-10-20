---
trigger: always_on
description: "Protect user data, PDF inputs, Gemini API keys, backups, and agent test practices"
---

# Security and privacy
- No API keys in UI bundle, sqlite, logs, telemetry, exports, fixtures or tracked files. Use secured native credential store; never echo supplied key.
- PDF text and AI output are untrusted; schema, length, escaping and IPC/path validation required.
- Gemini request only on user-confirmed highlight and with minimum excerpt; rate-limit and bound retries.
- No commercial PDF fixtures, no real network calls in default CI, no destructive files/commands without approval.
- Restore zip archives in a staging directory; block path traversal, symlinks and zip bombs.
- Run `.agents/skills/lexibook-security-review/SKILL.md` before release.
