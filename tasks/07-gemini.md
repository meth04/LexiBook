# TASK 07 — Gemini BYOK contextual explanations and safe caching

**Lead:** gemini-ai  
**Dependencies:** 01,03,06 typed contract stable  
**Status:** NOT STARTED (update `docs/STATUS_TRACKER.md` only after actual execution)

## Objective
Explain highlighted text in common use and its exact source-book context using a user-owned Gemini key without exposing sensitive material.

## Implementation sequence
1. Build Settings secure native key set/test/delete with current supported Windows credential storage API; Rust-side HTTP only, no renderer secrets, redacted logs/errors. No key stored in DB or export.
2. Discover/select available supported Gemini models or validate configured model; avoid hard-coding outdated model without fallback.
3. Prompt with bounded target, authentic selected sentence and surrounding paragraph only after user-confirmed highlight; privacy disclosure and capped token/spend budget.
4. Use provider-supported structured output JSON Schema: lemma/phrase, POS, IPA nullable, general_meanings_vi, contextual_meaning_vi, contextual_explanation_vi, translation, notes/examples. Validate and sanitize every response.
5. Maintain generation statuses: idle/queued/loading/succeeded/failed/cancelled; retry policy with request timeout, max retries and jitter/backoff; errors for auth/quota/offline/malformed JSON.
6. Cache by model/provider/prompt+schema version/context signature. AI refresh never overwrites edited user content; timestamp/token accounting approximate and labeled.
7. Write mock provider fixtures for polysemy (`charge`, `run`, `gain traction`); inject hostile PDF prompt text and unexpected HTML/malformed JSON tests.

## Acceptance criteria (must prove)
- [ ] After highlight sidebar shows immediate local entry and validated common+context meanings asynchronously.
- [ ] 401/403/429/offline/timeout/cancellation do not lose highlight or freeze reader and allow safe retry.
- [ ] No plaintext credential in renderer, DB, exports or logs; cache hits use zero additional requests.
- [ ] Existing user-edited sense remains authoritative after refresh.

## Test plan — commands and evidence
- [ ] Mock HTTP contract success schema/invalid null variants and transport failure/status mapping.
- [ ] Security test PDF injection text never changes instruction priority, provider output is escaped and schema validated.
- [ ] Native key storage smoke on Windows, plus static build artifact scan; live API test only with authorized BYOK key.

## Failure / adversarial cases
- [ ] Gemini changes model availability/response schema; key invalid/quota exhausted.
- [ ] Too-long paragraph, untrusted instructions or content generated in HTML/markdown.
- [ ] Concurrent refresh and edit, stale response after user navigates away.

## File boundaries and handoff
AI agent owns native provider/credential adapter and Settings AI section, not PDF renderer, study storage or shared contract edits.

Use `docs/HANDOFF_TEMPLATE.md`. Provide exact paths, migration/DTO changes, actual test command + exit codes, assertions and reproducible manual checks. Never mark this task complete with only a mock screenshot. Follow root `AGENTS.md`, all applicable `.agents/rules/`, and product PRD. Do not create unsupported APIs; verify documentation and pin supported dependency versions.
