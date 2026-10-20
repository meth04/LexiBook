import { invoke } from '@tauri-apps/api/core';
import type { LexiBookApi, Result } from '../types/contracts';

let activeBackendOverride: LexiBookApi | null = null;

/**
 * Registers an in-process or HTTP bridge backend implementation (used in Vitest integration tests
 * and local Node SQLite bridge when running outside compiled Tauri WebView).
 */
export function setLexiBookBackend(backend: LexiBookApi | null): void {
  activeBackendOverride = backend;
}

export function getRegisteredBackend(): LexiBookApi | null {
  return activeBackendOverride;
}

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function callCommand<T>(command: string, payload?: Record<string, unknown>): Promise<Result<T>> {
  if (isTauriRuntime()) {
    try {
      return await invoke<Result<T>>(command, payload);
    } catch (err) {
      return {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          messageVi: 'Lỗi giao tiếp IPC với nhân ứng dụng.',
          details: err instanceof Error ? err.message : String(err),
          retryable: true,
        },
      };
    }
  }

  // Fallback to local HTTP bridge exposed by Vite dev/preview server when running in browser E2E
  if (typeof window !== 'undefined' && typeof fetch === 'function') {
    try {
      const response = await fetch(`/__lexibook_ipc/${command}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload ?? {}),
      });
      if (response.ok) {
        return (await response.json()) as Result<T>;
      }
    } catch {
      // Fall through if bridge not active
    }
  }

  return {
    ok: false,
    error: {
      code: 'INTERNAL_ERROR',
      messageVi: 'Chưa kết nối với dịch vụ dữ liệu cục bộ.',
      retryable: true,
    },
  };
}

export const lexiBookClient: LexiBookApi = {
  async importPdf(input) {
    if (activeBackendOverride) return activeBackendOverride.importPdf(input);
    return callCommand('book_import_pdf', { input });
  },
  async listBooks(filter) {
    if (activeBackendOverride) return activeBackendOverride.listBooks(filter);
    return callCommand('book_list', { filter });
  },
  async getBook(bookId) {
    if (activeBackendOverride) return activeBackendOverride.getBook(bookId);
    return callCommand('book_get', { bookId });
  },
  async getBookPdfBytes(bookId) {
    if (activeBackendOverride) return activeBackendOverride.getBookPdfBytes(bookId);
    return callCommand('book_get_pdf_bytes', { bookId });
  },
  async updateBook(input) {
    if (activeBackendOverride) return activeBackendOverride.updateBook(input);
    return callCommand('book_update', { input });
  },
  async removeBook(input) {
    if (activeBackendOverride) return activeBackendOverride.removeBook(input);
    return callCommand('book_remove', { input });
  },
  async saveReadingPosition(input) {
    if (activeBackendOverride) return activeBackendOverride.saveReadingPosition(input);
    return callCommand('reader_save_position', { input });
  },
  async createHighlight(input) {
    if (activeBackendOverride) return activeBackendOverride.createHighlight(input);
    return callCommand('highlight_create', { input });
  },
  async listHighlights(bookId, pageNumber1Based) {
    if (activeBackendOverride) return activeBackendOverride.listHighlights(bookId, pageNumber1Based);
    return callCommand('highlight_list', { bookId, pageNumber1Based });
  },
  async removeHighlight(highlightId) {
    if (activeBackendOverride) return activeBackendOverride.removeHighlight(highlightId);
    return callCommand('highlight_remove', { highlightId });
  },
  async analyzeOccurrence(input) {
    if (activeBackendOverride) return activeBackendOverride.analyzeOccurrence(input);
    return callCommand('ai_analyze_occurrence', { input });
  },
  async cancelAnalysis(occurrenceId) {
    if (activeBackendOverride) return activeBackendOverride.cancelAnalysis(occurrenceId);
    return callCommand('ai_cancel_analysis', { occurrenceId });
  },
  async getAiKeyStatus() {
    if (activeBackendOverride) return activeBackendOverride.getAiKeyStatus();
    return callCommand('ai_get_key_status');
  },
  async setAiKey(apiKey, modelId) {
    if (activeBackendOverride) return activeBackendOverride.setAiKey(apiKey, modelId);
    return callCommand('ai_set_key', { apiKey, modelId });
  },
  async testAiConnection() {
    if (activeBackendOverride) return activeBackendOverride.testAiConnection();
    return callCommand('ai_test_connection');
  },
  async deleteAiKey() {
    if (activeBackendOverride) return activeBackendOverride.deleteAiKey();
    return callCommand('ai_delete_key');
  },
  async clearAiCache() {
    if (activeBackendOverride) return activeBackendOverride.clearAiCache();
    return callCommand('ai_clear_cache');
  },
  async listVocabulary(filter) {
    if (activeBackendOverride) return activeBackendOverride.listVocabulary(filter);
    return callCommand('vocabulary_list', { filter });
  },
  async getVocabularyDetail(lexemeId) {
    if (activeBackendOverride) return activeBackendOverride.getVocabularyDetail(lexemeId);
    return callCommand('vocabulary_get_detail', { lexemeId });
  },
  async editSense(input) {
    if (activeBackendOverride) return activeBackendOverride.editSense(input);
    return callCommand('vocabulary_edit_sense', { input });
  },
  async setStudyOptIn(input) {
    if (activeBackendOverride) return activeBackendOverride.setStudyOptIn(input);
    return callCommand('vocabulary_set_study_opt_in', { input });
  },
  async deleteVocabulary(input) {
    if (activeBackendOverride) return activeBackendOverride.deleteVocabulary(input);
    return callCommand('vocabulary_delete', { input });
  },
  async getStudyQueue(filter) {
    if (activeBackendOverride) return activeBackendOverride.getStudyQueue(filter);
    return callCommand('study_get_queue', { filter });
  },
  async submitReview(input) {
    if (activeBackendOverride) return activeBackendOverride.submitReview(input);
    return callCommand('study_submit_review', { input });
  },
  async generateQuiz(input) {
    if (activeBackendOverride) return activeBackendOverride.generateQuiz(input);
    return callCommand('quiz_generate', { input });
  },
  async submitQuizAttempt(input) {
    if (activeBackendOverride) return activeBackendOverride.submitQuizAttempt(input);
    return callCommand('quiz_submit_attempt', { input });
  },
  async getReminderConfig() {
    if (activeBackendOverride) return activeBackendOverride.getReminderConfig();
    return callCommand('reminders_get_config');
  },
  async updateReminderConfig(config) {
    if (activeBackendOverride) return activeBackendOverride.updateReminderConfig(config);
    return callCommand('reminders_update_config', { config });
  },
  async evaluateReminder(input) {
    if (activeBackendOverride) return activeBackendOverride.evaluateReminder(input);
    return callCommand('reminders_evaluate', { input });
  },
  async snoozeReminder(minutes, nowIso) {
    if (activeBackendOverride) return activeBackendOverride.snoozeReminder(minutes, nowIso);
    return callCommand('reminders_snooze', { minutes, nowIso });
  },
  async dismissReminderToday(localDate) {
    if (activeBackendOverride) return activeBackendOverride.dismissReminderToday(localDate);
    return callCommand('reminders_dismiss_today', { localDate });
  },
  async getAppSettings() {
    if (activeBackendOverride) return activeBackendOverride.getAppSettings();
    return callCommand('settings_get');
  },
  async updateAppSettings(settings) {
    if (activeBackendOverride) return activeBackendOverride.updateAppSettings(settings);
    return callCommand('settings_update', { settings });
  },
  async getProgressMetrics(localDate) {
    if (activeBackendOverride) return activeBackendOverride.getProgressMetrics(localDate);
    return callCommand('progress_get_metrics', { localDate });
  },
  async exportBackup(input) {
    if (activeBackendOverride) return activeBackendOverride.exportBackup(input);
    return callCommand('backup_export', { input });
  },
  async importBackup(input) {
    if (activeBackendOverride) return activeBackendOverride.importBackup(input);
    return callCommand('backup_import', { input });
  },
};
