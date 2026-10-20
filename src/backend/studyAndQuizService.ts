import crypto from 'node:crypto';
import { type CardInput, fsrs, type Grade, Rating, type State } from 'ts-fsrs';
import type { LexiBookDbContext } from './db';
import { getAppSettings } from './reminderService';
import {
  err,
  mapHighlightRow,
  mapLexemeRow,
  mapSenseRow,
  mapStudyCardRow,
  ok,
} from './repositories';
import type {
  BookProgressItem,
  DailyActivityPoint,
  FsrsPersistedState,
  GenerateQuizInput,
  GenerateQuizResult,
  ProgressMetrics,
  QuizAttemptRecord,
  QuizQuestion,
  QuizQuestionType,
  Result,
  ReviewEvent,
  ReviewGrade,
  StudyCardView,
  StudyQueueFilter,
  StudyQueueResult,
  SubmitQuizAttemptInput,
  SubmitReviewInput,
  SubmitReviewResult,
} from '../shared/types/contracts';

export const MASTERED_RULE_DESCRIPTION_VI =
  'Thẻ đạt trạng thái Thành thạo khi độ ổn định trí nhớ FSRS (stability) >= 21 ngày và đã ôn tập tối thiểu 3 lần (reps >= 3).';

const scheduler = fsrs({
  enable_fuzz: false,
  enable_short_term: true,
});

export function isCardMastered(state: FsrsPersistedState): boolean {
  return state.stability >= 21 && state.reps >= 3;
}

function mapReviewGradeToFsrsRating(grade: ReviewGrade): Grade {
  switch (grade) {
    case 'again':
      return Rating.Again;
    case 'hard':
      return Rating.Hard;
    case 'good':
      return Rating.Good;
    case 'easy':
      return Rating.Easy;
  }
}

function buildInflectionWordPattern(word: string): string {
  const clean = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lower = word.toLowerCase();
  const variants = new Set<string>([clean]);

  if (/^[a-zA-Z]+$/.test(word)) {
    variants.add(`${clean}s`);
    variants.add(`${clean}es`);
    variants.add(`${clean}ed`);
    variants.add(`${clean}d`);
    variants.add(`${clean}ing`);

    if (lower.endsWith('e') && word.length > 2) {
      const stem = word.slice(0, -1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      variants.add(`${stem}ing`);
      variants.add(`${stem}ed`);
    }
    if (lower.endsWith('y') && word.length > 2) {
      const stem = word.slice(0, -1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      variants.add(`${stem}ies`);
      variants.add(`${stem}ied`);
    }
  }

  return `(?:${[...variants].sort((a, b) => b.length - a.length).join('|')})`;
}

/**
 * Masks the target word or multiword phrase inside `sentenceText` with `"_______"`,
 * handling case differences and common English morphological inflections
 * (e.g. "compound" -> "compounded"/"compounds", "gain traction" -> "gaining traction").
 */
export function maskTargetInSentence(
  sentenceText: string,
  targetTerm: string
): { maskedSentence: string; matched: boolean } {
  const cleanTarget = targetTerm.replace(/\s+/g, ' ').trim();
  if (!sentenceText || !cleanTarget) {
    return { maskedSentence: sentenceText || '', matched: false };
  }

  const words = cleanTarget.split(' ');
  const wordPatterns = words.map(buildInflectionWordPattern);
  const fullPatternStr = `\\b${wordPatterns.join('\\s+')}\\b`;

  try {
    const regex = new RegExp(fullPatternStr, 'gi');
    if (regex.test(sentenceText)) {
      const maskedSentence = sentenceText.replace(new RegExp(fullPatternStr, 'gi'), '_______');
      return { maskedSentence, matched: true };
    }
  } catch {
    // Fallback to literal case-insensitive check
  }

  const escapedLiteral = cleanTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fallbackRegex = new RegExp(escapedLiteral, 'gi');
  if (fallbackRegex.test(sentenceText)) {
    return {
      maskedSentence: sentenceText.replace(fallbackRegex, '_______'),
      matched: true,
    };
  }

  return { maskedSentence: sentenceText, matched: false };
}

function getLocalDayBoundsIso(
  nowIso: string,
  timezoneOffsetMinutes?: number
): { startOfDayIso: string; endOfDayIso: string; localDateStr: string } {
  const nowDate = new Date(nowIso);
  const offsetMin =
    timezoneOffsetMinutes !== undefined ? timezoneOffsetMinutes : -nowDate.getTimezoneOffset();
  const localMs = nowDate.getTime() + offsetMin * 60_000;
  const localDate = new Date(localMs);

  const year = localDate.getUTCFullYear();
  const month = String(localDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(localDate.getUTCDate()).padStart(2, '0');
  const localDateStr = `${year}-${month}-${day}`;

  const startLocalUtcMs = Date.UTC(year, localDate.getUTCMonth(), localDate.getUTCDate(), 0, 0, 0, 0);
  const endLocalUtcMs = Date.UTC(
    year,
    localDate.getUTCMonth(),
    localDate.getUTCDate(),
    23,
    59,
    59,
    999
  );

  const startOfDayIso = new Date(startLocalUtcMs - offsetMin * 60_000).toISOString();
  const endOfDayIso = new Date(endLocalUtcMs - offsetMin * 60_000).toISOString();

  return { startOfDayIso, endOfDayIso, localDateStr };
}

function loadEnabledStudyCardViews(
  ctx: LexiBookDbContext,
  bookId?: string
): StudyCardView[] {
  const params: string[] = [];
  let bookFilterSql = '';
  if (bookId) {
    bookFilterSql = 'AND h.book_id = ?';
    params.push(bookId);
  }

  const rows = ctx.db
    .prepare(
      `SELECT
         sc.id AS sc_id, sc.sense_id AS sc_sense_id,
         sc.representative_occurrence_id AS sc_rep_occ_id,
         sc.enabled AS sc_enabled, sc.created_at AS sc_created_at,
         sc.due_at AS sc_due_at, sc.fsrs_state_json AS sc_fsrs_state_json,
         sc.is_mastered AS sc_is_mastered,
         s.id AS s_id, s.lexeme_id AS s_lexeme_id,
         s.general_meanings_vi_json AS s_general_meanings_vi_json,
         s.contextual_meaning_vi AS s_contextual_meaning_vi,
         s.contextual_explanation_vi AS s_contextual_explanation_vi,
         s.contextual_translation_vi AS s_contextual_translation_vi,
         s.ipa AS s_ipa, s.collocation AS s_collocation,
         s.example_en AS s_example_en, s.example_vi AS s_example_vi,
         s.source_excerpt AS s_source_excerpt, s.generation_state AS s_generation_state,
         s.ai_metadata_json AS s_ai_metadata_json,
         s.user_edited_flags_json AS s_user_edited_flags_json,
         s.created_at AS s_created_at, s.updated_at AS s_updated_at,
         l.id AS l_id, l.normalized_key AS l_normalized_key,
         l.canonical_form AS l_canonical_form, l.part_of_speech AS l_part_of_speech,
         l.created_at AS l_created_at,
         h.id AS h_id, h.book_id AS h_book_id,
         h.page_number_1based AS h_page_number_1based,
         h.selected_text AS h_selected_text, h.sentence_text AS h_sentence_text,
         h.paragraph_text AS h_paragraph_text, h.text_anchor_json AS h_text_anchor_json,
         h.normalized_quads_json AS h_normalized_quads_json,
         h.anchor_signature AS h_anchor_signature, h.created_at AS h_created_at,
         b.title AS book_title
       FROM study_cards sc
       JOIN senses s ON s.id = sc.sense_id
       JOIN lexemes l ON l.id = s.lexeme_id
       JOIN occurrences o ON o.id = sc.representative_occurrence_id
       JOIN highlights h ON h.id = o.highlight_id
       JOIN books b ON b.id = h.book_id
       WHERE sc.enabled = 1 ${bookFilterSql}
       ORDER BY sc.due_at ASC, sc.created_at ASC`
    )
    .all(...params) as Array<Record<string, unknown>>;

  return rows.map((r) => {
    const card = mapStudyCardRow({
      id: String(r.sc_id),
      sense_id: String(r.sc_sense_id),
      representative_occurrence_id: String(r.sc_rep_occ_id),
      enabled: Number(r.sc_enabled),
      created_at: String(r.sc_created_at),
      due_at: String(r.sc_due_at),
      fsrs_state_json: String(r.sc_fsrs_state_json),
      is_mastered: Number(r.sc_is_mastered),
    });

    const sense = mapSenseRow({
      id: String(r.s_id),
      lexeme_id: String(r.s_lexeme_id),
      general_meanings_vi_json: String(r.s_general_meanings_vi_json),
      contextual_meaning_vi: String(r.s_contextual_meaning_vi),
      contextual_explanation_vi: String(r.s_contextual_explanation_vi),
      contextual_translation_vi: r.s_contextual_translation_vi
        ? String(r.s_contextual_translation_vi)
        : null,
      ipa: r.s_ipa ? String(r.s_ipa) : null,
      collocation: r.s_collocation ? String(r.s_collocation) : null,
      example_en: r.s_example_en ? String(r.s_example_en) : null,
      example_vi: r.s_example_vi ? String(r.s_example_vi) : null,
      source_excerpt: String(r.s_source_excerpt),
      generation_state: r.s_generation_state as Parameters<
        typeof mapSenseRow
      >[0]['generation_state'],
      ai_metadata_json: r.s_ai_metadata_json ? String(r.s_ai_metadata_json) : null,
      user_edited_flags_json: String(r.s_user_edited_flags_json),
      created_at: String(r.s_created_at),
      updated_at: String(r.s_updated_at),
    });

    const lexeme = mapLexemeRow({
      id: String(r.l_id),
      normalized_key: String(r.l_normalized_key),
      canonical_form: String(r.l_canonical_form),
      part_of_speech: r.l_part_of_speech ? String(r.l_part_of_speech) : null,
      created_at: String(r.l_created_at),
    });

    const highlight = mapHighlightRow({
      id: String(r.h_id),
      book_id: String(r.h_book_id),
      page_number_1based: Number(r.h_page_number_1based),
      selected_text: String(r.h_selected_text),
      sentence_text: String(r.h_sentence_text),
      paragraph_text: String(r.h_paragraph_text),
      text_anchor_json: String(r.h_text_anchor_json),
      normalized_quads_json: String(r.h_normalized_quads_json),
      anchor_signature: String(r.h_anchor_signature),
      created_at: String(r.h_created_at),
    });

    const sourceSentence = highlight.sentenceText || sense.sourceExcerpt;
    const masked = maskTargetInSentence(
      sourceSentence,
      highlight.selectedText || lexeme.canonicalForm
    );

    return {
      card,
      lexeme,
      sense,
      highlight,
      bookTitle: String(r.book_title),
      maskedSentence: masked.maskedSentence,
    };
  });
}

export function getStudyQueue(
  ctx: LexiBookDbContext,
  filter?: StudyQueueFilter
): Result<StudyQueueResult> {
  const nowIso = filter?.nowIso ?? new Date().toISOString();
  const settings = getAppSettings(ctx);
  const dailyNewLimit = Math.max(0, settings.dailyNewLimit);
  const dailyReviewLimit = Math.max(0, settings.dailyReviewLimit);

  const { startOfDayIso, endOfDayIso } = getLocalDayBoundsIso(
    nowIso,
    filter?.timezoneOffsetMinutes
  );

  const reviewedTodayRow = ctx.db
    .prepare(
      `SELECT COUNT(*) AS cnt
       FROM review_events
       WHERE reviewed_at >= ? AND reviewed_at <= ?`
    )
    .get(startOfDayIso, endOfDayIso) as { cnt: number } | undefined;
  const reviewedTodayCount = Number(reviewedTodayRow?.cnt ?? 0);

  // Count how many distinct study cards had their VERY FIRST review today
  const newStudiedTodayRow = ctx.db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM (
         SELECT study_card_id, MIN(reviewed_at) AS first_rev
         FROM review_events
         GROUP BY study_card_id
         HAVING first_rev >= ? AND first_rev <= ?
       )`
    )
    .get(startOfDayIso, endOfDayIso) as { cnt: number } | undefined;
  const newStudiedTodayCount = Number(newStudiedTodayRow?.cnt ?? 0);

  const allEnabledViews = loadEnabledStudyCardViews(ctx, filter?.bookId);

  const allDueReviews = allEnabledViews.filter(
    (v) => v.card.fsrsState.reps > 0 && v.card.dueAt <= nowIso
  );
  const allNewCards = allEnabledViews.filter(
    (v) => v.card.fsrsState.reps === 0 && v.card.dueAt <= nowIso
  );

  const remainingReviewSlots = Math.max(0, dailyReviewLimit - reviewedTodayCount);
  const remainingNewSlots = Math.max(0, dailyNewLimit - newStudiedTodayCount);

  const dueCards = allDueReviews.slice(0, remainingReviewSlots);
  const slotsAfterDue = Math.max(0, remainingReviewSlots - dueCards.length);
  const newCards = allNewCards.slice(0, Math.min(remainingNewSlots, slotsAfterDue));

  const sessionQueue = [...dueCards, ...newCards];

  return ok({
    dueCards,
    newCards,
    sessionQueue,
    totalDueCount: allDueReviews.length,
    totalNewAvailableCount: allNewCards.length,
    reviewedTodayCount,
    newStudiedTodayCount,
    dailyNewLimit,
    dailyReviewLimit,
  });
}

export function submitReview(
  ctx: LexiBookDbContext,
  input: SubmitReviewInput
): Result<SubmitReviewResult> {
  if (!input.clientReviewRequestId || !input.studyCardId) {
    return err('VALIDATION_ERROR', 'Thiếu mã yêu cầu đánh giá (clientReviewRequestId) hoặc mã thẻ.');
  }

  ctx.db.exec('BEGIN IMMEDIATE');
  try {
    // 1. Idempotency check by clientReviewRequestId
    const existingEventRow = ctx.db
      .prepare('SELECT * FROM review_events WHERE client_review_request_id = ?')
      .get(input.clientReviewRequestId) as
      | {
          id: string;
          study_card_id: string;
          reviewed_at: string;
          mode: 'flashcard';
          grade: ReviewGrade;
          is_correct: number;
          response_ms: number;
          client_review_request_id: string;
        }
      | undefined;

    if (existingEventRow) {
      const cardRow = ctx.db
        .prepare('SELECT * FROM study_cards WHERE id = ?')
        .get(existingEventRow.study_card_id) as Parameters<typeof mapStudyCardRow>[0] | undefined;

      if (!cardRow) {
        ctx.db.exec('ROLLBACK');
        return err('NOT_FOUND', 'Không tìm thấy thẻ ôn tập tương ứng.');
      }

      ctx.db.exec('COMMIT');
      return ok({
        card: mapStudyCardRow(cardRow),
        reviewEvent: {
          id: existingEventRow.id,
          studyCardId: existingEventRow.study_card_id,
          reviewedAt: existingEventRow.reviewed_at,
          mode: 'flashcard',
          grade: existingEventRow.grade,
          isCorrect: Boolean(existingEventRow.is_correct),
          responseMs: Number(existingEventRow.response_ms),
          clientReviewRequestId: existingEventRow.client_review_request_id,
        },
        idempotentReplay: true,
      });
    }

    const cardRow = ctx.db
      .prepare('SELECT * FROM study_cards WHERE id = ?')
      .get(input.studyCardId) as Parameters<typeof mapStudyCardRow>[0] | undefined;

    if (!cardRow) {
      ctx.db.exec('ROLLBACK');
      return err('NOT_FOUND', 'Không tìm thấy thẻ ôn tập cần chấm điểm.');
    }

    const currentCard = mapStudyCardRow(cardRow);
    const nowIso = input.nowIso ?? new Date().toISOString();
    const nowDate = new Date(nowIso);

    const fsrsInputCard: CardInput = {
      due: new Date(currentCard.fsrsState.due),
      stability: currentCard.fsrsState.stability,
      difficulty: currentCard.fsrsState.difficulty,
      elapsed_days: currentCard.fsrsState.elapsed_days,
      scheduled_days: currentCard.fsrsState.scheduled_days,
      reps: currentCard.fsrsState.reps,
      lapses: currentCard.fsrsState.lapses,
      state: currentCard.fsrsState.state as State,
      last_review: currentCard.fsrsState.last_review
        ? new Date(currentCard.fsrsState.last_review)
        : undefined,
    };

    const rating = mapReviewGradeToFsrsRating(input.grade);
    const schedulingRecord = scheduler.repeat(fsrsInputCard, nowDate);
    const nextItem = schedulingRecord[rating];
    const nextCard = nextItem.card;

    const nextDueIso = nextCard.due.toISOString();
    const nextFsrsState: FsrsPersistedState = {
      due: nextDueIso,
      stability: Number(nextCard.stability.toFixed(6)),
      difficulty: Number(nextCard.difficulty.toFixed(6)),
      elapsed_days: nextCard.elapsed_days,
      scheduled_days: nextCard.scheduled_days,
      reps: nextCard.reps,
      lapses: nextCard.lapses,
      state: Number(nextCard.state),
      last_review: nextCard.last_review ? nextCard.last_review.toISOString() : nowIso,
    };

    const mastered = isCardMastered(nextFsrsState);

    ctx.db
      .prepare(
        `UPDATE study_cards
         SET due_at = ?, fsrs_state_json = ?, is_mastered = ?
         WHERE id = ?`
      )
      .run(nextDueIso, JSON.stringify(nextFsrsState), mastered ? 1 : 0, currentCard.id);

    const eventId = crypto.randomUUID();
    const isCorrect = input.grade !== 'again';
    const safeResponseMs = Math.max(0, Math.round(input.responseMs || 0));

    ctx.db
      .prepare(
        `INSERT INTO review_events (
          id, study_card_id, reviewed_at, mode, grade, is_correct, response_ms, client_review_request_id
        ) VALUES (?, ?, ?, 'flashcard', ?, ?, ?, ?)`
      )
      .run(
        eventId,
        currentCard.id,
        nowIso,
        input.grade,
        isCorrect ? 1 : 0,
        safeResponseMs,
        input.clientReviewRequestId
      );

    ctx.db.exec('COMMIT');

    const updatedCardRow = ctx.db
      .prepare('SELECT * FROM study_cards WHERE id = ?')
      .get(currentCard.id) as unknown as Parameters<typeof mapStudyCardRow>[0];

    const reviewEvent: ReviewEvent = {
      id: eventId,
      studyCardId: currentCard.id,
      reviewedAt: nowIso,
      mode: 'flashcard',
      grade: input.grade,
      isCorrect,
      responseMs: safeResponseMs,
      clientReviewRequestId: input.clientReviewRequestId,
    };

    return ok({
      card: mapStudyCardRow(updatedCardRow),
      reviewEvent,
      idempotentReplay: false,
    });
  } catch (e) {
    ctx.db.exec('ROLLBACK');
    return err(
      'DB_ERROR',
      'Không thể ghi nhận kết quả ôn tập FSRS.',
      true,
      e instanceof Error ? e.message : String(e)
    );
  }
}

const CURATED_DISTRACTOR_MEANINGS_VI: readonly string[] = [
  'sự phân bổ nguồn lực dài hạn trong tổ chức',
  'quá trình đồng bộ hóa dữ liệu cục bộ ngoại tuyến',
  'khả năng thích ứng nhanh với biến động thị trường',
  'nguyên tắc tối giản hóa giao diện nhận thức',
  'hiệu ứng lan tỏa trong mạng lưới học thuật',
  'cơ chế tự điều chỉnh phản hồi ngược',
  'mức độ ưu tiên xử lý tác vụ trọng tâm',
  'rào cản tâm lý khi tiếp cận phương pháp mới',
];

function createSeededRandom(seed = 1337): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function deterministicShuffle<T>(items: T[], rand: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

function normalizeMeaningForComparison(meaning: string): string {
  return meaning
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function generateQuiz(
  ctx: LexiBookDbContext,
  input: GenerateQuizInput
): Result<GenerateQuizResult> {
  const cardViews = loadEnabledStudyCardViews(ctx, input.bookId);
  if (cardViews.length === 0) {
    return err(
      'QUIZ_INSUFFICIENT_CARDS',
      'Chưa có thẻ từ vựng nào trong danh sách Ôn tập để tạo bài kiểm tra.'
    );
  }

  const rand = createSeededRandom(input.seed ?? Date.now());
  const allowedTypes: QuizQuestionType[] =
    input.questionTypes && input.questionTypes.length > 0
      ? input.questionTypes
      : ['mcq_meaning', 'cloze_sentence'];

  // Gather all saved Vietnamese contextual meanings across the DB to serve as realistic distractors
  const allSenseMeaningsRows = ctx.db
    .prepare(
      `SELECT contextual_meaning_vi FROM senses
       WHERE TRIM(contextual_meaning_vi) != ''`
    )
    .all() as unknown as Array<{ contextual_meaning_vi: string }>;

  const candidateDistractorPool = [
    ...allSenseMeaningsRows.map((r) => r.contextual_meaning_vi.trim()),
    ...CURATED_DISTRACTOR_MEANINGS_VI,
  ];

  const shuffledCards = deterministicShuffle(cardViews, rand);
  const questions: QuizQuestion[] = [];
  const skippedCardsReasons: Array<{ studyCardId: string; reason: string }> = [];

  for (const view of shuffledCards) {
    if (questions.length >= input.sessionSize) break;

    const correctMeaning =
      view.sense.contextualMeaningVi.trim() ||
      view.sense.generalMeaningsVi[0]?.trim() ||
      '';
    if (!correctMeaning) {
      skippedCardsReasons.push({
        studyCardId: view.card.id,
        reason: 'Thẻ chưa có nghĩa tiếng Việt theo ngữ cảnh.',
      });
      continue;
    }

    const targetTerm = view.highlight.selectedText.trim() || view.lexeme.canonicalForm;
    const sourceSentence = view.highlight.sentenceText || view.sense.sourceExcerpt;
    const maskRes = maskTargetInSentence(sourceSentence, targetTerm);

    const preferredType = allowedTypes[questions.length % allowedTypes.length];
    let chosenType: QuizQuestionType = preferredType;

    if (chosenType === 'cloze_sentence' && !maskRes.matched) {
      if (allowedTypes.includes('mcq_meaning')) {
        chosenType = 'mcq_meaning';
      } else {
        skippedCardsReasons.push({
          studyCardId: view.card.id,
          reason: 'Không thể ẩn chính xác cụm từ mục tiêu trong câu gốc (Cloze).',
        });
        continue;
      }
    }

    if (chosenType === 'mcq_meaning') {
      const seenNorm = new Set<string>([normalizeMeaningForComparison(correctMeaning)]);
      const distractors: string[] = [];
      const shuffledPool = deterministicShuffle(candidateDistractorPool, rand);

      for (const cand of shuffledPool) {
        if (distractors.length >= 3) break;
        const norm = normalizeMeaningForComparison(cand);
        if (norm && !seenNorm.has(norm)) {
          seenNorm.add(norm);
          distractors.push(cand);
        }
      }

      if (distractors.length < 3) {
        skippedCardsReasons.push({
          studyCardId: view.card.id,
          reason: 'Không đủ phương án nhiễu khác biệt cho câu hỏi trắc nghiệm.',
        });
        continue;
      }

      const optionsVi = deterministicShuffle([correctMeaning, ...distractors], rand);
      questions.push({
        questionId: `q_${view.card.id}_mcq`,
        studyCardId: view.card.id,
        senseId: view.sense.id,
        lexemeId: view.lexeme.id,
        questionType: 'mcq_meaning',
        promptEn: sourceSentence,
        maskedSentenceEn: maskRes.matched ? maskRes.maskedSentence : sourceSentence,
        targetTerm,
        optionsVi,
        correctAnswer: correctMeaning,
        explanationVi:
          view.sense.contextualExplanationVi ||
          `Nghĩa trong câu gốc: ${correctMeaning}`,
        bookTitle: view.bookTitle,
        pageNumber1Based: view.highlight.pageNumber1Based,
      });
    } else {
      questions.push({
        questionId: `q_${view.card.id}_cloze`,
        studyCardId: view.card.id,
        senseId: view.sense.id,
        lexemeId: view.lexeme.id,
        questionType: 'cloze_sentence',
        promptEn: sourceSentence,
        maskedSentenceEn: maskRes.maskedSentence,
        targetTerm,
        correctAnswer: targetTerm,
        explanationVi: `${targetTerm}: ${correctMeaning}. ${view.sense.contextualExplanationVi}`.trim(),
        bookTitle: view.bookTitle,
        pageNumber1Based: view.highlight.pageNumber1Based,
      });
    }
  }

  if (questions.length === 0) {
    return err(
      'QUIZ_INSUFFICIENT_CARDS',
      'Không có thẻ hợp lệ để tạo câu hỏi kiểm tra. Vui lòng phân tích nghĩa AI trước khi làm Quiz.'
    );
  }

  return ok({
    questions,
    skippedCardsReasons,
  });
}

/**
 * Records a completed quiz session into `quiz_attempts`.
 * INVARIANT (ADR-002): Submitting a quiz attempt NEVER creates a `review_events` row
 * and NEVER mutates `study_cards.fsrs_state_json`.
 */
export function submitQuizAttempt(
  ctx: LexiBookDbContext,
  input: SubmitQuizAttemptInput
): Result<QuizAttemptRecord> {
  if (!input.clientAttemptId || input.totalQuestions < 1) {
    return err('VALIDATION_ERROR', 'Dữ liệu kết quả bài kiểm tra không hợp lệ.');
  }

  const existing = ctx.db
    .prepare('SELECT * FROM quiz_attempts WHERE client_attempt_id = ?')
    .get(input.clientAttemptId) as
    | {
        id: string;
        client_attempt_id: string;
        book_id: string | null;
        total_questions: number;
        correct_count: number;
        completed_at: string;
      }
    | undefined;

  if (existing) {
    return ok({
      id: existing.id,
      clientAttemptId: existing.client_attempt_id,
      bookId: existing.book_id ?? null,
      totalQuestions: Number(existing.total_questions),
      correctCount: Number(existing.correct_count),
      completedAt: existing.completed_at,
    });
  }

  const id = crypto.randomUUID();
  const completedAt = input.completedAtIso ?? new Date().toISOString();
  const safeCorrect = Math.max(0, Math.min(input.totalQuestions, input.correctCount));

  ctx.db
    .prepare(
      `INSERT INTO quiz_attempts (
        id, client_attempt_id, book_id, total_questions, correct_count, answers_json, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      input.clientAttemptId,
      input.bookId ?? null,
      input.totalQuestions,
      safeCorrect,
      JSON.stringify(input.answers ?? []),
      completedAt
    );

  return ok({
    id,
    clientAttemptId: input.clientAttemptId,
    bookId: input.bookId ?? null,
    totalQuestions: input.totalQuestions,
    correctCount: safeCorrect,
    completedAt,
  });
}

export function getProgressMetrics(
  ctx: LexiBookDbContext,
  localDate?: string
): Result<ProgressMetrics> {
  const nowIso = new Date().toISOString();
  const effectiveLocalDate = localDate ?? nowIso.slice(0, 10);

  const uniqueLexemesCount = Number(
    (
      ctx.db.prepare('SELECT COUNT(*) AS cnt FROM lexemes').get() as {
        cnt: number;
      }
    )?.cnt ?? 0
  );

  const totalHighlightsCount = Number(
    (
      ctx.db.prepare('SELECT COUNT(*) AS cnt FROM highlights').get() as {
        cnt: number;
      }
    )?.cnt ?? 0
  );

  const studyingCardCount = Number(
    (
      ctx.db
        .prepare('SELECT COUNT(*) AS cnt FROM study_cards WHERE enabled = 1 AND is_mastered = 0')
        .get() as { cnt: number }
    )?.cnt ?? 0
  );

  const masteredCardCount = Number(
    (
      ctx.db
        .prepare('SELECT COUNT(*) AS cnt FROM study_cards WHERE enabled = 1 AND is_mastered = 1')
        .get() as { cnt: number }
    )?.cnt ?? 0
  );

  const lexemesWithActiveCardCount = Number(
    (
      ctx.db
        .prepare(
          `SELECT COUNT(DISTINCT s.lexeme_id) AS cnt
           FROM study_cards sc
           JOIN senses s ON s.id = sc.sense_id
           WHERE sc.enabled = 1`
        )
        .get() as { cnt: number }
    )?.cnt ?? 0
  );

  const savedOnlyCount = Math.max(0, uniqueLexemesCount - lexemesWithActiveCardCount);

  const dueTodayCount = Number(
    (
      ctx.db
        .prepare('SELECT COUNT(*) AS cnt FROM study_cards WHERE enabled = 1 AND due_at <= ?')
        .get(nowIso) as { cnt: number }
    )?.cnt ?? 0
  );

  const reviewedTodayCount = Number(
    (
      ctx.db
        .prepare('SELECT COUNT(*) AS cnt FROM review_events WHERE substr(reviewed_at, 1, 10) = ?')
        .get(effectiveLocalDate) as { cnt: number }
    )?.cnt ?? 0
  );

  const quizAgg = ctx.db
    .prepare(
      `SELECT COALESCE(SUM(total_questions), 0) AS total_q,
              COALESCE(SUM(correct_count), 0) AS correct_q
       FROM quiz_attempts`
    )
    .get() as { total_q: number; correct_q: number } | undefined;

  const quizTotalQuestions = Number(quizAgg?.total_q ?? 0);
  const quizCorrectQuestions = Number(quizAgg?.correct_q ?? 0);
  const quizAccuracyPercent =
    quizTotalQuestions > 0
      ? Math.round((quizCorrectQuestions / quizTotalQuestions) * 100)
      : null;

  // Build 7-day activity array ending at effectiveLocalDate
  const baseDate = new Date(`${effectiveLocalDate}T00:00:00.000Z`);
  const sevenDayActivity: DailyActivityPoint[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(baseDate.getTime() - i * 86_400_000);
    const dayStr = d.toISOString().slice(0, 10);

    const revCnt = Number(
      (
        ctx.db
          .prepare('SELECT COUNT(*) AS cnt FROM review_events WHERE substr(reviewed_at, 1, 10) = ?')
          .get(dayStr) as { cnt: number }
      )?.cnt ?? 0
    );

    const quizCnt = Number(
      (
        ctx.db
          .prepare(
            `SELECT COALESCE(SUM(total_questions), 0) AS cnt
             FROM quiz_attempts
             WHERE substr(completed_at, 1, 10) = ?`
          )
          .get(dayStr) as { cnt: number }
      )?.cnt ?? 0
    );

    sevenDayActivity.push({
      localDate: dayStr,
      reviewsCount: revCnt,
      quizQuestionsCount: quizCnt,
    });
  }

  const bookRows = ctx.db
    .prepare(
      `SELECT b.id, b.title, b.last_page, b.page_count,
         (SELECT COUNT(*) FROM highlights h WHERE h.book_id = b.id) AS highlight_count,
         (SELECT COUNT(DISTINCT sc.id)
            FROM study_cards sc
            JOIN occurrences o ON o.id = sc.representative_occurrence_id
            JOIN highlights h ON h.id = o.highlight_id
           WHERE h.book_id = b.id AND sc.enabled = 1 AND sc.is_mastered = 0) AS studying_count,
         (SELECT COUNT(DISTINCT sc.id)
            FROM study_cards sc
            JOIN occurrences o ON o.id = sc.representative_occurrence_id
            JOIN highlights h ON h.id = o.highlight_id
           WHERE h.book_id = b.id AND sc.enabled = 1 AND sc.is_mastered = 1) AS mastered_count,
         (SELECT COUNT(DISTINCT sc.id)
            FROM study_cards sc
            JOIN occurrences o ON o.id = sc.representative_occurrence_id
            JOIN highlights h ON h.id = o.highlight_id
           WHERE h.book_id = b.id AND sc.enabled = 1 AND sc.due_at <= ?) AS due_count
       FROM books b
       ORDER BY COALESCE(b.last_opened_at, b.added_at) DESC`
    )
    .all(nowIso) as Array<Record<string, unknown>>;

  const bookBreakdown: BookProgressItem[] = bookRows.map((b) => {
    const lastPage = Number(b.last_page ?? 1);
    const pageCount = Math.max(1, Number(b.page_count ?? 1));
    const progressPercent = Math.min(100, Math.round((lastPage / pageCount) * 100));
    return {
      bookId: String(b.id),
      title: String(b.title),
      lastPage,
      pageCount,
      progressPercent,
      highlightCount: Number(b.highlight_count ?? 0),
      studyingCardCount: Number(b.studying_count ?? 0),
      masteredCardCount: Number(b.mastered_count ?? 0),
      dueCardCount: Number(b.due_count ?? 0),
    };
  });

  return ok({
    uniqueLexemesCount,
    totalHighlightsCount,
    savedOnlyCount,
    studyingCardCount,
    masteredCardCount,
    dueTodayCount,
    reviewedTodayCount,
    quizTotalQuestions,
    quizCorrectQuestions,
    quizAccuracyPercent,
    sevenDayActivity,
    bookBreakdown,
    masteredRuleDescriptionVi: MASTERED_RULE_DESCRIPTION_VI,
  });
}

export function createStudyAndQuizService(ctx: LexiBookDbContext) {
  return {
    getStudyQueue: (filter?: StudyQueueFilter) => getStudyQueue(ctx, filter),
    submitReview: (input: SubmitReviewInput) => submitReview(ctx, input),
    generateQuiz: (input: GenerateQuizInput) => generateQuiz(ctx, input),
    submitQuizAttempt: (input: SubmitQuizAttemptInput) => submitQuizAttempt(ctx, input),
    getProgressMetrics: (localDate?: string) => getProgressMetrics(ctx, localDate),
  };
}
