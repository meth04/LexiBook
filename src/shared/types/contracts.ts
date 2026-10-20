/**
 * Canonical shared domain contracts and IPC types for LexiBook AI v1.
 * Owned by: Orchestrator (see docs/CONTRACTS.md, ADR-001, ADR-005).
 *
 * Security rule: No API keys, credential handles, or raw filesystem paths outside managed relative keys
 * may ever cross this boundary into the renderer.
 */

export type AppRoute = 'library' | 'reader' | 'vocabulary' | 'study' | 'progress' | 'settings';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'DUPLICATE_BOOK_HASH'
  | 'INVALID_PDF_HEADER'
  | 'PDF_ENCRYPTED'
  | 'PDF_SCAN_ONLY'
  | 'PDF_OVERSIZED'
  | 'PATH_TRAVERSAL_BLOCKED'
  | 'DB_ERROR'
  | 'AI_KEY_MISSING'
  | 'AI_AUTH_ERROR'
  | 'AI_QUOTA_EXCEEDED'
  | 'AI_TIMEOUT'
  | 'AI_OFFLINE'
  | 'AI_SCHEMA_INVALID'
  | 'AI_SERVER_ERROR'
  | 'AI_CANCELLED'
  | 'QUIZ_INSUFFICIENT_CARDS'
  | 'BACKUP_INVALID_ARCHIVE'
  | 'BACKUP_HASH_MISMATCH'
  | 'BACKUP_PATH_UNSAFE'
  | 'BACKUP_CORRUPT_DB'
  | 'INTERNAL_ERROR';

export interface AppError {
  code: ErrorCode;
  messageVi: string;
  details?: string;
  retryable: boolean;
}

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: AppError };

// ---------------------------------------------------------------------------
// 1. Book & Library Domain
// ---------------------------------------------------------------------------

export type BookStatus = 'reading' | 'finished';

export interface Book {
  id: string;
  sha256: string;
  title: string;
  /** Application-internal relative managed path (e.g. "books/<sha256>.pdf"); never an arbitrary host absolute path */
  managedPath: string;
  pageCount: number;
  lastPage: number;
  lastScrollOffset: number;
  status: BookStatus;
  isScanOnly: boolean;
  addedAt: string;
  lastOpenedAt: string | null;
  highlightCount?: number;
  uniqueTermCount?: number;
  dueCardCount?: number;
}

export type DuplicateImportResolution = 'prompt' | 'open_existing' | 'import_copy';

export interface ImportPdfInput {
  fileName: string;
  /** Base64 or Uint8Array payload when imported via picker/drop, or fixture identifier in tests */
  bytesBase64: string;
  duplicateResolution?: DuplicateImportResolution;
}

export interface ImportPdfResult {
  status: 'imported' | 'duplicate_detected' | 'opened_existing';
  book: Book;
  existingBook?: Book;
}

export interface ListBooksFilter {
  search?: string;
  status?: 'all' | BookStatus;
}

export interface UpdateBookInput {
  bookId: string;
  title?: string;
  status?: BookStatus;
}

export interface RemoveBookInput {
  bookId: string;
  deleteManagedFile: boolean;
  deleteRetainedVocabulary: boolean;
}

export interface SavePositionInput {
  bookId: string;
  pageNumber1Based: number;
  scrollOffsetNormalized: number;
}

// ---------------------------------------------------------------------------
// 2. PDF Highlight & Anchor Domain
// ---------------------------------------------------------------------------

/** Normalized rectangle in PDF page space [0..1] relative to unscaled page width/height at canonical rotation */
export interface NormalizedQuad {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextAnchor {
  algorithmVersion: 1;
  exact: string;
  prefix: string;
  suffix: string;
  startOffset: number;
  endOffset: number;
  pdfFingerprint: string;
  pageRotation: number;
  anchorUncertain?: boolean;
}

export interface Highlight {
  id: string;
  bookId: string;
  pageNumber1Based: number;
  selectedText: string;
  sentenceText: string;
  paragraphText: string;
  textAnchor: TextAnchor;
  normalizedQuads: NormalizedQuad[];
  createdAt: string;
}

export interface CreateHighlightInput {
  bookId: string;
  pageNumber1Based: number;
  selectedText: string;
  sentenceText: string;
  paragraphText: string;
  textAnchor: TextAnchor;
  normalizedQuads: NormalizedQuad[];
  autoAnalyze?: boolean;
}

export interface CreateHighlightResult {
  highlight: Highlight;
  lexeme: Lexeme;
  occurrence: Occurrence;
  sense: Sense | null;
  deduplicated: boolean;
}

// ---------------------------------------------------------------------------
// 3. Lexeme, Occurrence & Contextual Sense Domain
// ---------------------------------------------------------------------------

export interface Lexeme {
  id: string;
  normalizedKey: string;
  canonicalForm: string;
  partOfSpeech: string | null;
  createdAt: string;
}

export type GenerationState =
  | 'idle'
  | 'queued'
  | 'loading'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface UserEditedFlags {
  generalMeaningsVi?: boolean;
  contextualMeaningVi?: boolean;
  contextualExplanationVi?: boolean;
  exampleEn?: boolean;
  exampleVi?: boolean;
}

export interface AiAnalysisMetadata {
  provider: 'gemini';
  modelId: string;
  promptVersion: string;
  schemaVersion: string;
  cacheKey: string;
  cachedHit: boolean;
  generatedAt: string;
  estimatedTokens: number;
  errorCode?: ErrorCode;
  errorMessageVi?: string;
}

export interface Sense {
  id: string;
  lexemeId: string;
  generalMeaningsVi: string[];
  contextualMeaningVi: string;
  contextualExplanationVi: string;
  contextualTranslationVi: string | null;
  ipa: string | null;
  collocation: string | null;
  exampleEn: string | null;
  exampleVi: string | null;
  sourceExcerpt: string;
  generationState: GenerationState;
  aiMetadata: AiAnalysisMetadata | null;
  userEditedFlags: UserEditedFlags;
  createdAt: string;
  updatedAt: string;
}

export interface Occurrence {
  id: string;
  lexemeId: string;
  highlightId: string;
  senseId: string | null;
  createdAt: string;
}

export interface OccurrenceWithContext {
  occurrence: Occurrence;
  highlight: Highlight;
  lexeme: Lexeme;
  sense: Sense | null;
  bookTitle: string;
  studyCard: StudyCard | null;
}

// ---------------------------------------------------------------------------
// 4. Gemini AI Provider & Structured Response
// ---------------------------------------------------------------------------

export interface GeminiStructuredResponse {
  lemma_or_phrase: string;
  part_of_speech: string;
  ipa: string | null;
  general_meanings_vi: string[];
  contextual_meaning_vi: string;
  contextual_explanation_vi: string;
  contextual_translation_vi?: string | null;
  usage_note?: string | null;
  example_en?: string | null;
  example_vi?: string | null;
}

export interface AnalyzeOccurrenceInput {
  occurrenceId: string;
  forceRefresh?: boolean;
  overrideSentenceText?: string;
}

export interface AiKeyStatus {
  hasKey: boolean;
  selectedModel: string;
  supportedModels: string[];
  lastTestedAt: string | null;
  lastTestSuccess: boolean | null;
  cacheEntryCount: number;
}

// ---------------------------------------------------------------------------
// 5. Vocabulary Management
// ---------------------------------------------------------------------------

export type VocabularyStudyStatus = 'saved' | 'studying' | 'mastered';

export interface VocabularyListItem {
  lexeme: Lexeme;
  primaryMeaningVi: string;
  occurrenceCount: number;
  senseCount: number;
  bookIds: string[];
  bookTitles: string[];
  lastEncounteredAt: string;
  studyStatus: VocabularyStudyStatus;
  nextDueAt: string | null;
  occurrences: OccurrenceWithContext[];
}

export interface ListVocabularyFilter {
  bookId?: string;
  pageNumber1Based?: number;
  studyStatus?: 'all' | VocabularyStudyStatus;
  search?: string;
  sortBy?: 'recent' | 'page' | 'name';
}

export interface EditSenseInput {
  senseId: string;
  canonicalForm?: string;
  partOfSpeech?: string | null;
  generalMeaningsVi?: string[];
  contextualMeaningVi?: string;
  contextualExplanationVi?: string;
  exampleEn?: string | null;
  exampleVi?: string | null;
  ipa?: string | null;
  collocation?: string | null;
}

export interface SetStudyOptInInput {
  senseId: string;
  representativeOccurrenceId: string;
  enabled: boolean;
}

export type DeleteVocabularyScope = 'occurrence_only' | 'lexeme_all' | 'study_card_only';

export interface DeleteVocabularyInput {
  scope: DeleteVocabularyScope;
  occurrenceId?: string;
  lexemeId?: string;
  studyCardId?: string;
}

// ---------------------------------------------------------------------------
// 6. Study, FSRS & Quiz Domain
// ---------------------------------------------------------------------------

export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy';

export interface FsrsPersistedState {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: number; // 0=New, 1=Learning, 2=Review, 3=Relearning
  last_review: string | null;
}

export interface StudyCard {
  id: string;
  senseId: string;
  representativeOccurrenceId: string;
  enabled: boolean;
  createdAt: string;
  dueAt: string;
  fsrsState: FsrsPersistedState;
  isMastered: boolean;
}

export interface StudyCardView {
  card: StudyCard;
  lexeme: Lexeme;
  sense: Sense;
  highlight: Highlight;
  bookTitle: string;
  maskedSentence: string;
}

export interface ReviewEvent {
  id: string;
  studyCardId: string;
  reviewedAt: string;
  mode: 'flashcard';
  grade: ReviewGrade;
  isCorrect: boolean;
  responseMs: number;
  clientReviewRequestId: string;
}

export interface StudyQueueFilter {
  bookId?: string;
  nowIso?: string;
  timezoneOffsetMinutes?: number;
}

export interface StudyQueueResult {
  dueCards: StudyCardView[];
  newCards: StudyCardView[];
  sessionQueue: StudyCardView[];
  totalDueCount: number;
  totalNewAvailableCount: number;
  reviewedTodayCount: number;
  newStudiedTodayCount: number;
  dailyNewLimit: number;
  dailyReviewLimit: number;
}

export interface SubmitReviewInput {
  studyCardId: string;
  grade: ReviewGrade;
  responseMs: number;
  clientReviewRequestId: string;
  nowIso?: string;
}

export interface SubmitReviewResult {
  card: StudyCard;
  reviewEvent: ReviewEvent;
  idempotentReplay: boolean;
}

export type QuizQuestionType = 'mcq_meaning' | 'cloze_sentence';

export interface QuizQuestion {
  questionId: string;
  studyCardId: string;
  senseId: string;
  lexemeId: string;
  questionType: QuizQuestionType;
  promptEn: string;
  maskedSentenceEn: string;
  targetTerm: string;
  optionsVi?: string[];
  correctAnswer: string;
  explanationVi: string;
  bookTitle: string;
  pageNumber1Based: number;
}

export interface GenerateQuizInput {
  bookId?: string;
  sessionSize: 5 | 10 | 20;
  questionTypes?: QuizQuestionType[];
  seed?: number;
}

export interface GenerateQuizResult {
  questions: QuizQuestion[];
  skippedCardsReasons: Array<{ studyCardId: string; reason: string }>;
}

export interface SubmitQuizAttemptInput {
  clientAttemptId: string;
  bookId?: string | null;
  totalQuestions: number;
  correctCount: number;
  answers: Array<{
    questionId: string;
    studyCardId: string;
    questionType: QuizQuestionType;
    userAnswer: string;
    isCorrect: boolean;
  }>;
  completedAtIso?: string;
}

export interface QuizAttemptRecord {
  id: string;
  clientAttemptId: string;
  bookId: string | null;
  totalQuestions: number;
  correctCount: number;
  completedAt: string;
}

// ---------------------------------------------------------------------------
// 7. Windows Reminders & App Settings
// ---------------------------------------------------------------------------

export interface ReminderConfig {
  enabled: boolean;
  localTime: string; // "HH:mm" e.g. "20:00"
  quietStart: string | null; // "22:00"
  quietEnd: string | null; // "07:00"
  autostartOptIn: boolean;
  lastNotifiedLocalDate: string | null; // "YYYY-MM-DD"
  snoozedUntilIso: string | null;
  permissionState: 'granted' | 'denied' | 'prompt';
}

export interface ReminderEvaluateInput {
  nowIso: string;
  localDate: string; // "YYYY-MM-DD"
  localTimeHHmm: string; // "HH:mm"
}

export interface ReminderEvaluationResult {
  shouldNotify: boolean;
  reason:
    | 'disabled'
    | 'permission_denied'
    | 'no_due_cards'
    | 'quiet_hours'
    | 'already_notified_today'
    | 'snoozed'
    | 'before_scheduled_time'
    | 'triggered';
  dueCount: number;
  notificationTitle?: string;
  notificationBody?: string;
}

export interface AppSettings {
  theme: 'light' | 'dark';
  defaultPdfScale: number;
  defaultSidebarOpen: boolean;
  autoAnalyzeOnHighlight: boolean;
  autoAddToStudy: boolean;
  dailyNewLimit: number;
  dailyReviewLimit: number;
  preferredQuizMode: 'mixed' | 'mcq_meaning' | 'cloze_sentence';
  showStreakOnProgress: boolean;
  onboardingCompleted: boolean;
}

// ---------------------------------------------------------------------------
// 8. Progress Dashboard
// ---------------------------------------------------------------------------

export interface DailyActivityPoint {
  localDate: string; // "YYYY-MM-DD"
  reviewsCount: number;
  quizQuestionsCount: number;
}

export interface BookProgressItem {
  bookId: string;
  title: string;
  lastPage: number;
  pageCount: number;
  progressPercent: number;
  highlightCount: number;
  studyingCardCount: number;
  masteredCardCount: number;
  dueCardCount: number;
}

export interface ProgressMetrics {
  uniqueLexemesCount: number;
  totalHighlightsCount: number;
  savedOnlyCount: number;
  studyingCardCount: number;
  masteredCardCount: number;
  dueTodayCount: number;
  reviewedTodayCount: number;
  quizTotalQuestions: number;
  quizCorrectQuestions: number;
  quizAccuracyPercent: number | null;
  sevenDayActivity: DailyActivityPoint[];
  bookBreakdown: BookProgressItem[];
  masteredRuleDescriptionVi: string;
}

// ---------------------------------------------------------------------------
// 9. Backup & Restore
// ---------------------------------------------------------------------------

export interface BackupFileEntry {
  relativePath: string;
  sha256: string;
  sizeBytes: number;
}

export interface BackupManifest {
  formatVersion: 1;
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  includePdfs: boolean;
  counts: {
    books: number;
    highlights: number;
    lexemes: number;
    occurrences: number;
    senses: number;
    studyCards: number;
    reviewEvents: number;
  };
  files: BackupFileEntry[];
}

export interface ExportBackupInput {
  includePdfs: boolean;
}

export interface ExportBackupResult {
  archiveFileName: string;
  archiveBytesBase64: string;
  manifest: BackupManifest;
}

export interface ImportBackupInput {
  archiveBytesBase64: string;
}

export interface ImportBackupResult {
  manifest: BackupManifest;
  restoredBooks: number;
  restoredHighlights: number;
  restoredStudyCards: number;
}

// ---------------------------------------------------------------------------
// 10. Unified Service Interface
// ---------------------------------------------------------------------------

export interface LexiBookApi {
  // Books & Reader
  importPdf(input: ImportPdfInput): Promise<Result<ImportPdfResult>>;
  listBooks(filter?: ListBooksFilter): Promise<Result<Book[]>>;
  getBook(bookId: string): Promise<Result<Book>>;
  getBookPdfBytes(bookId: string): Promise<Result<{ bytesBase64: string; sha256: string }>>;
  updateBook(input: UpdateBookInput): Promise<Result<Book>>;
  removeBook(input: RemoveBookInput): Promise<Result<{ removedBookId: string }>>;
  saveReadingPosition(input: SavePositionInput): Promise<Result<Book>>;

  // Highlights
  createHighlight(input: CreateHighlightInput): Promise<Result<CreateHighlightResult>>;
  listHighlights(bookId: string, pageNumber1Based?: number): Promise<Result<OccurrenceWithContext[]>>;
  removeHighlight(highlightId: string): Promise<Result<{ removedHighlightId: string }>>;

  // Gemini AI & Credentials
  analyzeOccurrence(input: AnalyzeOccurrenceInput): Promise<Result<Sense>>;
  cancelAnalysis(occurrenceId: string): Promise<Result<{ cancelled: boolean }>>;
  getAiKeyStatus(): Promise<Result<AiKeyStatus>>;
  setAiKey(apiKey: string, modelId?: string): Promise<Result<AiKeyStatus>>;
  testAiConnection(): Promise<Result<{ ok: boolean; modelId: string; messageVi: string }>>;
  deleteAiKey(): Promise<Result<AiKeyStatus>>;
  clearAiCache(): Promise<Result<{ clearedCount: number }>>;

  // Vocabulary
  listVocabulary(filter?: ListVocabularyFilter): Promise<Result<VocabularyListItem[]>>;
  getVocabularyDetail(lexemeId: string): Promise<Result<VocabularyListItem>>;
  editSense(input: EditSenseInput): Promise<Result<Sense>>;
  setStudyOptIn(input: SetStudyOptInInput): Promise<Result<StudyCard | null>>;
  deleteVocabulary(input: DeleteVocabularyInput): Promise<Result<{ deleted: boolean }>>;

  // Study & Quiz
  getStudyQueue(filter?: StudyQueueFilter): Promise<Result<StudyQueueResult>>;
  submitReview(input: SubmitReviewInput): Promise<Result<SubmitReviewResult>>;
  generateQuiz(input: GenerateQuizInput): Promise<Result<GenerateQuizResult>>;
  submitQuizAttempt(input: SubmitQuizAttemptInput): Promise<Result<QuizAttemptRecord>>;

  // Reminders & Settings
  getReminderConfig(): Promise<Result<ReminderConfig>>;
  updateReminderConfig(config: Partial<ReminderConfig>): Promise<Result<ReminderConfig>>;
  evaluateReminder(input: ReminderEvaluateInput): Promise<Result<ReminderEvaluationResult>>;
  snoozeReminder(minutes: number, nowIso?: string): Promise<Result<ReminderConfig>>;
  dismissReminderToday(localDate: string): Promise<Result<ReminderConfig>>;
  getAppSettings(): Promise<Result<AppSettings>>;
  updateAppSettings(settings: Partial<AppSettings>): Promise<Result<AppSettings>>;

  // Progress
  getProgressMetrics(localDate?: string): Promise<Result<ProgressMetrics>>;

  // Backup & Restore
  exportBackup(input: ExportBackupInput): Promise<Result<ExportBackupResult>>;
  importBackup(input: ImportBackupInput): Promise<Result<ImportBackupResult>>;
}
