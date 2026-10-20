---
name: lexibook-security-review
description: "Audit local PDFs, native Gemini credentials, untrusted AI and backup restore boundary in LexiBook."
---

# Security review

1. Threat model: hostile PDFs, malformed text layers, prompt injection in passages, malicious Gemini response, exposed key, Tauri IPC path access, unauthorized library deletion, backup traversal/zip bombs, dependency supply chain.
2. Search code and build outputs for credential leaks. Ensure native credential storage; keys absent from renderer/DB/log/export; no accidental external telemetry.
3. Validate explicit AI trigger, minimized text payload, capped retries and schema; test 401/429/timeout, untrusted HTML, prompt injection.
4. Test backup restore path traversal, symlinks, oversized archive, wrong hashes and rollback; scan filesystem access scope and SQL injection.
5. Report severity/affected path/repro/test; coordinate fixes and rerun. Never publish secret value in report.

No real API key needed. Mark untested areas clearly.
