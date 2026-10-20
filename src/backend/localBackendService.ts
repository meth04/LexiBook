import path from 'node:path';
import { exportBackup, importBackup } from './backupService';
import {
  type CredentialVault,
  createInMemoryCredentialVault,
  createLocalEncryptedCredentialVault,
} from './credentialStore';
import { type LexiBookDbContext, openLexiBookDatabase } from './db';
import {
  createGeminiService,
  createMockGeminiTransport,
  createSmartGeminiTransport,
  type GeminiTransport,
} from './geminiService';
import {
  dismissReminderToday,
  evaluateReminder,
  getReminderConfig,
  snoozeReminder,
  updateReminderConfig,
} from './reminderService';
import { createRepositories, ok } from './repositories';
import { createStudyAndQuizService } from './studyAndQuizService';
import type { LexiBookApi } from '../shared/types/contracts';

export interface CreateLocalBackendOptions {
  vault?: CredentialVault;
  useDiskCredentialVault?: boolean;
  geminiTransport?: GeminiTransport;
  initialApiKey?: string | null;
}

export interface LocalLexiBookBackend extends LexiBookApi {
  readonly ctx: LexiBookDbContext;
  readonly vault: CredentialVault;
  readonly setGeminiTransport: (transport: GeminiTransport) => void;
  readonly setGeminiVersions: (promptVersion: string, schemaVersion?: string) => void;
  readonly close: () => void;
}

/**
 * Creates a complete local-first `LexiBookApi` backend instance backed by real SQLite (`lexibook.db`)
 * and managed PDF file storage in `appDataDir`.
 */
export function createLocalLexiBookBackend(
  appDataDir: string,
  options?: CreateLocalBackendOptions
): LocalLexiBookBackend {
  const ctx = openLexiBookDatabase(appDataDir);
  const repos = createRepositories(ctx);

  const vault =
    options?.vault ??
    (options?.useDiskCredentialVault
      ? createLocalEncryptedCredentialVault(path.join(appDataDir, '.credentials'))
      : createInMemoryCredentialVault(options?.initialApiKey ?? 'AIzaSyLocalMockKeyForDevAndTest123456'));

  const defaultTransport = options?.useDiskCredentialVault
    ? createSmartGeminiTransport()
    : createMockGeminiTransport();

  const gemini = createGeminiService(ctx, {
    vault,
    transport: options?.geminiTransport ?? defaultTransport,
  });

  const study = createStudyAndQuizService(ctx);

  return {
    ctx,
    vault,
    setGeminiTransport: gemini.setTransport,
    setGeminiVersions: gemini.setVersions,
    close: () => ctx.close(),

    // Books & Reader
    async importPdf(input) {
      return repos.importPdf(input);
    },
    async listBooks(filter) {
      return repos.listBooks(filter);
    },
    async getBook(bookId) {
      return repos.getBook(bookId);
    },
    async getBookPdfBytes(bookId) {
      return repos.getBookPdfBytes(bookId);
    },
    async updateBook(input) {
      return repos.updateBook(input);
    },
    async removeBook(input) {
      return repos.removeBook(input);
    },
    async saveReadingPosition(input) {
      return repos.saveReadingPosition(input);
    },

    // Highlights
    async createHighlight(input) {
      return repos.createHighlight(input);
    },
    async listHighlights(bookId, pageNumber1Based) {
      return repos.listHighlights(bookId, pageNumber1Based);
    },
    async removeHighlight(highlightId) {
      return repos.removeHighlight(highlightId);
    },

    // Gemini AI & Credentials
    async analyzeOccurrence(input) {
      const res = await gemini.analyzeOccurrence(input);
      if (res.ok) {
        const settings = repos.getAppSettings();
        if (settings.ok && settings.data.autoAddToStudy) {
          repos.setStudyOptIn({
            senseId: res.data.id,
            representativeOccurrenceId: input.occurrenceId,
            enabled: true,
          });
        }
      }
      return res;
    },
    async cancelAnalysis(occurrenceId) {
      return gemini.cancelAnalysis(occurrenceId);
    },
    async getAiKeyStatus() {
      return gemini.getAiKeyStatus();
    },
    async setAiKey(apiKey, modelId) {
      return gemini.setAiKey(apiKey, modelId);
    },
    async testAiConnection() {
      return gemini.testAiConnection();
    },
    async deleteAiKey() {
      return gemini.deleteAiKey();
    },
    async clearAiCache() {
      return gemini.clearAiCache();
    },

    // Vocabulary
    async listVocabulary(filter) {
      return repos.listVocabulary(filter);
    },
    async getVocabularyDetail(lexemeId) {
      return repos.getVocabularyDetail(lexemeId);
    },
    async editSense(input) {
      return repos.editSense(input);
    },
    async setStudyOptIn(input) {
      return repos.setStudyOptIn(input);
    },
    async deleteVocabulary(input) {
      return repos.deleteVocabulary(input);
    },

    // Study & Quiz
    async getStudyQueue(filter) {
      return study.getStudyQueue(filter);
    },
    async submitReview(input) {
      return study.submitReview(input);
    },
    async generateQuiz(input) {
      return study.generateQuiz(input);
    },
    async submitQuizAttempt(input) {
      return study.submitQuizAttempt(input);
    },

    // Reminders & Settings
    async getReminderConfig() {
      return ok(getReminderConfig(ctx));
    },
    async updateReminderConfig(config) {
      return ok(updateReminderConfig(ctx, config));
    },
    async evaluateReminder(input) {
      return ok(evaluateReminder(ctx, input));
    },
    async snoozeReminder(minutes, nowIso) {
      return ok(snoozeReminder(ctx, minutes, nowIso));
    },
    async dismissReminderToday(localDate) {
      return ok(dismissReminderToday(ctx, localDate));
    },
    async getAppSettings() {
      return repos.getAppSettings();
    },
    async updateAppSettings(settings) {
      return repos.updateAppSettings(settings);
    },

    // Progress
    async getProgressMetrics(localDate) {
      return study.getProgressMetrics(localDate);
    },

    // Backup & Restore
    async exportBackup(input) {
      return exportBackup(ctx, input);
    },
    async importBackup(input) {
      return importBackup(ctx, input);
    },
  };
}
