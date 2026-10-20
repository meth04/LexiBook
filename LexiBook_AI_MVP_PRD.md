# LexiBook AI — MVP Product Requirements Document

**Version:** 1.0 · **Target:** Windows 10/11 desktop · **Language:** Vietnamese-first UI, English learning content · **Status:** Product blueprint

## 1. Product thesis

LexiBook AI is a local-first English PDF reader that converts highlighted words/phrases into context-aware vocabulary and review material. The main promise is **Read → Understand → Save → Recall**, without copying passages into a translator or manually writing flashcards.

### Primary user
Vietnamese Windows user who regularly reads English PDF books, encounters unknown words, dislikes context-switching, and often forgets meanings after looking them up.

### Job to be done
> When I encounter an unknown expression while reading an English PDF, I want to understand its everyday meaning and the exact meaning in this passage, retain its source, and automatically review it later, so I can keep reading and remember it longer.

### Product principles
1. **Reading first:** PDF always stays the largest focal area while reading.
2. **Highlight is the input:** Select a word or phrase, then turn it into a persistent book highlight and AI explanation with minimal interaction.
3. **Context is not optional:** Every contextual vocabulary item retains an authentic sentence, book reference and page.
4. **Not every highlight becomes homework:** All highlighted terms are collected; only chosen terms enter scheduled review (with an optional one-click “Auto-add to review” preference).
5. **Local first:** Books, highlights, vocabulary and review states live on the PC; only excerpts needed for AI are sent to the configured provider.
6. **No surprise charges or nudges:** Cache analyses, surface API errors, limit retry loops, and keep notifications user-controlled.

## 2. MVP scope / non-goals

### Included (P0)
- Windows desktop installer, offline-first local library; import/delete/search PDF books, last-opened book, recent books, reading position, progress.
- High quality PDF reading (page/continuous scroll, zoom, search in PDF, next/previous, TOC if source provides it); native text selection and persistent highlight.
- Word and phrase selection with contextual extraction; persistent selected text, sentence, paragraph preview, page and anchored highlight.
- Right-hand vocabulary panel: all highlights of the selected book and currently selected word's detail (general meaning, contextual meaning, Vietnamese explanation, IPA when reliable, collocation, original sentence).
- Gemini AI via user-supplied Google AI Studio API key; settings allow choosing an available supported model; structured JSON validation, cancellation and caching.
- Vocabulary library scoped by book and globally; deduplicate lexical entries without losing individual contexts; edit/delete/mark-for-study; clicking occurrence navigates to PDF page/highlight.
- Study queue; two modes: (a) contextual flashcards, (b) short quiz containing multiple-choice meaning and fill-in-the-blank drawn from real source sentences.
- Spaced repetition review scheduler using an established FSRS implementation and Again/Hard/Good/Easy grade; due today, backlog counts, configurable new/review daily limits.
- User-configured Windows notification for due reviews; permissions and quiet times; action opens Study; gracefully handle app not running.
- Basic progress dashboard: saved terms, active review cards, due today, reviewed today, correct-answer rate, reading time/progress (only when tracked reliably), weekly study consistency.
- Local database, API credential secure storage, export and import of user data, editable reminder and study settings.

### Excluded from v1.0 (explicit)
- EPUB; OCR/scanned PDFs; whole-book chat/summarization; mobile apps; account registration/cloud sync; community sets; multiplayer and gamification marketplace; online payments; teacher/social features; AI pronunciation coaching; PDF editing/export of all annotations back into the binary PDF.

### Constraints
- The PDF's normal text layer must be present for accurate selection/highlighting. Inform the user when it is unavailable; do not silently produce garbage context.
- A term can appear with different meanings in multiple books. Preserve each occurrence and its contextual sense separately.
- Use a graceful non-AI path for offline reading and reviewing previously generated cards; prompt to retry explanation when internet/API is unavailable.

## 3. Information architecture

Global navigation: **Library | Reader (current book) | Vocabulary | Study | Progress | Settings**.

### Screen 1 — Library
- Search header, `Import PDF`, filters `All / Reading / Finished`.
- Book cards: cover (PDF thumbnail or generated placeholder), title (detected/editable), last read, percent progress, unique highlighted terms, terms due.
- Primary CTA `Continue reading`.
- Book actions: rename, remove from library (with explicit choice to remove retained vocabulary and/or imported file), open location, view vocabulary.
- Import PDF copies into app-managed documents directory by default to ensure links are not broken; detect duplicate documents with hash.

### Screen 2 — Reader (product's core)
Desktop 1440px reference layout:

```text
┌──────────────────────────────────────────────────────────────────────────────────┐
│ ← Library    Atomic Habits                        🔍 Search  63/270  − 100% + ⚙ │
├───────────────────────────────────────────────────────┬──────────────────────────┤
│                                                       │ Vocabulary · This Book   │
│                   PDF READER                          │ Search / All / This page │
│                                                       │ ┌──────────────────────┐ │
│  ... The effects of your habits [compound]...         │ │ compound  · p.63      │ │
│                                                       │ │ reluctant · p.59      │ │
│                                                       │ │ threshold · p.51      │ │
│                                                       │ └──────────────────────┘ │
│                                                       │ ── Selected word ─────── │
│                                                       │ compound · verb · audio  │
│                                                       │ General: ...             │
│                                                       │ In context: ...          │
│                                                       │ Original excerpt ...     │
│                                                       │ [Study this] [Edit]      │
├───────────────────────────────────────────────────────┴──────────────────────────┤
│      Reader: page prev/next · progress · optional collapse of sidebar           │
└──────────────────────────────────────────────────────────────────────────────────┘
```

- PDF occupies ~65–70% of available reading width; sidebar ~30–35%, resizable within limits and collapsible.
- Selecting word/phrase shows temporary selection UI; completed drag-to-highlight (or click `Save highlight`) persists highlight and adds item to sidebar. To avoid accidental API spend, trigger AI only on confirmed selection/highlight; automatic after confirmation (one click or mouse-up depending on user preference).
- The local vocabulary card appears **immediately** with a `Generating context analysis...` placeholder; Gemini analysis is asynchronous and interruptible.
- Sidebar provides a list of current book's highlights and detail of selected term. `This page / This book` filter; search; sort recent/page/name; `Study this term`.
- Clicking a saved vocabulary row scrolls to its PDF page, focuses the highlight, and displays the saved contextual analysis.
- Use subtle accent highlight colors, keyboard-accessible controls and high-contrast text. PDF remains neutral/clean.

### Screen 3 — Vocabulary
- Table: term/phrase, shortest meaning, source books, last encountered, status (`Saved`, `Studying`, `Mastered`), next review (when studying).
- Filter by book, study status, search, new/old; bulk actions only after selection.
- Item detail contains **all source occurrences** and distinct contextual interpretations, with one card per relevant sense/context.
- One click to `Add to Study`, remove from study, edit wording, or jump back to book.
- Deletion semantics: deleting a vocabulary item vs deleting just one occurrence must be distinct actions.

### Screen 4 — Study
- Overview: `Due today`, `New available`, `Today's progress`, daily limit; start 5-minute quick session.
- **Flashcard:** Front = original English sentence with target masked and short optional Vietnamese hint; Back = word, everyday meaning, context-specific meaning, source sentence/book; show answer then grade Again / Hard / Good / Easy.
- **Quiz:** Two question templates: choose correct contextual meaning among 4 distinct plausible options; fill missing word/phrase in the original sentence. Quiz answers produce feedback and may optionally be used as a study grade only when confidence / scoring maps clearly to FSRS; avoid double-counting same review event.
- `Study only this book` and `All books` filters.
- End session report: attempted, correct, challenging terms, next review summary.

### Screen 5 — Progress
- Metrics: highlighted unique terms, studying cards, mastered cards (defined using review criteria), reviewed today, 7-day study activity, due today.
- Book-specific progress; 7-day chart; percent accuracy on tested questions (do not invent long-term retention metrics).
- No competitive streak pressure; allow reminders and streak visual display to be disabled.

### Screen 6 — Settings
- API: securely set/test/remove Google Gemini API key, select supported model, usage estimates and cache controls. Model availability may change; don't hardcode unsupported or deprecated IDs.
- Reading: PDF scale, default sidebar visibility, autosave, default highlight behavior, theme.
- Study: preferred quiz mode, new cards/day, maximum daily review count, retention target if implementation supports it.
- Notifications: on/off, daily reminder time, quiet hours, tray behavior, startup launch opt-in, snooze choice.
- Data: backup/export, import, storage path, clear caches, privacy explanation.

## 4. Detailed core flows

### Flow A — First-run onboarding
1. Short explanation of the privacy model: documents stay local; excerpts go to Gemini only on request.
2. User imports one PDF and may skip API setup to browse library/read PDF.
3. User sets API key in Settings and presses `Test connection`, choosing supported model.
4. Reader opens with sidebar showing simple hint `Select a word or phrase`.
5. First highlighted term becomes the first vocabulary item; prompt `Add to Study` after AI result.
6. Reminders are opt-in, requested after first completed study session (not on first launch).

### Flow B — Highlight and understand
1. Select a meaningful English word or phrase in selectable PDF text.
2. Confirm highlight; selected term, page, sentence/paragraph and PDF anchor are stored atomically.
3. Sidebar list immediately shows a new entry, without waiting for API.
4. Check the AI cache keyed by provider/model/prompt version/normalized target/context signature.
5. If cache miss, send minimum needed excerpt to Gemini and request schema-constrained analysis; validate before storing and rendering.
6. Show general meanings, exact contextual sense, Vietnamese explanation, optional short example, useful phrase/collocation, IPA if trustworthy; errors show Retry without losing the highlight.
7. Press `Study this` to create a review card attached to the selected contextual sense.

### Flow C — Repeated term in different contexts
1. User highlights `charge` in another book with a different meaning.
2. A **word entry** is reused by normalized lemma/phrase but a new **occurrence** is created.
3. A context-specific **sense** and optional new review card are stored when different in meaning.
4. Vocabulary detail shows every occurrence; clicking one returns to that page.
5. Never overwrite the old contextual meaning.

### Flow D — Review and reminder
1. FSRS calculates due_at for each active review card using grade history.
2. At reminder time, with app available in tray/background, Windows sends a notification only if due > 0, respecting quiet hours and user permission.
3. Click opens Study screen on due cards; `Snooze` and `Dismiss` work, avoiding repeated harassment.
4. Users get an in-app due badge even if notifications were unavailable or OS delivery was blocked.
5. When fully exited, tray-based scheduling stops. If notifying while not running is required, plan Windows Task Scheduler or lightweight startup agent separately; don't promise this from Tauri's desktop notification scheduler alone.

## 5. Core data model

```text
Book(id, fingerprint, title, source_path, managed_path, page_count, last_page,
     last_position, added_at, last_opened_at, reading_status)
Highlight(id, book_id, page_number, selected_text, sentence_text, paragraph_text,
          text_anchor, normalized_page_quads, created_at)
Lexeme(id, canonical_form, part_of_speech, normalized_key, created_at)
Occurrence(id, lexeme_id, highlight_id, sense_id, created_at)
Sense(id, lexeme_id, general_meaning_vi, contextual_meaning_vi, example_en,
      example_vi, ipa, collocation, source_excerpt, model_id, prompt_version,
      generation_state, generated_at)
StudyCard(id, sense_id, representative_occurrence_id, card_type, enabled,
          created_at, due_at, fsrs_state_blob)
ReviewEvent(id, study_card_id, reviewed_at, mode, rating, is_correct,
            response_ms, scheduler_event_id)
ReminderConfig(id, enabled, local_time, quiet_start, quiet_end,
               app_autostart, last_notified_local_date)
AppSetting(key, value)
```

Schema notes:
- Multiple highlights can reference one lexeme; different senses can be represented separately.
- PDF highlighting must store coordinates relative to PDF pages and text anchors, never just pixels relative to current screen/zoom.
- Review events immutable for auditing, scheduler state updated transactionally to prevent duplicate submissions.
- Source excerpts are stored locally and sent remotely only when user requests AI context processing.
- Separate concept **lexeme / occurrence / contextual sense / card**, as users may learn the same spelling with different meanings.

## 6. AI specification

### Request payload
```json
{
  "highlighted_text": "gain traction",
  "sentence": "The startup struggled to gain traction despite positive reviews.",
  "paragraph": "<surrounding paragraph extracted locally>",
  "language_source": "en",
  "language_explanation": "vi"
}
```

### Suggested validated response fields
```json
{
  "lemma_or_phrase": "gain traction",
  "part_of_speech": "phrase",
  "ipa": null,
  "general_meanings_vi": ["Có đà phát triển", "Bắt đầu thu hút sự chú ý"],
  "contextual_meaning_vi": "Bắt đầu được thị trường quan tâm hoặc có người dùng thực tế.",
  "contextual_explanation_vi": "Trong câu này, tác giả nói về mức độ được thị trường đón nhận.",
  "contextual_translation_vi": "Startup gặp khó khăn trong việc thu hút sự chú ý từ thị trường dù có đánh giá tốt.",
  "usage_note": "Often used about products, projects and movements.",
  "example_en": "The app is finally gaining traction.",
  "example_vi": "Ứng dụng cuối cùng cũng bắt đầu được nhiều người quan tâm."
}
```

- AI response must pass schema validation and preserve source sentence untouched; translate without inventing unrelated context.
- Do not assign CEFR or pronunciation with unwarranted certainty. IPA may be empty if not reliably determined; speech can use Windows TTS.
- The local cache is part of product performance and cost control. Optional refresh/regenerate does not silently replace user edits.
- Prompt injection defense: PDF content is untrusted task data, not a source of system instructions; cap paragraph length and API budgets; no code execution/tool invocation from AI output.
- Allow users to inspect/remove submitted excerpts in local saved analyses. Show privacy notes in settings.

## 7. Study and quiz specification

- Use FSRS library rather than implementing scheduling formulas ad hoc. Distinguish a correct quiz answer from a grade that corresponds to a scheduler review. Prefer explicit end-of-item self-rating in flashcard mode; for scored quiz mode, define one consistent deterministic mapping (and surface it to user).
- Default `New/day = 10` and `Max reviews/day = 50`, both editable. Avoid silently piling new cards beyond a user's configured workload.
- Flashcard types: `cloze + contextual meaning`. Optional reverse English→Vietnamese later; the v1 card should demand active recall rather than recognition alone.
- Quiz multiple-choice distractors should be verified for uniqueness and non-overlap; if reliable distractors unavailable, choose other queued questions rather than present a false answer.
- Quiz session size choices: 5 / 10 / 20. Queue due cards first, then new cards according to limit.
- Progress states: `Saved` = highlighted, not scheduled; `Learning` = active and being reviewed; `Mastered` = defined by a documented retrievability threshold or stable interval, not merely one correct quiz.
- Study notifications target due cards, not engagement-only messages. Users can turn them off at any time.

## 8. UI / visual language

- Desktop-first, premium but restrained, inspired by serious reading apps rather than flashy gamification.
- Default light reader with warm off-white canvas; graphite text; muted indigo accent for actions; pale amber for highlights; green only for confirmed mastered / success.
- Typography: readable book document type dictated by PDF; UI typeface such as Inter/Segoe UI. Sidebar density is comfortable at 320–420px.
- Interactions: keyboard support for next/previous page, escape current selection, save highlight, start study; accessible focus indicator.
- Avoid popups on every highlighted term; sidebar is persistent, updated non-disruptively.
- Support dark theme where PDF display can be kept as-is or optionally inverted carefully without damaging diagrams.
- Basic layouts at 1366×768 through 2560×1440. When narrow, sidebar can overlay/collapse rather than shrink PDF below practical width.

## 9. Implementation recommendation

| Layer | Technology | Why |
|---|---|---|
| Native desktop | Tauri 2 | Windows packaging, native integration, small footprint |
| UI | React + TypeScript | Componentized shell and testable flows |
| Styling | Tailwind CSS | Fast and consistent visual system |
| PDF view | PDF.js | Text layer, page rendering, search, custom overlay highlight |
| Local persistence | SQLite | Search and relational links across books/highlights/cards |
| AI | Gemini API | User key, schema-enforced JSON, language/context explanations |
| Secret storage | Windows Credential Manager / OS-secured store | Keeps API key outside ordinary SQLite files and logs |
| Repetition | FSRS implementation | Evidence-informed adaptive review intervals |
| Notifications | Tauri notification + tray/autostart | Native installed-app notifications and opted-in background reminders |
| Packaging | Tauri MSI/NSIS installer | Installable Windows deliverable |

Security caveat: a client-side personal BYOK app can hide casual exposure but cannot offer the same enforceable key secrecy as a controlled backend. All AI calls should go through the trusted desktop backend rather than publicly bundled UI JS; rate limit locally, and warn users against redistributing their configured installer/profile.

Offline: PDF rendering, stored explanations and study progress work offline. New Gemini explanations require network connectivity.

Reminder caveat: Tauri notifications on desktop are immediate, not natively scheduled for future delivery. Schedule due checks while app is running in tray; autostart must be opt-in. Hard-exit reminders require a separate OS-level scheduler/task.

## 10. Edge cases & graceful failure

| Case | Expected behavior |
|---|---|
| Scanned/image-only PDF | Read normally; disable inaccurate word selection and explain that OCR is not yet supported |
| Broken PDF text layer / multi-column text | Show extracted context preview and allow user to manually adjust sentence before calling AI |
| Duplicate PDF import | Prompt to open existing copy or import new independent version |
| Same word highlighted twice | Don't create an identical duplicate within the same passage; focus existing highlight |
| Gemini quota exhausted / invalid key | Keep highlight saved; label analysis failed; allow retry after settings update |
| AI returns wrong/unhelpful sense | User edits contextual meaning; preserve user version and optional AI version separately |
| PDF source is moved/deleted | Managed import avoids this by default; external-reference mode shows missing file resolution |
| Windows notification permission denied | Show due badge in app, do not nag for permission repeatedly |
| App closed completely | No claim that tray-based reminder can notify after shutdown; offer autostart or future OS task feature |
| Slow network | Don't freeze reader; allow other highlights/scrolling and cancellation |
| Large PDF / many highlights | Lazy-render pages, virtualize lists, store indexed searches and bounded caches |

## 11. Milestones and priorities

**Milestone 1 — Reader foundation:** Tauri app, PDF import/library, resume position, text selection, stable persisted highlight, usable sidebar.

**Milestone 2 — AI workflow:** secure key storage, Gemini structured output, context extraction, async state/error/retry, cache; vocabulary from highlights.

**Milestone 3 — Learning:** vocabulary manager, card creation, study UI, FSRS review data model, simple quiz, basic progress.

**Milestone 4 — Ship-ready:** reminder consent/tray/autostart, settings, backup/restore, accessibility basics, Windows installer, end-to-end tests.

Order is logical, not a fixed promised timeline. Finish and validate each milestone before expanding scope.

## 12. Definition of Done (acceptance tests)

1. User can install the Windows app and import three ordinary text-based PDF books without creating an account.
2. Closing and reopening the app restores books, page positions and highlights.
3. Highlighting a word or phrase adds it immediately to the right sidebar, then adds a validated explanation under normal API conditions.
4. The analysis includes distinct everyday meaning and meaning in the *selected original passage*; user can correct it.
5. Selecting a saved word jumps back to its highlighted source location even after reopening or zooming.
6. A term used in two books with different senses preserves both occurrences/contextual meanings.
7. Turning a term into a study card makes it available in Flashcard and Quiz; source sentence remains attached.
8. A review grade updates next review via FSRS and survives restarts.
9. Daily reminder can be configured/disabled; due badge works offline; no falsely promised reminder when program has fully exited.
10. No key appears in SQLite export, application logs, client source bundle or UI screenshot by default.
11. Duplicate selections, invalid key, quota error, timeout and scanned PDF show clear recoverable states.
12. Backup/restore returns library metadata, highlights, word analyses, review history and optionally managed PDF files without broken references.
13. In an initial usability test, a new user can import a PDF, highlight a phrase, understand its context, and study it again without opening a second app.

## 13. Success metrics for beta users

- **Core activation:** Import a PDF + complete first highlight + AI explanation + add one study card.
- **Reading friction:** Time and action count from selecting an unknown word to seeing useful contextual interpretation.
- **Return behavior:** Percentage of activated testers opening a book and/or studying again after 7 days.
- **Review outcomes:** Correct retrieval rate across a repeated set of context cards after 7 and 30 days; do not infer retention from raw save counts.
- **Reliability:** Highlight preservation, navigation-to-source accuracy, AI failure/retry rates, startup performance and notification opt-in reliability.

### External technical documentation (checked October 2026)
- Gemini structured outputs: https://ai.google.dev/gemini-api/docs/structured-output
- PDF.js: https://mozilla.github.io/pdf.js/
- Tauri notification plugin: https://v2.tauri.app/plugin/notification/
- Tauri autostart plugin: https://v2.tauri.app/plugin/autostart/
- FSRS reference: https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm

**Final product scope decision:** Launch a superb *PDF → contextual explanation → saved vocabulary → scheduled review* loop. Do not build every Quizlet feature or a full-blown AI tutor before validating this loop.
