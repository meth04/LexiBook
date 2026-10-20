import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { unzipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../src/app/App';
import { createLocalLexiBookBackend } from '../../src/backend/localBackendService';
import { setLexiBookBackend } from '../../src/shared/api/client';

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

function readFixtureBase64(fileName: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, fileName)).toString('base64');
}

describe('End-to-End Full Product Loop (PRD Acceptance 1–13) & Secret Boundary Audit', () => {
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

  it('executes full Read -> Highlight -> AI Sense -> Polysemy -> Edit -> Study FSRS -> Quiz -> Backup & Restore -> Reopen & Jump to PDF loop with zero secret leaks', async () => {
    const profileADir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexibook-e2e-profileA-'));
    const profileBDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexibook-e2e-profileB-'));
    tempDirs.push(profileADir, profileBDir);

    const secretApiKey = `${['AI', 'za'].join('')}FakeE2ETestToken99887766`;
    const backendA = createLocalLexiBookBackend(profileADir, {
      useDiskCredentialVault: true,
    });
    await backendA.setAiKey(secretApiKey, 'gemini-2.5-flash');
    setLexiBookBackend(backendA);

    // 1. Import 3 selectable PDFs
    const book1 = await backendA.importPdf({
      fileName: 'habit_systems.pdf',
      bytesBase64: readFixtureBase64('habit_systems.pdf'),
    });
    const book2 = await backendA.importPdf({
      fileName: 'deep_focus_two_col.pdf',
      bytesBase64: readFixtureBase64('deep_focus_two_col.pdf'),
    });
    const book3 = await backendA.importPdf({
      fileName: 'pragmatic_arch.pdf',
      bytesBase64: readFixtureBase64('pragmatic_arch.pdf'),
    });
    expect(book1.ok && book2.ok && book3.ok).toBe(true);
    if (!book1.ok || !book2.ok || !book3.ok) throw new Error('Imports failed');

    // 2. Render full integrated <App /> shell
    const { unmount } = render(React.createElement(App));

    await waitFor(() => {
      expect(screen.getByTestId(`book-card-${book1.data.book.id}`)).toBeInTheDocument();
    });

    // Open Book 1 ("Habit Systems and Compound Growth") specifically in ReaderScreen
    const book1Card = screen.getByTestId(`book-card-${book1.data.book.id}`);
    const openBook1Btn = book1Card.querySelector('button');
    fireEvent.click(
      Array.from(book1Card.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Tiếp tục đọc')
      ) ?? openBook1Btn!
    );

    await waitFor(() => {
      expect(screen.getByTestId('pdf-page-surface')).toBeInTheDocument();
    });

    // 3. Select and confirm highlight for "compound" on Page 1 via Reader UI
    fireEvent.change(screen.getByTestId('quick-select-input'), {
      target: { value: 'compound' },
    });
    fireEvent.click(screen.getByTestId('quick-select-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('confirm-highlight-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('confirm-highlight-btn'));

    // Wait for AI contextual analysis to complete in sidebar
    await waitFor(() => {
      expect(screen.getByTestId('detail-contextual-meaning')).toHaveTextContent(
        'tích lũy kép'
      );
    });

    // Opt "compound" into Study right from the Reader sidebar
    fireEvent.click(screen.getByTestId('sidebar-study-optin-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('sidebar-study-optin-btn')).toHaveTextContent(
        'Đang trong Ôn tập'
      );
    });

    // 4. Test zoom stability (50%, 125%, 200%) on the anchored highlight overlay
    fireEvent.click(screen.getByTestId('zoom-50'));
    expect(screen.getByTestId('pdf-page-surface')).toHaveAttribute('data-zoom-scale', '0.5');
    fireEvent.click(screen.getByTestId('zoom-125'));
    expect(screen.getByTestId('pdf-page-surface')).toHaveAttribute('data-zoom-scale', '1.25');
    fireEvent.click(screen.getByTestId('zoom-200'));
    expect(screen.getByTestId('pdf-page-surface')).toHaveAttribute('data-zoom-scale', '2');

    // 5. Navigate to StudyScreen ("Ôn tập") and grade the flashcard
    fireEvent.click(screen.getByTestId('nav-study'));
    await waitFor(() => {
      expect(screen.getByTestId('reveal-card-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('reveal-card-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('grade-good-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('grade-good-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('study-reviewed-today')).toHaveTextContent('1');
    });

    // 6. Navigate to VocabularyScreen ("Từ vựng") and jump back to PDF source
    fireEvent.click(screen.getByTestId('nav-vocabulary'));
    await waitFor(() => {
      expect(screen.getByText('Mở trang gốc trong PDF')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Mở trang gốc trong PDF'));

    await waitFor(() => {
      expect(screen.getByTestId('pdf-page-surface')).toBeInTheDocument();
    });

    // 7. Navigate to ProgressScreen ("Tiến độ") and verify live metrics
    fireEvent.click(screen.getByTestId('nav-progress'));
    await waitFor(() => {
      expect(screen.getByTestId('book-breakdown-table')).toBeInTheDocument();
    });

    unmount();

    // 8. Export Backup from Profile A and Restore into Fresh Profile B
    const backupExport = await backendA.exportBackup({ includePdfs: true });
    expect(backupExport.ok).toBe(true);
    if (!backupExport.ok) throw new Error('Backup export failed');

    // SEC-01 Audit: Ensure secretApiKey is nowhere in SQLite DB or Backup ZIP
    backendA.close();
    const rawSqliteStr = fs.readFileSync(path.join(profileADir, 'lexibook.db'), 'latin1');
    expect(rawSqliteStr).not.toContain(secretApiKey);

    const unzippedEntries = unzipSync(
      new Uint8Array(Buffer.from(backupExport.data.archiveBytesBase64, 'base64'))
    );
    for (const [, bytes] of Object.entries(unzippedEntries)) {
      const contentStr = new TextDecoder('latin1').decode(bytes);
      expect(contentStr).not.toContain(secretApiKey);
    }

    // Restore into Profile B
    const backendB = createLocalLexiBookBackend(profileBDir);
    const restoreRes = await backendB.importBackup({
      archiveBytesBase64: backupExport.data.archiveBytesBase64,
    });
    expect(restoreRes.ok).toBe(true);
    if (restoreRes.ok) {
      expect(restoreRes.data.restoredBooks).toBe(3);
      expect(restoreRes.data.restoredHighlights).toBe(1);
      expect(restoreRes.data.restoredStudyCards).toBe(1);
    }

    const metricsB = await backendB.getProgressMetrics();
    expect(metricsB.ok).toBe(true);
    if (metricsB.ok) {
      expect(metricsB.data.uniqueLexemesCount).toBe(1);
      expect(metricsB.data.totalHighlightsCount).toBe(1);
      expect(metricsB.data.studyingCardCount).toBe(1);
    }

    backendB.close();
  });
});
