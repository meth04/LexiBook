import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createLocalLexiBookBackend } from '../../src/backend/localBackendService';
import { decodePdfStringLiteral } from '../../src/backend/repositories';
import {
  createTextAnchor,
  normalizedQuadToViewportRect,
  rectToNormalizedQuad,
  resolveTextAnchor,
} from '../../src/features/reader/anchorEngine';
import {
  buildPageExtraction,
  extractPdfDocument,
  extractSelectionContext,
  findAllOccurrencesInText,
  normalizePdfLigatures,
  snapSelectionOffsetsToWords,
} from '../../src/features/reader/pdfTextEngine';
import { ReaderScreen } from '../../src/features/reader/ReaderScreen';
import { setLexiBookBackend } from '../../src/shared/api/client';

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

function readFixtureBytes(fileName: string): Uint8Array {
  return new Uint8Array(fs.readFileSync(path.join(FIXTURES_DIR, fileName)));
}

describe('PDF Reader, Text Selection, Context Extraction & Zoom-Stable Highlight Overlays', () => {
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

  it('PDF-01: extracts single word ("compound") and multiword phrase ("gain traction") with authentic sentence and bounded paragraph', async () => {
    const doc = await extractPdfDocument(readFixtureBytes('habit_systems.pdf'));
    expect(doc.pageCount).toBe(3);
    expect(doc.isScanOnly).toBe(false);

    const page1 = doc.pages[0];
    const singleSel = extractSelectionContext(page1, 'compound');
    expect(singleSel.selectedText.toLowerCase()).toBe('compound');
    expect(singleSel.sentenceText).toContain(
      'The effects of your daily habits compound over time like interest in a bank.'
    );
    expect(singleSel.paragraphText.length).toBeLessThanOrEqual(500);

    const phraseSel = extractSelectionContext(page1, 'gain traction');
    expect(phraseSel.selectedText.toLowerCase()).toBe('gain traction');
    expect(phraseSel.sentenceText).toContain(
      'The startup struggled to gain traction despite positive early reviews from readers.'
    );
  });

  it('PDF-02: preserves highlight anchor coordinates across 50%, 125%, 200% zoom, window resize, and rotations 0/90/180/270', () => {
    const baseViewport = { width: 612, height: 792 };
    const initialRect = { left: 122.4, top: 198.0, width: 91.8, height: 19.8 };

    for (const rot of [0, 90, 180, 270]) {
      const quad = rectToNormalizedQuad(
        initialRect,
        baseViewport.width,
        baseViewport.height,
        rot
      );
      expect(quad.x).toBeGreaterThanOrEqual(0);
      expect(quad.x).toBeLessThanOrEqual(1);
      expect(quad.y).toBeGreaterThanOrEqual(0);
      expect(quad.y).toBeLessThanOrEqual(1);

      for (const scale of [0.5, 1.0, 1.25, 2.0]) {
        const scaledW = baseViewport.width * scale;
        const scaledH = baseViewport.height * scale;
        const projected = normalizedQuadToViewportRect(quad, scaledW, scaledH, rot);

        expect(projected.left).toBeCloseTo(initialRect.left * scale, 2);
        expect(projected.top).toBeCloseTo(initialRect.top * scale, 2);
        expect(projected.width).toBeCloseTo(initialRect.width * scale, 2);
        expect(projected.height).toBeCloseTo(initialRect.height * scale, 2);
      }
    }
  });

  it('PDF-03: extracts 2-column layout in column reading order, normalizes ligatures, and disambiguates 5 repeated occurrences of "charge" on page 2', async () => {
    const twoColDoc = await extractPdfDocument(readFixtureBytes('deep_focus_two_col.pdf'));
    const twoColPage = twoColDoc.pages[0];
    expect(twoColPage.isTwoColumn).toBe(true);

    // Left column text ("Each electrical charge stored in the capacitor must dissipate safely before engineers inspect the circuit board.") must not interleave with right column text
    expect(twoColPage.canonicalText).toContain(
      'Each electrical charge stored in the capacitor must dissipate safely before engineers inspect the circuit board.'
    );
    expect(normalizePdfLigatures('e\uFB03cient work\uFB02ow')).toBe('efficient workflow');

    // Repeated word "charge" appearing 5 times on page 2 of habit_systems.pdf
    const habitDoc = await extractPdfDocument(readFixtureBytes('habit_systems.pdf'));
    const page2 = habitDoc.pages[1];
    const allChargeOffsets = findAllOccurrencesInText(page2.canonicalText, 'charge');
    expect(allChargeOffsets.length).toBeGreaterThanOrEqual(5);

    // Anchor specifically to the 3rd occurrence (index 2)
    const thirdContext = extractSelectionContext(page2, 'charge', { occurrenceIndex: 2 });
    const anchor = createTextAnchor(
      page2.canonicalText,
      'charge',
      { startOffset: thirdContext.startOffset, occurrenceIndex: 2 },
      'fingerprint-habit-systems',
      0
    );

    expect(anchor.startOffset).toBe(allChargeOffsets[2]);

    const resolved = resolveTextAnchor(page2.canonicalText, anchor, 'fingerprint-habit-systems');
    expect(resolved.resolved).toBe(true);
    expect(resolved.startOffset).toBe(allChargeOffsets[2]);
    expect(resolved.anchorUncertain).toBe(false);

    // Mismatched PDF fingerprint is rejected safely
    const wrongPdf = resolveTextAnchor(page2.canonicalText, anchor, 'wrong-fingerprint');
    expect(wrongPdf.resolved).toBe(false);
  });

  it('PDF-04 & HIL-01 & HIL-02: ReaderScreen renders scan-only notice, persists highlight before AI, and survives AI failure with retry button', async () => {
    const appDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexibook-reader-ui-'));
    tempDirs.push(appDataDir);

    const backend = createLocalLexiBookBackend(appDataDir);
    setLexiBookBackend(backend);

    // 1. Scan-only PDF notice
    const scanImport = await backend.importPdf({
      fileName: 'scanned_no_text.pdf',
      bytesBase64: Buffer.from(readFixtureBytes('scanned_no_text.pdf')).toString('base64'),
    });
    if (!scanImport.ok) throw new Error('Scan import failed');

    const { unmount } = render(
      React.createElement(ReaderScreen, {
        bookId: scanImport.data.book.id,
        onBackToLibrary: () => {},
      })
    );

    await waitFor(() => {
      expect(screen.getByTestId('scan-only-banner')).toBeInTheDocument();
    });
    unmount();

    // 2. Selectable PDF: highlight persists even when AI fails, and retry succeeds
    const habitImport = await backend.importPdf({
      fileName: 'habit_systems.pdf',
      bytesBase64: Buffer.from(readFixtureBytes('habit_systems.pdf')).toString('base64'),
    });
    if (!habitImport.ok) throw new Error('Habit import failed');

    // Remove API key so first AI attempt fails with AI_KEY_MISSING while highlight survives
    await backend.deleteAiKey();

    render(
      React.createElement(ReaderScreen, {
        bookId: habitImport.data.book.id,
        onBackToLibrary: () => {},
      })
    );

    await waitFor(() => {
      expect(screen.getByTestId('quick-select-input')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('quick-select-input'), {
      target: { value: 'gain traction' },
    });
    fireEvent.click(screen.getByTestId('quick-select-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('selection-confirm-bar')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('confirm-highlight-btn'));

    // Highlight is saved in sidebar and shows retry button because AI key was missing
    await waitFor(() => {
      expect(screen.getByTestId('sidebar-item-gain traction')).toBeInTheDocument();
      expect(screen.getByTestId('retry-ai-btn')).toBeInTheDocument();
    });

    // Now configure API key and click Retry
    await backend.setAiKey('AIzaSyTestRetryKey9999999999');
    fireEvent.click(screen.getByTestId('retry-ai-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('detail-contextual-meaning')).toHaveTextContent(
        'bắt đầu đạt hiệu quả rõ rệt và tạo được đà duy trì'
      );
    });

    backend.close();
  });

  it('PDF-01 & LIB-01 (Real-world UTF-16BE Title & FlateDecode PDF): decodes UTF-16BE BOM titles cleanly and marks FlateDecode font PDFs as selectable', async () => {
    const rawUtf16Title =
      '\xfe\xff\x00L\x00i\x00m\x00i\x00t\x00l\x00e\x00s\x00s\x00 \x00,\x00,\x00 \x00U\x00p\x00g\x00r\x00a\x00d\x00e\x00 \x00Y\x00o\x00u\x00r\x00 \x00B\x00r\x00a\x00i\x00n';
    expect(decodePdfStringLiteral(rawUtf16Title)).toBe('Limitless \u2014 Upgrade Your Brain');

    const appDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexibook-utf16-test-'));
    tempDirs.push(appDataDir);
    const backend = createLocalLexiBookBackend(appDataDir);

    const syntheticFlatePdf = Buffer.from(
      `%PDF-1.4\n1 0 obj << /Type /Pages /Count 355 >> endobj\n2 0 obj << /Title (${rawUtf16Title}) >> endobj\n3 0 obj << /Font << /F1 4 0 R >> /Filter /FlateDecode >> stream\ncompressed\nendstream\nendobj\n%%EOF`,
      'latin1'
    );
    const imported = await backend.importPdf({
      fileName: 'Limitless.pdf',
      bytesBase64: syntheticFlatePdf.toString('base64'),
    });
    expect(imported.ok).toBe(true);
    if (imported.ok) {
      expect(imported.data.book.title).toBe('Limitless \u2014 Upgrade Your Brain');
      expect(imported.data.book.pageCount).toBe(355);
      expect(imported.data.book.isScanOnly).toBe(false);
    }
    backend.close();
  });

  it('snaps slightly shifted or partial word selections (e.g. "azing skill, no" or "mazing skil") to exact "amazing skill" on justified PDF lines', () => {
    const page = buildPageExtraction(2, 612, 792, [
      {
        str: '“While many authors claim to teach some amazing skill, no skill is as',
        x: 76.99,
        y: 463.5,
        width: 457.57,
        height: 15,
        pageWidth: 612,
        pageHeight: 792,
        fontFamily: 'serif',
        ascent: 0.89,
      },
      {
        str: 'powerful as learning how to learn. It is the superpower from which all',
        x: 76.99,
        y: 446.3,
        width: 457.8,
        height: 15,
        pageWidth: 612,
        pageHeight: 792,
        fontFamily: 'serif',
        ascent: 0.89,
      },
    ]);

    const shiftedIdx = page.canonicalText.indexOf('azing skill, no');
    expect(shiftedIdx).toBeGreaterThan(0);

    const snapped = snapSelectionOffsetsToWords(
      page.canonicalText,
      shiftedIdx,
      shiftedIdx + 'azing skill, no'.length
    );
    expect(snapped.text).toBe('amazing skill');

    const ctx = extractSelectionContext(page, 'azing skill, no', {
      startOffset: shiftedIdx,
      endOffset: shiftedIdx + 'azing skill, no'.length,
      snapToWords: true,
    });
    expect(ctx.selectedText).toBe('amazing skill');
    expect(ctx.sentenceText).toBe(
      '“While many authors claim to teach some amazing skill, no skill is as powerful as learning how to learn.'
    );
  });
});
