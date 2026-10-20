import React, { useCallback, useEffect, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  ExternalLink,
  GraduationCap,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import { lexiBookClient } from '../../shared/api/client';
import type {
  Book,
  QuizQuestion,
  QuizQuestionType,
  ReviewGrade,
  StudyQueueResult,
} from '../../shared/types/contracts';
import { Badge, Button, EmptyState, ErrorBanner } from '../../shared/ui/components';

export interface StudyScreenProps {
  initialBookIdFilter?: string | null;
  onJumpToOccurrence?: (bookId: string, pageNumber1Based: number, highlightId: string) => void;
}

export const StudyScreen: React.FC<StudyScreenProps> = ({
  initialBookIdFilter,
  onJumpToOccurrence,
}) => {
  const [mode, setMode] = useState<'flashcard' | 'quiz'>('flashcard');
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBookId, setSelectedBookId] = useState<string>(initialBookIdFilter ?? 'all');

  // Flashcard state
  const [queueData, setQueueData] = useState<StudyQueueResult | null>(null);
  const [cardIndex, setCardIndex] = useState<number>(0);
  const [revealed, setRevealed] = useState<boolean>(false);
  const [showHint, setShowHint] = useState<boolean>(false);
  const [cardStartMs, setCardStartMs] = useState<number>(() => Date.now());
  const [turnRequestId, setTurnRequestId] = useState<string>(() => `req_${Date.now()}_0`);
  const [submittingReview, setSubmittingReview] = useState<boolean>(false);
  const [sessionCompletedCount, setSessionCompletedCount] = useState<number>(0);

  // Quiz state
  const [quizSize, setQuizSize] = useState<5 | 10 | 20>(5);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizIndex, setQuizIndex] = useState<number>(0);
  const [selectedOption, setSelectedOption] = useState<string>('');
  const [clozeInput, setClozeInput] = useState<string>('');
  const [questionChecked, setQuestionChecked] = useState<boolean>(false);
  const [quizAnswers, setQuizAnswers] = useState<
    Array<{
      questionId: string;
      studyCardId: string;
      questionType: QuizQuestionType;
      targetTerm: string;
      userAnswer: string;
      correctAnswer: string;
      isCorrect: boolean;
    }>
  >([]);
  const [quizFinished, setQuizFinished] = useState<boolean>(false);
  const [quizError, setQuizError] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadStudyQueue = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [booksRes, queueRes] = await Promise.all([
        lexiBookClient.listBooks(),
        lexiBookClient.getStudyQueue({
          bookId: selectedBookId !== 'all' ? selectedBookId : undefined,
        }),
      ]);

      if (booksRes.ok) {
        setBooks(booksRes.data);
      }
      if (!queueRes.ok) {
        setErrorMsg(queueRes.error.messageVi);
      } else {
        setQueueData(queueRes.data);
        setCardIndex(0);
        setRevealed(false);
        setShowHint(false);
        setCardStartMs(Date.now());
        setTurnRequestId(`req_${Date.now()}_0`);
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Không thể tải hàng đợi ôn tập.');
    } finally {
      setLoading(false);
    }
  }, [selectedBookId]);

  useEffect(() => {
    void loadStudyQueue();
  }, [loadStudyQueue]);

  const currentCard =
    queueData && cardIndex < queueData.sessionQueue.length
      ? queueData.sessionQueue[cardIndex]
      : null;

  const handleGradeCard = useCallback(
    async (grade: ReviewGrade) => {
      if (!currentCard || submittingReview) return;
      setSubmittingReview(true);
      try {
        const elapsedMs = Math.max(100, Date.now() - cardStartMs);
        const res = await lexiBookClient.submitReview({
          studyCardId: currentCard.card.id,
          grade,
          responseMs: elapsedMs,
          clientReviewRequestId: turnRequestId,
        });

        if (!res.ok) {
          setErrorMsg(res.error.messageVi);
          return;
        }

        const refreshed = await lexiBookClient.getStudyQueue({
          bookId: selectedBookId !== 'all' ? selectedBookId : undefined,
        });
        if (refreshed.ok) {
          setQueueData(refreshed.data);
          setCardIndex(0);
          setRevealed(false);
          setShowHint(false);
          setCardStartMs(Date.now());
          setTurnRequestId(`req_${Date.now()}_${sessionCompletedCount + 1}`);
        }
        setSessionCompletedCount((c) => c + 1);
      } finally {
        setSubmittingReview(false);
      }
    },
    [
      currentCard,
      submittingReview,
      cardStartMs,
      turnRequestId,
      sessionCompletedCount,
      selectedBookId,
    ]
  );

  useEffect(() => {
    if (mode !== 'flashcard' || !currentCard) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed) {
        if (e.key === '1') void handleGradeCard('again');
        if (e.key === '2') void handleGradeCard('hard');
        if (e.key === '3') void handleGradeCard('good');
        if (e.key === '4') void handleGradeCard('easy');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, currentCard, revealed, handleGradeCard]);

  const handleStartQuiz = async () => {
    setQuizError(null);
    setQuizFinished(false);
    setQuizAnswers([]);
    setQuizIndex(0);
    setSelectedOption('');
    setClozeInput('');
    setQuestionChecked(false);

    const res = await lexiBookClient.generateQuiz({
      bookId: selectedBookId !== 'all' ? selectedBookId : undefined,
      sessionSize: quizSize,
    });

    if (!res.ok) {
      setQuizError(res.error.messageVi);
      setQuizQuestions([]);
      return;
    }

    setQuizQuestions(res.data.questions);
  };

  const currentQuizQuestion =
    quizQuestions.length > 0 && quizIndex < quizQuestions.length
      ? quizQuestions[quizIndex]
      : null;

  const handleCheckQuizQuestion = () => {
    if (!currentQuizQuestion || questionChecked) return;
    const rawUserAnswer =
      currentQuizQuestion.questionType === 'mcq_meaning'
        ? selectedOption.trim()
        : clozeInput.trim();
    if (!rawUserAnswer) return;

    const isCorrect =
      rawUserAnswer.toLowerCase() === currentQuizQuestion.correctAnswer.trim().toLowerCase();

    setQuizAnswers((prev) => [
      ...prev,
      {
        questionId: currentQuizQuestion.questionId,
        studyCardId: currentQuizQuestion.studyCardId,
        questionType: currentQuizQuestion.questionType,
        targetTerm: currentQuizQuestion.targetTerm,
        userAnswer: rawUserAnswer,
        correctAnswer: currentQuizQuestion.correctAnswer,
        isCorrect,
      },
    ]);
    setQuestionChecked(true);
  };

  const handleNextQuizQuestion = async () => {
    const nextIdx = quizIndex + 1;
    if (nextIdx < quizQuestions.length) {
      setQuizIndex(nextIdx);
      setSelectedOption('');
      setClozeInput('');
      setQuestionChecked(false);
      return;
    }

    // Finish quiz and persist attempt (does NOT touch FSRS review_events!)
    setQuizFinished(true);
    const correctCount = quizAnswers.filter((a) => a.isCorrect).length;
    await lexiBookClient.submitQuizAttempt({
      clientAttemptId: `quiz_attempt_${Date.now()}`,
      bookId: selectedBookId !== 'all' ? selectedBookId : null,
      totalQuestions: quizAnswers.length,
      correctCount,
      answers: quizAnswers.map((a) => ({
        questionId: a.questionId,
        studyCardId: a.studyCardId,
        questionType: a.questionType,
        userAnswer: a.userAnswer,
        isCorrect: a.isCorrect,
      })),
    });
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-[#52525B]" role="status">
        Đang tải phiên ôn tập FSRS...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Top Overview & Mode Bar */}
      <div className="bg-white border border-[#E4E1DA] rounded-2xl p-5 shadow-2xs flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#EEF2FF] text-[#3F51B5] flex items-center justify-center">
              <GraduationCap className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-bold text-[#18181B]">Ôn tập Từ vựng Ngữ cảnh (FSRS)</h2>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-[#52525B]">
            <span data-testid="study-due-count">
              Cần ôn hôm nay:{' '}
              <strong className="text-[#3F51B5] font-semibold">
                {queueData?.totalDueCount ?? 0}
              </strong>
            </span>
            <span>•</span>
            <span data-testid="study-new-count">
              Thẻ mới khả dụng:{' '}
              <strong className="text-[#92400E] font-semibold">
                {queueData?.totalNewAvailableCount ?? 0}
              </strong>
            </span>
            <span>•</span>
            <span data-testid="study-reviewed-today">
              Đã ôn hôm nay:{' '}
              <strong className="text-[#15803D] font-semibold">
                {queueData?.reviewedTodayCount ?? 0}
              </strong>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={selectedBookId}
            onChange={(e) => setSelectedBookId(e.target.value)}
            aria-label="Lọc theo sách"
            data-testid="study-book-filter"
            className="px-3 py-1.5 text-xs border border-[#E4E1DA] rounded-xl bg-[#FAF9F6] text-[#18181B] font-medium"
          >
            <option value="all">Tất cả sách</option>
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>

          <div className="inline-flex bg-[#F3F1EC] p-1 rounded-xl border border-[#E4E1DA]/70">
            <button
              type="button"
              onClick={() => setMode('flashcard')}
              data-testid="mode-flashcard-btn"
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                mode === 'flashcard'
                  ? 'bg-white text-[#3F51B5] font-semibold shadow-2xs'
                  : 'text-[#52525B] hover:text-[#18181B]'
              }`}
            >
              Thẻ ghi nhớ (Flashcard)
            </button>
            <button
              type="button"
              onClick={() => setMode('quiz')}
              data-testid="mode-quiz-btn"
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                mode === 'quiz'
                  ? 'bg-white text-[#3F51B5] font-semibold shadow-2xs'
                  : 'text-[#52525B] hover:text-[#18181B]'
              }`}
            >
              Trắc nghiệm &amp; Điền từ (Quiz)
            </button>
          </div>
        </div>
      </div>

      {errorMsg && <ErrorBanner messageVi={errorMsg} onRetry={() => void loadStudyQueue()} />}

      {/* Flashcard Mode */}
      {mode === 'flashcard' && (
        <div>
          {!currentCard ? (
            <EmptyState
              icon={<CheckCircle2 className="w-6 h-6" />}
              title="Bạn đã hoàn thành toàn bộ thẻ cần ôn hôm nay!"
              description="Các từ vựng ở trạng thái Đã lưu (Saved) sẽ không tự động đưa vào hàng đợi trừ khi bạn chọn [Đưa vào Ôn tập] trong lúc đọc sách hoặc trong mục Từ vựng."
            />
          ) : (
            <div
              data-testid="flashcard-container"
              className="bg-white border border-[#E4E1DA] rounded-2xl p-7 shadow-sm space-y-6"
            >
              <div className="flex items-center justify-between text-xs text-[#52525B]">
                <div className="flex items-center gap-2">
                  <Badge variant="indigo">
                    <BookOpen className="w-3 h-3" />
                    {currentCard.bookTitle}
                  </Badge>
                  <span>Trang {currentCard.highlight.pageNumber1Based}</span>
                </div>
                <span className="font-medium text-[#18181B]">
                  Thẻ {cardIndex + 1} / {queueData?.sessionQueue.length ?? 1}
                </span>
              </div>

              {/* Front of Card: Contextual Sentence with Masked Target */}
              <div className="p-6 bg-[#FAF9F6] border border-[#E4E1DA] rounded-2xl space-y-3">
                <p className="text-[11px] font-semibold text-[#71717A] uppercase tracking-wider">
                  Ngữ cảnh câu gốc trong sách
                </p>
                <p
                  data-testid="flashcard-masked-sentence"
                  className="text-xl font-serif text-[#18181B] leading-relaxed"
                >
                  “{revealed ? currentCard.highlight.sentenceText : currentCard.maskedSentence}”
                </p>

                {!revealed && (
                  <div className="pt-2 flex flex-wrap items-center gap-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<HelpCircle className="w-3.5 h-3.5" />}
                      onClick={() => setShowHint((h) => !h)}
                      data-testid="toggle-hint-btn"
                    >
                      {showHint ? 'Ẩn gợi ý' : 'Xem gợi ý nghĩa'}
                    </Button>
                    {showHint && (
                      <span className="text-xs text-[#92400E] bg-[#FEF3C7] px-3 py-1 rounded-lg border border-[#F59E0B]/40 font-medium">
                        Gợi ý:{' '}
                        {currentCard.sense.generalMeaningsVi[0] ||
                          currentCard.sense.contextualMeaningVi}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {!revealed ? (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={() => setRevealed(true)}
                    data-testid="reveal-card-btn"
                  >
                    Hiện đáp án (Phím cách / Enter)
                  </Button>
                </div>
              ) : (
                <div
                  className="space-y-5 pt-4 border-t border-[#E4E1DA]"
                  data-testid="flashcard-back"
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h3
                          className="text-2xl font-bold text-[#18181B]"
                          data-testid="flashcard-target-word"
                        >
                          {currentCard.lexeme.canonicalForm}
                        </h3>
                        {currentCard.sense.ipa && (
                          <span className="text-sm font-mono text-[#3F51B5] bg-[#EEF2FF] px-2.5 py-0.5 rounded-lg">
                            {currentCard.sense.ipa}
                          </span>
                        )}
                        {currentCard.lexeme.partOfSpeech && (
                          <Badge variant="indigo">{currentCard.lexeme.partOfSpeech}</Badge>
                        )}
                      </div>

                      {onJumpToOccurrence && (
                        <Button
                          variant="secondary"
                          size="sm"
                          leftIcon={<ExternalLink className="w-3.5 h-3.5" />}
                          onClick={() =>
                            onJumpToOccurrence(
                              currentCard.highlight.bookId,
                              currentCard.highlight.pageNumber1Based,
                              currentCard.highlight.id
                            )
                          }
                        >
                          Mở trang gốc PDF
                        </Button>
                      )}
                    </div>

                    <div className="p-4 bg-[#FEF3C7]/45 border border-[#F59E0B]/35 rounded-2xl space-y-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#92400E]">
                        Nghĩa trong ngữ cảnh sách
                      </p>
                      <p className="text-base font-bold text-[#18181B]">
                        {currentCard.sense.contextualMeaningVi}
                      </p>
                      <p className="text-sm text-[#52525B] leading-relaxed">
                        {currentCard.sense.contextualExplanationVi}
                      </p>
                    </div>

                    {currentCard.sense.generalMeaningsVi.length > 0 && (
                      <p className="text-xs text-[#52525B]">
                        <strong className="text-[#18181B]">Nghĩa thông dụng:</strong>{' '}
                        {currentCard.sense.generalMeaningsVi.join('; ')}
                      </p>
                    )}
                  </div>

                  {/* 4 FSRS Rating Buttons */}
                  <div className="space-y-2.5 pt-2">
                    <p className="text-xs text-center text-[#52525B]">
                      Đánh giá mức độ nhớ của bạn để thuật toán FSRS lên lịch ôn tập tiếp theo (Phím
                      tắt 1–4):
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <Button
                        variant="danger"
                        disabled={submittingReview}
                        onClick={() => void handleGradeCard('again')}
                        data-testid="grade-again-btn"
                      >
                        1. Quên (Again)
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={submittingReview}
                        onClick={() => void handleGradeCard('hard')}
                        data-testid="grade-hard-btn"
                      >
                        2. Khó (Hard)
                      </Button>
                      <Button
                        variant="primary"
                        disabled={submittingReview}
                        onClick={() => void handleGradeCard('good')}
                        data-testid="grade-good-btn"
                      >
                        3. Tốt (Good)
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={submittingReview}
                        onClick={() => void handleGradeCard('easy')}
                        data-testid="grade-easy-btn"
                      >
                        4. Dễ (Easy)
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Quiz Mode */}
      {mode === 'quiz' && (
        <div className="bg-white border border-[#E4E1DA] rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4E1DA] pb-4">
            <div>
              <h3 className="text-base font-bold text-[#18181B]">
                Kiểm tra Ngữ cảnh &amp; Điền từ (Contextual Quiz)
              </h3>
              <p className="text-xs text-[#52525B] mt-0.5">
                Lưu ý: Kết quả bài kiểm tra được ghi nhận độc lập và không làm sai lệch lịch trình
                FSRS của thẻ ghi nhớ.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={quizSize}
                onChange={(e) => setQuizSize(Number(e.target.value) as 5 | 10 | 20)}
                aria-label="Số câu hỏi kiểm tra"
                className="px-3 py-1.5 text-xs border border-[#E4E1DA] rounded-xl bg-[#FAF9F6] text-[#18181B]"
              >
                <option value={5}>5 câu hỏi</option>
                <option value={10}>10 câu hỏi</option>
                <option value={20}>20 câu hỏi</option>
              </select>
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Sparkles className="w-3.5 h-3.5" />}
                onClick={() => void handleStartQuiz()}
                data-testid="start-quiz-btn"
              >
                Bắt đầu bài kiểm tra
              </Button>
            </div>
          </div>

          {quizError && <ErrorBanner messageVi={quizError} />}

          {quizFinished ? (
            <div data-testid="quiz-summary" className="space-y-4">
              <div className="p-5 bg-[#DCFCE7]/50 border border-[#22C55E]/35 rounded-2xl flex items-center justify-between">
                <div>
                  <h4 className="text-base font-bold text-[#166534]">
                    Hoàn thành bài kiểm tra!
                  </h4>
                  <p className="text-xs text-[#15803D] mt-0.5">
                    Số câu đúng: {quizAnswers.filter((a) => a.isCorrect).length} /{' '}
                    {quizAnswers.length} (
                    {quizAnswers.length > 0
                      ? Math.round(
                          (quizAnswers.filter((a) => a.isCorrect).length / quizAnswers.length) * 100
                        )
                      : 0}
                    %)
                  </p>
                </div>
                <Button variant="primary" size="sm" onClick={() => void handleStartQuiz()}>
                  Làm đề mới
                </Button>
              </div>
            </div>
          ) : currentQuizQuestion ? (
            <div data-testid="quiz-question-card" className="space-y-4">
              <div className="flex items-center justify-between text-xs text-[#52525B]">
                <span>
                  Câu {quizIndex + 1} / {quizQuestions.length} • {currentQuizQuestion.bookTitle}{' '}
                  (Tr. {currentQuizQuestion.pageNumber1Based})
                </span>
                <Badge variant="amber">
                  {currentQuizQuestion.questionType === 'mcq_meaning'
                    ? 'Trắc nghiệm nghĩa ngữ cảnh'
                    : 'Điền từ vào câu gốc (Cloze)'}
                </Badge>
              </div>

              {currentQuizQuestion.questionType === 'mcq_meaning' ? (
                <div className="space-y-3.5">
                  <p className="text-sm text-[#18181B]">
                    Chọn nghĩa tiếng Việt phù hợp nhất cho cụm từ{' '}
                    <strong className="text-[#3F51B5]">“{currentQuizQuestion.targetTerm}”</strong>{' '}
                    trong câu sau:
                  </p>
                  <blockquote className="p-4 bg-[#FAF9F6] rounded-xl border-l-4 border-[#3F51B5] font-serif text-[#18181B]">
                    “{currentQuizQuestion.promptEn}”
                  </blockquote>
                  <div className="grid grid-cols-1 gap-2.5">
                    {currentQuizQuestion.optionsVi?.map((opt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        disabled={questionChecked}
                        data-testid={`quiz-option-${idx}`}
                        onClick={() => setSelectedOption(opt)}
                        className={`text-left p-3.5 rounded-xl border text-sm transition-all cursor-pointer ${
                          selectedOption === opt
                            ? 'border-[#3F51B5] bg-[#EEF2FF] text-[#18181B] font-semibold shadow-2xs'
                            : 'border-[#E4E1DA] hover:bg-[#FAF9F6] text-[#18181B]'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3.5">
                  <p className="text-sm text-[#18181B]">
                    Điền từ hoặc cụm từ tiếng Anh còn thiếu vào chỗ trống trong câu gốc:
                  </p>
                  <blockquote
                    data-testid="quiz-cloze-prompt"
                    className="p-4 bg-[#FAF9F6] rounded-xl border-l-4 border-[#F59E0B] font-serif text-[#18181B]"
                  >
                    “{currentQuizQuestion.maskedSentenceEn}”
                  </blockquote>
                  <input
                    type="text"
                    disabled={questionChecked}
                    value={clozeInput}
                    onChange={(e) => setClozeInput(e.target.value)}
                    placeholder="Nhập từ/cụm từ tiếng Anh..."
                    data-testid="quiz-cloze-input"
                    className="w-full px-3.5 py-2.5 text-sm border border-[#D6D2C8] rounded-xl"
                  />
                </div>
              )}

              {!questionChecked ? (
                <div className="flex justify-end">
                  <Button
                    variant="primary"
                    onClick={handleCheckQuizQuestion}
                    data-testid="check-quiz-answer-btn"
                  >
                    Kiểm tra đáp án
                  </Button>
                </div>
              ) : (
                <div
                  className="p-4 bg-[#FAF9F6] border border-[#E4E1DA] rounded-2xl space-y-2"
                  data-testid="quiz-feedback-panel"
                >
                  <p className="text-sm font-bold text-[#18181B]">
                    Đáp án đúng: {currentQuizQuestion.correctAnswer}
                  </p>
                  <p className="text-xs text-[#52525B] leading-relaxed">
                    {currentQuizQuestion.explanationVi}
                  </p>
                  <div className="flex justify-end pt-1">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => void handleNextQuizQuestion()}
                      data-testid="next-quiz-question-btn"
                    >
                      {quizIndex + 1 < quizQuestions.length
                        ? 'Câu tiếp theo'
                        : 'Hoàn thành bài kiểm tra'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-[#52525B] text-center py-8">
              Nhấn <strong className="text-[#18181B]">[Bắt đầu bài kiểm tra]</strong> để tạo bộ câu
              hỏi từ các thẻ đang học của bạn.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
