import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLocalLexiBookBackend } from '../../src/backend/localBackendService';
import { VocabularyScreen } from '../../src/features/vocabulary/VocabularyScreen';
import { setLexiBookBackend } from '../../src/shared/api/client';

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

function readFixtureBase64(fileName: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, fileName)).toString('base64');
}

describe('Vocabulary Management: Polysemy Across Books, User Edits, Study Opt-In & Jump to PDF Source', () => {
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

  it('VOC-01 & VOC-02 & VOC-03: renders polysemous "charge" across 2 books with distinct contextual meanings, edits sense, toggles study opt-in, and jumps back to exact PDF source page', async () => {
    const appDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexibook-vocab-ui-'));
    tempDirs.push(appDataDir);

    const backend = createLocalLexiBookBackend(appDataDir);
    setLexiBookBackend(backend);

    const b1 = await backend.importPdf({
      fileName: 'habit_systems.pdf',
      bytesBase64: readFixtureBase64('habit_systems.pdf'),
    });
    const b2 = await backend.importPdf({
      fileName: 'deep_focus_two_col.pdf',
      bytesBase64: readFixtureBase64('deep_focus_two_col.pdf'),
    });
    if (!b1.ok || !b2.ok) throw new Error('Book imports failed');

    // Occurrence 1: "charge" in Book 1, page 2 (leadership responsibility)
    const occ1 = await backend.createHighlight({
      bookId: b1.data.book.id,
      pageNumber1Based: 2,
      selectedText: 'charge',
      sentenceText: 'The board asked the new director to take charge of the restructuring by Friday.',
      paragraphText: 'The board asked the new director to take charge of the restructuring by Friday.',
      textAnchor: {
        algorithmVersion: 1,
        exact: 'charge',
        prefix: 'to take ',
        suffix: ' of the',
        startOffset: 41,
        endOffset: 47,
        pdfFingerprint: b1.data.book.sha256,
        pageRotation: 0,
      },
      normalizedQuads: [{ x: 0.2, y: 0.3, width: 0.08, height: 0.02 }],
    });

    // Occurrence 2: "charge" in Book 2, page 1 (electrical charge)
    const occ2 = await backend.createHighlight({
      bookId: b2.data.book.id,
      pageNumber1Based: 1,
      selectedText: 'charge',
      sentenceText: 'Each capacitor holds a measurable electrical charge even after power is removed.',
      paragraphText: 'Each capacitor holds a measurable electrical charge even after power is removed.',
      textAnchor: {
        algorithmVersion: 1,
        exact: 'charge',
        prefix: 'electrical ',
        suffix: ' even after',
        startOffset: 45,
        endOffset: 51,
        pdfFingerprint: b2.data.book.sha256,
        pageRotation: 0,
      },
      normalizedQuads: [{ x: 0.5, y: 0.4, width: 0.08, height: 0.02 }],
    });

    if (!occ1.ok || !occ2.ok) throw new Error('Highlights failed');

    await backend.analyzeOccurrence({ occurrenceId: occ1.data.occurrence.id });
    await backend.analyzeOccurrence({ occurrenceId: occ2.data.occurrence.id });

    const onJumpToOccurrence = vi.fn();

    render(
      React.createElement(VocabularyScreen, {
        onJumpToOccurrence,
      })
    );

    // VOC-02: Both distinct contextual meanings for "charge" are rendered simultaneously
    await waitFor(() => {
      expect(
        screen.getByTestId(`occurrence-card-${occ1.data.occurrence.id}`)
      ).toBeInTheDocument();
      expect(
        screen.getByTestId(`occurrence-card-${occ2.data.occurrence.id}`)
      ).toBeInTheDocument();
    });

    // Click "Mở trang gốc trong PDF" on the first occurrence card
    const jumpButtons = screen.getAllByText('Mở trang gốc trong PDF');
    expect(jumpButtons.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(jumpButtons[0]);

    expect(onJumpToOccurrence).toHaveBeenCalled();

    // VOC-01: Edit the first sense's contextual meaning
    const editButtons = screen.getAllByText('Chỉnh sửa nghĩa');
    fireEvent.click(editButtons[0]);

    const editInputs = screen.getAllByLabelText('Nghĩa trong ngữ cảnh này');
    fireEvent.change(editInputs[0], {
      target: { value: 'quyền điều hành cao nhất (đã sửa)' },
    });
    fireEvent.click(screen.getByText('Lưu chỉnh sửa'));

    await waitFor(() => {
      expect(
        screen.getAllByText('quyền điều hành cao nhất (đã sửa)').length
      ).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Đã chỉnh sửa thủ công')).toBeInTheDocument();
    });

    // VOC-03: Toggle Study Opt-In
    const optInButtons = screen.getAllByText('Đưa vào Ôn tập');
    fireEvent.click(optInButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Đang trong danh sách Ôn tập')).toBeInTheDocument();
    });

    backend.close();
  });
});
