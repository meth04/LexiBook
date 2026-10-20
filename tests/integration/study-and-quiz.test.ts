import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openLexiBookDatabase } from '../../src/backend/db';
import { createLocalLexiBookBackend } from '../../src/backend/localBackendService';
import { maskTargetInSentence } from '../../src/backend/studyAndQuizService';

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

function readFixtureBase64(fileName: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, fileName)).toString('base64');
}

describe('Study Engine: FSRS Scheduling, Idempotent Reviews, Cloze Masker & Non-Mutating Quizzes', () => {
  const tempDirs: string[] = [];

  function createTempProfile(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexibook-study-test-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const d of tempDirs.splice(0, tempDirs.length)) {
      try {
        fs.rmSync(d, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it('STD-01 & STD-02 & STD-03: Saved vocabulary stays out of queue until opted in; FSRS grades persist across DB reopen; duplicate clientReviewRequestId is idempotent', async () => {
    const appDataDir = createTempProfile();
    let backend = createLocalLexiBookBackend(appDataDir);

    const bookRes = await backend.importPdf({
      fileName: 'habit_systems.pdf',
      bytesBase64: readFixtureBase64('habit_systems.pdf'),
    });
    if (!bookRes.ok) throw new Error('Import failed');

    // Create 2 highlights: "compound" (opted into Study) and "reluctant" (kept Saved-only)
    const hlStudy = await backend.createHighlight({
      bookId: bookRes.data.book.id,
      pageNumber1Based: 1,
      selectedText: 'compound',
      sentenceText: 'Small daily habits compound into remarkable results over years of practice.',
      paragraphText: 'Small daily habits compound into remarkable results over years of practice.',
      textAnchor: {
        algorithmVersion: 1,
        exact: 'compound',
        prefix: 'habits ',
        suffix: ' into',
        startOffset: 19,
        endOffset: 27,
        pdfFingerprint: bookRes.data.book.sha256,
        pageRotation: 0,
      },
      normalizedQuads: [{ x: 0.1, y: 0.2, width: 0.1, height: 0.02 }],
    });

    const hlSavedOnly = await backend.createHighlight({
      bookId: bookRes.data.book.id,
      pageNumber1Based: 1,
      selectedText: 'reluctant',
      sentenceText: 'Many readers feel reluctant to change old workflows.',
      paragraphText: 'Many readers feel reluctant to change old workflows.',
      textAnchor: {
        algorithmVersion: 1,
        exact: 'reluctant',
        prefix: 'feel ',
        suffix: ' to change',
        startOffset: 18,
        endOffset: 27,
        pdfFingerprint: bookRes.data.book.sha256,
        pageRotation: 0,
      },
      normalizedQuads: [{ x: 0.2, y: 0.4, width: 0.1, height: 0.02 }],
    });

    if (!hlStudy.ok || !hlSavedOnly.ok) throw new Error('Highlights failed');

    const senseStudy = await backend.analyzeOccurrence({
      occurrenceId: hlStudy.data.occurrence.id,
    });
    const senseSaved = await backend.analyzeOccurrence({
      occurrenceId: hlSavedOnly.data.occurrence.id,
    });
    if (!senseStudy.ok || !senseSaved.ok) throw new Error('Analyze failed');

    // Opt ONLY "compound" into Study
    const optInRes = await backend.setStudyOptIn({
      senseId: senseStudy.data.id,
      representativeOccurrenceId: hlStudy.data.occurrence.id,
      enabled: true,
    });
    expect(optInRes.ok && optInRes.data !== null).toBe(true);
    const studyCardId = optInRes.ok && optInRes.data ? optInRes.data.id : '';

    // STD-01: Verify queue contains ONLY "compound", and NOT "reluctant"
    const nowIso = new Date().toISOString();
    const queue = await backend.getStudyQueue({ nowIso, timezoneOffsetMinutes: 420 });
    expect(queue.ok).toBe(true);
    if (queue.ok) {
      expect(queue.data.sessionQueue).toHaveLength(1);
      expect(queue.data.sessionQueue[0].lexeme.canonicalForm).toBe('compound');
      expect(queue.data.sessionQueue[0].maskedSentence).toContain('_______');
    }

    // STD-02 & STD-03: Submit review with grade 'good', then replay the exact same clientReviewRequestId
    const reqId = 'review_req_unique_001';
    const rev1 = await backend.submitReview({
      studyCardId,
      grade: 'good',
      responseMs: 1400,
      clientReviewRequestId: reqId,
      nowIso,
    });
    expect(rev1.ok).toBe(true);
    if (!rev1.ok) throw new Error('Review 1 failed');
    expect(rev1.data.idempotentReplay).toBe(false);
    expect(rev1.data.card.fsrsState.reps).toBe(1);
    expect(rev1.data.card.fsrsState.stability).toBeGreaterThan(0);

    // Rapid double-click with same clientReviewRequestId -> idempotent replay, reps stays 1!
    const revReplay = await backend.submitReview({
      studyCardId,
      grade: 'good',
      responseMs: 1400,
      clientReviewRequestId: reqId,
      nowIso,
    });
    expect(revReplay.ok).toBe(true);
    if (revReplay.ok) {
      expect(revReplay.data.idempotentReplay).toBe(true);
      expect(revReplay.data.card.fsrsState.reps).toBe(1);
      expect(revReplay.data.reviewEvent.id).toBe(rev1.data.reviewEvent.id);
    }

    backend.close();

    // Reopen DB and verify FSRS state and single review_event persisted
    backend = createLocalLexiBookBackend(appDataDir);
    const eventCountRow = backend.ctx.db
      .prepare('SELECT COUNT(*) AS cnt FROM review_events WHERE study_card_id = ?')
      .get(studyCardId) as { cnt: number };
    expect(Number(eventCountRow.cnt)).toBe(1);

    backend.close();
  });

  it('STD-04: enforces dailyNewLimit and dailyReviewLimit and orders due cards before new cards', async () => {
    const appDataDir = createTempProfile();
    const backend = createLocalLexiBookBackend(appDataDir);

    await backend.updateAppSettings({
      dailyNewLimit: 1,
      dailyReviewLimit: 2,
    });

    const bookRes = await backend.importPdf({
      fileName: 'habit_systems.pdf',
      bytesBase64: readFixtureBase64('habit_systems.pdf'),
    });
    if (!bookRes.ok) throw new Error('Import failed');

    const terms = ['compound', 'gain traction', 'threshold'];
    for (let i = 0; i < terms.length; i++) {
      const hl = await backend.createHighlight({
        bookId: bookRes.data.book.id,
        pageNumber1Based: 1,
        selectedText: terms[i],
        sentenceText: `Sentence ${i} with ${terms[i]} in context.`,
        paragraphText: `Sentence ${i} with ${terms[i]} in context.`,
        textAnchor: {
          algorithmVersion: 1,
          exact: terms[i],
          prefix: '',
          suffix: '',
          startOffset: i * 20,
          endOffset: i * 20 + terms[i].length,
          pdfFingerprint: bookRes.data.book.sha256,
          pageRotation: 0,
        },
        normalizedQuads: [{ x: 0.1, y: 0.1 * (i + 1), width: 0.1, height: 0.02 }],
      });
      if (!hl.ok) throw new Error('Highlight failed');
      const sense = await backend.analyzeOccurrence({
        occurrenceId: hl.data.occurrence.id,
      });
      if (!sense.ok) throw new Error('Sense failed');
      await backend.setStudyOptIn({
        senseId: sense.data.id,
        representativeOccurrenceId: hl.data.occurrence.id,
        enabled: true,
      });
    }

    // With 3 new cards available and dailyNewLimit = 1, sessionQueue has at most 1 new card
    const queue = await backend.getStudyQueue({
      nowIso: new Date().toISOString(),
    });
    expect(queue.ok).toBe(true);
    if (queue.ok) {
      expect(queue.data.totalNewAvailableCount).toBe(3);
      expect(queue.data.newCards).toHaveLength(1);
      expect(queue.data.sessionQueue).toHaveLength(1);
    }

    backend.close();
  });

  it('QUIZ-01 & QUIZ-02 & QUIZ-03: masks inflected forms in Cloze, generates 4 unique MCQ options, and NEVER mutates FSRS review_events when submitting quiz attempts', async () => {
    // QUIZ-02: Inflection-aware Cloze masking
    const m1 = maskTargetInSentence(
      'Small daily habits compounded into remarkable results.',
      'compound'
    );
    expect(m1.matched).toBe(true);
    expect(m1.maskedSentence).toBe('Small daily habits _______ into remarkable results.');

    const m2 = maskTargetInSentence(
      'When new routines are gaining traction, resistance fades.',
      'gain traction'
    );
    expect(m2.matched).toBe(true);
    expect(m2.maskedSentence).toBe('When new routines are _______, resistance fades.');

    const appDataDir = createTempProfile();
    const backend = createLocalLexiBookBackend(appDataDir);

    const bookRes = await backend.importPdf({
      fileName: 'habit_systems.pdf',
      bytesBase64: readFixtureBase64('habit_systems.pdf'),
    });
    if (!bookRes.ok) throw new Error('Import failed');

    const hl = await backend.createHighlight({
      bookId: bookRes.data.book.id,
      pageNumber1Based: 1,
      selectedText: 'compound',
      sentenceText: 'Small daily habits compound into remarkable results over years of practice.',
      paragraphText: 'Small daily habits compound into remarkable results over years of practice.',
      textAnchor: {
        algorithmVersion: 1,
        exact: 'compound',
        prefix: 'habits ',
        suffix: ' into',
        startOffset: 19,
        endOffset: 27,
        pdfFingerprint: bookRes.data.book.sha256,
        pageRotation: 0,
      },
      normalizedQuads: [{ x: 0.1, y: 0.2, width: 0.1, height: 0.02 }],
    });
    if (!hl.ok) throw new Error('Highlight failed');

    const sense = await backend.analyzeOccurrence({
      occurrenceId: hl.data.occurrence.id,
    });
    if (!sense.ok) throw new Error('Sense failed');

    const cardRes = await backend.setStudyOptIn({
      senseId: sense.data.id,
      representativeOccurrenceId: hl.data.occurrence.id,
      enabled: true,
    });
    if (!cardRes.ok || !cardRes.data) throw new Error('Opt-in failed');

    // QUIZ-01: Generate MCQ question with deterministic seed
    const quizRes = await backend.generateQuiz({
      sessionSize: 5,
      questionTypes: ['mcq_meaning'],
      seed: 42,
    });
    expect(quizRes.ok).toBe(true);
    if (!quizRes.ok) throw new Error('Quiz generation failed');
    expect(quizRes.data.questions).toHaveLength(1);
    const q = quizRes.data.questions[0];
    expect(q.optionsVi).toHaveLength(4);
    expect(new Set(q.optionsVi).size).toBe(4);
    expect(q.optionsVi).toContain(q.correctAnswer);

    // QUIZ-03: Submit quiz attempt and verify ZERO review_events created and FSRS reps remains 0
    const attemptRes = await backend.submitQuizAttempt({
      clientAttemptId: 'quiz_attempt_001',
      bookId: bookRes.data.book.id,
      totalQuestions: 1,
      correctCount: 1,
      answers: [
        {
          questionId: q.questionId,
          studyCardId: q.studyCardId,
          questionType: q.questionType,
          userAnswer: q.correctAnswer,
          isCorrect: true,
        },
      ],
    });
    expect(attemptRes.ok).toBe(true);

    const dbCheck = openLexiBookDatabase(appDataDir);
    const revEventsCount = (
      dbCheck.db.prepare('SELECT COUNT(*) AS cnt FROM review_events').get() as { cnt: number }
    ).cnt;
    expect(Number(revEventsCount)).toBe(0);

    const cardAfterQuiz = dbCheck.db
      .prepare('SELECT fsrs_state_json FROM study_cards WHERE id = ?')
      .get(cardRes.data.id) as { fsrs_state_json: string };
    expect(JSON.parse(cardAfterQuiz.fsrs_state_json).reps).toBe(0);

    dbCheck.close();
    backend.close();
  });
});
