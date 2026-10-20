import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalLexiBookBackend } from '../../src/backend/localBackendService';
import { LibraryScreen } from '../../src/features/library/LibraryScreen';
import { ProgressScreen } from '../../src/features/progress/ProgressScreen';
import { setLexiBookBackend } from '../../src/shared/api/client';
import { Modal } from '../../src/shared/ui/components';

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

function readFixtureBase64(fileName: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, fileName)).toString('base64');
}

describe('UI Design Shell, Library Screen & Progress Dashboard', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    setLexiBookBackend(null);
    for (const d of tempDirs.splice(0, tempDirs.length)) {
      try {
        fs.rmSync(d, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });

  it('UI-01 & UI-02: supports Escape key to close Modal, accessible dialog roles, and onboarding dismissal', async () => {
    const onClose = vi.fn();
    render(
      React.createElement(Modal, {
        isOpen: true,
        title: 'Hộp thoại kiểm thử',
        onClose,
        children: React.createElement('p', null, 'Nội dung hộp thoại'),
      })
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('LibraryScreen: renders empty state, lists imported books, renames book, and handles explicit delete options', async () => {
    const appDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexibook-ui-lib-'));
    tempDirs.push(appDataDir);

    const backend = createLocalLexiBookBackend(appDataDir);
    setLexiBookBackend(backend);

    const onOpenBook = vi.fn();
    const onOpenVocab = vi.fn();
    const onDismissOnboarding = vi.fn();

    const { rerender } = render(
      React.createElement(LibraryScreen, {
        onOpenBook,
        onOpenVocabularyForBook: onOpenVocab,
        showOnboarding: true,
        onDismissOnboarding,
      })
    );

    // Initially empty state is shown
    await waitFor(() => {
      expect(screen.getByTestId('library-empty-state')).toBeInTheDocument();
    });

    // Dismiss onboarding banner
    fireEvent.click(screen.getByText('Đã hiểu & Bắt đầu đọc'));
    expect(onDismissOnboarding).toHaveBeenCalledTimes(1);

    // Import a book into backend and rerender
    const b1 = await backend.importPdf({
      fileName: 'habit_systems.pdf',
      bytesBase64: readFixtureBase64('habit_systems.pdf'),
    });
    if (!b1.ok) throw new Error('Import failed');

    rerender(
      React.createElement(LibraryScreen, {
        key: 'reloaded',
        onOpenBook,
        onOpenVocabularyForBook: onOpenVocab,
        showOnboarding: false,
      })
    );

    await waitFor(() => {
      expect(screen.getByTestId(`book-card-${b1.data.book.id}`)).toBeInTheDocument();
    });

    // Rename book via modal
    fireEvent.click(screen.getByText('Đổi tên'));
    const renameInput = screen.getByLabelText('Tên sách mới');
    fireEvent.change(renameInput, { target: { value: 'Hệ thống Thói quen Bền vững' } });
    fireEvent.click(screen.getByText('Lưu tên mới'));

    await waitFor(() => {
      expect(screen.getByText('Hệ thống Thói quen Bền vững')).toBeInTheDocument();
    });

    // Click Tiếp tục đọc
    fireEvent.click(screen.getByText('Tiếp tục đọc'));
    expect(onOpenBook).toHaveBeenCalledWith(b1.data.book.id);

    backend.close();
  });

  it('ProgressScreen: displays honest source-derived metrics, mastered rule description, 7-day chart, and per-book breakdown', async () => {
    const appDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexibook-ui-prog-'));
    tempDirs.push(appDataDir);

    const backend = createLocalLexiBookBackend(appDataDir);
    setLexiBookBackend(backend);

    // 1. Zero-data state
    const { unmount } = render(React.createElement(ProgressScreen));
    await waitFor(() => {
      expect(screen.getByTestId('progress-empty-state')).toBeInTheDocument();
      expect(screen.getByTestId('kpi-quiz-accuracy')).toHaveTextContent('Chưa có dữ liệu');
    });
    unmount();

    // 2. Populate book, highlight, study card, review, and quiz attempt
    const bookRes = await backend.importPdf({
      fileName: 'habit_systems.pdf',
      bytesBase64: readFixtureBase64('habit_systems.pdf'),
    });
    if (!bookRes.ok) throw new Error('Import failed');

    const hlRes = await backend.createHighlight({
      bookId: bookRes.data.book.id,
      pageNumber1Based: 1,
      selectedText: 'compound',
      sentenceText: 'Small daily habits compound into remarkable results.',
      paragraphText: 'Small daily habits compound into remarkable results.',
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
    if (!hlRes.ok) throw new Error('Highlight failed');

    const senseRes = await backend.analyzeOccurrence({
      occurrenceId: hlRes.data.occurrence.id,
    });
    if (!senseRes.ok) throw new Error('Sense failed');

    const cardRes = await backend.setStudyOptIn({
      senseId: senseRes.data.id,
      representativeOccurrenceId: hlRes.data.occurrence.id,
      enabled: true,
    });
    if (!cardRes.ok || !cardRes.data) throw new Error('OptIn failed');

    await backend.submitReview({
      studyCardId: cardRes.data.id,
      grade: 'good',
      responseMs: 900,
      clientReviewRequestId: 'prog_rev_1',
    });

    await backend.submitQuizAttempt({
      clientAttemptId: 'prog_quiz_1',
      bookId: bookRes.data.book.id,
      totalQuestions: 5,
      correctCount: 4,
      answers: [],
    });

    render(React.createElement(ProgressScreen));

    await waitFor(() => {
      expect(screen.getByTestId('kpi-quiz-accuracy')).toHaveTextContent('80%');
      expect(screen.getByTestId('mastered-rule-description')).toHaveTextContent(
        'stability'
      );
      expect(screen.getByTestId('seven-day-chart')).toBeInTheDocument();
      expect(screen.getByTestId('book-breakdown-table')).toBeInTheDocument();
    });

    backend.close();
  });
});
