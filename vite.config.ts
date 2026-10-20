import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createLocalLexiBookBackend } from './src/backend/localBackendService';

function lexiBookLocalIpcPlugin(): Plugin {
  const dataDir =
    process.env.LEXIBOOK_DATA_DIR || path.resolve(process.cwd(), '.lexibook-local-data');
  let backend: ReturnType<typeof createLocalLexiBookBackend> | null = null;

  function getBackend() {
    if (!backend) {
      backend = createLocalLexiBookBackend(dataDir, { useDiskCredentialVault: true });
    }
    return backend;
  }

  async function handleIpcRequest(req: IncomingMessage, res: ServerResponse, next: () => void) {
    if (!req.url || !req.url.startsWith('/__lexibook_ipc/')) {
      next();
      return;
    }

    const command = req.url.replace('/__lexibook_ipc/', '').split('?')[0];
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const rawBody = Buffer.concat(chunks).toString('utf8');
    const payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
    const api = getBackend();

    let result: unknown;
    switch (command) {
      case 'book_import_pdf':
        result = await api.importPdf(payload.input as Parameters<typeof api.importPdf>[0]);
        break;
      case 'book_list':
        result = await api.listBooks(payload.filter as Parameters<typeof api.listBooks>[0]);
        break;
      case 'book_get':
        result = await api.getBook(String(payload.bookId));
        break;
      case 'book_get_pdf_bytes':
        result = await api.getBookPdfBytes(String(payload.bookId));
        break;
      case 'book_update':
        result = await api.updateBook(payload.input as Parameters<typeof api.updateBook>[0]);
        break;
      case 'book_remove':
        result = await api.removeBook(payload.input as Parameters<typeof api.removeBook>[0]);
        break;
      case 'reader_save_position':
        result = await api.saveReadingPosition(
          payload.input as Parameters<typeof api.saveReadingPosition>[0]
        );
        break;
      case 'highlight_create':
        result = await api.createHighlight(
          payload.input as Parameters<typeof api.createHighlight>[0]
        );
        break;
      case 'highlight_list':
        result = await api.listHighlights(
          String(payload.bookId),
          payload.pageNumber1Based !== undefined ? Number(payload.pageNumber1Based) : undefined
        );
        break;
      case 'highlight_remove':
        result = await api.removeHighlight(String(payload.highlightId));
        break;
      case 'ai_analyze_occurrence':
        result = await api.analyzeOccurrence(
          payload.input as Parameters<typeof api.analyzeOccurrence>[0]
        );
        break;
      case 'ai_cancel_analysis':
        result = await api.cancelAnalysis(String(payload.occurrenceId));
        break;
      case 'ai_get_key_status':
        result = await api.getAiKeyStatus();
        break;
      case 'ai_set_key':
        result = await api.setAiKey(
          String(payload.apiKey),
          payload.modelId ? String(payload.modelId) : undefined
        );
        break;
      case 'ai_test_connection':
        result = await api.testAiConnection();
        break;
      case 'ai_delete_key':
        result = await api.deleteAiKey();
        break;
      case 'ai_clear_cache':
        result = await api.clearAiCache();
        break;
      case 'vocabulary_list':
        result = await api.listVocabulary(
          payload.filter as Parameters<typeof api.listVocabulary>[0]
        );
        break;
      case 'vocabulary_get_detail':
        result = await api.getVocabularyDetail(String(payload.lexemeId));
        break;
      case 'vocabulary_edit_sense':
        result = await api.editSense(payload.input as Parameters<typeof api.editSense>[0]);
        break;
      case 'vocabulary_set_study_opt_in':
        result = await api.setStudyOptIn(payload.input as Parameters<typeof api.setStudyOptIn>[0]);
        break;
      case 'vocabulary_delete':
        result = await api.deleteVocabulary(
          payload.input as Parameters<typeof api.deleteVocabulary>[0]
        );
        break;
      case 'study_get_queue':
        result = await api.getStudyQueue(payload.filter as Parameters<typeof api.getStudyQueue>[0]);
        break;
      case 'study_submit_review':
        result = await api.submitReview(payload.input as Parameters<typeof api.submitReview>[0]);
        break;
      case 'quiz_generate':
        result = await api.generateQuiz(payload.input as Parameters<typeof api.generateQuiz>[0]);
        break;
      case 'quiz_submit_attempt':
        result = await api.submitQuizAttempt(
          payload.input as Parameters<typeof api.submitQuizAttempt>[0]
        );
        break;
      case 'reminders_get_config':
        result = await api.getReminderConfig();
        break;
      case 'reminders_update_config':
        result = await api.updateReminderConfig(
          payload.config as Parameters<typeof api.updateReminderConfig>[0]
        );
        break;
      case 'reminders_evaluate':
        result = await api.evaluateReminder(
          payload.input as Parameters<typeof api.evaluateReminder>[0]
        );
        break;
      case 'reminders_snooze':
        result = await api.snoozeReminder(
          Number(payload.minutes),
          payload.nowIso ? String(payload.nowIso) : undefined
        );
        break;
      case 'reminders_dismiss_today':
        result = await api.dismissReminderToday(String(payload.localDate));
        break;
      case 'settings_get':
        result = await api.getAppSettings();
        break;
      case 'settings_update':
        result = await api.updateAppSettings(
          payload.settings as Parameters<typeof api.updateAppSettings>[0]
        );
        break;
      case 'progress_get_metrics':
        result = await api.getProgressMetrics(
          payload.localDate ? String(payload.localDate) : undefined
        );
        break;
      case 'backup_export':
        result = await api.exportBackup(payload.input as Parameters<typeof api.exportBackup>[0]);
        break;
      case 'backup_import':
        result = await api.importBackup(payload.input as Parameters<typeof api.importBackup>[0]);
        break;
      default:
        result = {
          ok: false,
          error: {
            code: 'NOT_FOUND',
            messageVi: `Lệnh IPC không tồn tại: ${command}`,
            retryable: false,
          },
        };
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(result));
  }

  return {
    name: 'lexibook-local-ipc',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleIpcRequest(req, res, next);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleIpcRequest(req, res, next);
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), lexiBookLocalIpcPlugin()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    target: 'es2022',
    minify: 'esbuild',
    sourcemap: false,
  },
});
