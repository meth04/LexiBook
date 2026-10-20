# Test matrix and evidence standard

Every `PASS` needs command, platform, date/build identifier, test artifact/log path and a reproducible assertion. `NOT RUN`, `UNVERIFIED` and `BLOCKED` are allowed honest statuses. Do not confuse a mocked browser E2E with a packaged Windows desktop E2E.

| ID | Area | Expected evidence | Level | PRD acceptance |
|---|---|---|---|---|
| LIB-01 | Import three selectable PDFs and search library | persisted DB + UI | integration, Windows | 1 |
| LIB-02 | Duplicate hash import is idempotent/prompted | no silent duplication | integration | 11 |
| LIB-03 | Resume page/scroll after process restart | stored state restored | integration, Windows | 2 |
| PDF-01 | Select single word and multiword phrase | correct text+original sentence | UI + PDF fixture | 3 |
| PDF-02 | Zoom 50/125/200%, resize, scroll, rotation | anchored highlight stays on selected glyphs | visual + e2e Windows | 2,5 |
| PDF-03 | Two-column, line break, ligature, repeated word | bounded context, correct anchor or warning | fixture-based | 4,11 |
| PDF-04 | Scan-only, corrupt, password-protected PDF | safe clear recoverable UX | negative | 11 |
| HIL-01 | Confirmation persists highlight immediately | visible before mock AI completion | integration | 3 |
| HIL-02 | Cancel/time-out Gemini after highlight | highlight survives, retry works | integration | 3,11 |
| HIL-03 | Selection duplicate + same term in two books | idempotent occurrence; distinct senses | integration | 6,11 |
| AI-01 | Valid schema, daily vs contextual meanings | verified Vietnamese outputs/fixtures | contract | 4 |
| AI-02 | Invalid JSON, 401, 429, 5xx, timeout, offline | errors safely rendered, bounded retries | unit/integration | 11 |
| AI-03 | Cache hit and prompt version invalidation | no API on hit, refetch on version bump | unit | 3 |
| AI-04 | PDF prompt-injection as quoted text | no instruction execution/exfiltration | security | 10 |
| VOC-01 | Edit meaning and refresh without loss | user edit persists | integration | 4 |
| VOC-02 | Click occurrence jumps to correct highlight | persists after restart and zoom | desktop e2e | 5,6 |
| VOC-03 | Remove occurrence without deleting other senses | referential integrity | integration | 6 |
| STD-01 | Add to Study creates correct card | source context and state preserved | unit/integration | 7 |
| STD-02 | Again/Hard/Good/Easy scheduling | maintained FSRS outputs, UTC/timezone tests | unit | 8 |
| STD-03 | Double click/duplicate network event review | exactly one ReviewEvent & transition | integration | 8 |
| STD-04 | Card queue respects daily limits and filtering | due first; no unintended new cards | unit/integration | 7,8 |
| QUIZ-01 | Four unique non-overlapping MCQ options | deterministic seeded tests | unit | 7 |
| QUIZ-02 | Cloze masking for inflected phrase | no hint leaking answer | unit | 7 |
| QUIZ-03 | Quiz score not double-updating FSRS | exactly zero implicit FSRS events | integration | 8 |
| NTF-01 | Opt-in reminder + quiet hours, timezone/DST | once/day per config | unit, desktop | 9 |
| NTF-02 | Permission denied, no tray/full exit | truthful due badge and disabled state | Windows manual | 9 |
| BAK-01 | Export then restore complete state and PDFs | hash counts + anchor + reviews unchanged | integration | 12 |
| BAK-02 | Zip traversal, symlink, bad hash, missing PDF | restores nothing on fail, no path escape | security/integration | 12 |
| SEC-01 | Key never in DB, exports, logs, web JS bundle | negative scan + runtime check | security/Windows | 10 |
| SEC-02 | IPC path traversal and hostile filename | access refused, no arbitrary read | security | 10,11 |
| UI-01 | 1366×768 and 2560×1440 layouts | no clipped controls | visual/Windows | 13 |
| UI-02 | keyboard navigation, escape, aria/focus | operable without mouse where reasonable | UI accessibility | 13 |
| OFF-01 | no network: reading, saved card review, stats | works offline | integration | 1,8 |
| WIN-01 | Installed EXE launches after clean install | real installer + clean profile | Windows manual | 1,13 |
| WIN-02 | First use Read→Highlight→AI→Study→Restart | screen/video/log with no secrets | Windows acceptance | 13 |

## Minimum automated suites

- TS: `npm run lint`, `npm run typecheck`, `npm run test -- --run` (or exact equivalents documented by agent), `npm run build`.
- Rust: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test` from `src-tauri/`.
- E2E: `npm run test:e2e` using mock Gemini, deterministic local PDF fixtures, isolated temp appData, zero network by default.
- For actual Windows shipping: `npm run tauri build` (via chosen pinned package-manager commands), inspect MSI/NSIS, then clean-install/run smoke.
- Preserve existing scripts if already present. Build missing scripts in bootstrap task, document any differences here rather than claiming commands work without execution.

## Acceptance mapping and final report template

In `docs/RELEASE_REPORT.md`, include rows `PRD-01..PRD-13` with status `PASS|FAIL|UNVERIFIED|BLOCKED`, evidence link/path and reason. Distinguish mocked AI passing from live Gemini testing: a live test requires a user-owned key and explicit authorization and must not be required in CI.

## Test data policy

Generate compact, self-authored PDFs with known strings (including ligatures/two columns) and seeded test records. Never commit a commercial book PDF, production key, local user profile, or real private passage to fixtures.
