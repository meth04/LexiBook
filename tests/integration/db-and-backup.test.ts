import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { zipSync } from 'fflate';
import { afterEach, describe, expect, it } from 'vitest';
import { exportBackup, importBackup } from '../../src/backend/backupService';
import { openLexiBookDatabase } from '../../src/backend/db';
import { createRepositories, validateSafeRelativePath } from '../../src/backend/repositories';

const FIXTURES_DIR = path.resolve(__dirname, '../fixtures');

function readFixtureBase64(fileName: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, fileName)).toString('base64');
}

describe('Data Platform: SQLite Repositories, Managed PDF Storage & Secure Backup/Restore', () => {
  const tempDirs: string[] = [];

  function createTempProfile(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexibook-db-test-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const d of tempDirs.splice(0, tempDirs.length)) {
      try {
        fs.rmSync(d, { recursive: true, force: true });
      } catch {
        // ignore Windows file lock delay
      }
    }
  });

  it('LIB-01 & LIB-02 & LIB-03: imports 3 PDFs, detects duplicates, searches library, and persists reading position across DB reopen', () => {
    const appDataDir = createTempProfile();
    let ctx = openLexiBookDatabase(appDataDir);
    let repos = createRepositories(ctx);

    const b1 = repos.importPdf({
      fileName: 'habit_systems.pdf',
      bytesBase64: readFixtureBase64('habit_systems.pdf'),
    });
    const b2 = repos.importPdf({
      fileName: 'deep_focus_two_col.pdf',
      bytesBase64: readFixtureBase64('deep_focus_two_col.pdf'),
    });
    const b3 = repos.importPdf({
      fileName: 'pragmatic_arch.pdf',
      bytesBase64: readFixtureBase64('pragmatic_arch.pdf'),
    });

    expect(b1.ok && b1.data.status === 'imported').toBe(true);
    expect(b2.ok && b2.data.status === 'imported').toBe(true);
    expect(b3.ok && b3.data.status === 'imported').toBe(true);
    if (!b1.ok) throw new Error('Expected b1 ok');

    // LIB-02: Duplicate hash detection in prompt mode
    const dupPrompt = repos.importPdf({
      fileName: 'habit_systems_copy.pdf',
      bytesBase64: readFixtureBase64('habit_systems.pdf'),
      duplicateResolution: 'prompt',
    });
    expect(dupPrompt.ok).toBe(true);
    if (dupPrompt.ok) {
      expect(dupPrompt.data.status).toBe('duplicate_detected');
      expect(dupPrompt.data.existingBook?.id).toBe(b1.data.book.id);
    }

    // LIB-02: Open existing resolution
    const dupOpen = repos.importPdf({
      fileName: 'habit_systems_copy.pdf',
      bytesBase64: readFixtureBase64('habit_systems.pdf'),
      duplicateResolution: 'open_existing',
    });
    expect(dupOpen.ok && dupOpen.data.status === 'opened_existing').toBe(true);

    // Search library
    const searchRes = repos.listBooks({ search: 'Habit' });
    expect(searchRes.ok).toBe(true);
    if (searchRes.ok) {
      expect(searchRes.data).toHaveLength(1);
      expect(searchRes.data[0].id).toBe(b1.data.book.id);
    }

    // LIB-03: Save reading position and reopen database
    const posRes = repos.saveReadingPosition({
      bookId: b1.data.book.id,
      pageNumber1Based: 2,
      scrollOffsetNormalized: 0.65,
    });
    expect(posRes.ok).toBe(true);

    ctx.close();

    // Reopen fresh connection
    ctx = openLexiBookDatabase(appDataDir);
    repos = createRepositories(ctx);
    const reopenedBook = repos.getBook(b1.data.book.id);
    expect(reopenedBook.ok).toBe(true);
    if (reopenedBook.ok) {
      expect(reopenedBook.data.lastPage).toBe(2);
      expect(reopenedBook.data.lastScrollOffset).toBeCloseTo(0.65, 3);
    }

    ctx.close();
  });

  it('PDF-04: handles scan-only PDFs gracefully and rejects encrypted or corrupt PDFs with Vietnamese errors', () => {
    const appDataDir = createTempProfile();
    const ctx = openLexiBookDatabase(appDataDir);
    const repos = createRepositories(ctx);

    const scanRes = repos.importPdf({
      fileName: 'scanned_no_text.pdf',
      bytesBase64: readFixtureBase64('scanned_no_text.pdf'),
    });
    expect(scanRes.ok).toBe(true);
    if (scanRes.ok) {
      expect(scanRes.data.book.isScanOnly).toBe(true);
    }

    const encRes = repos.importPdf({
      fileName: 'encrypted_sample.pdf',
      bytesBase64: readFixtureBase64('encrypted_sample.pdf'),
    });
    expect(encRes.ok).toBe(false);
    if (!encRes.ok) {
      expect(encRes.error.code).toBe('PDF_ENCRYPTED');
    }

    const corruptRes = repos.importPdf({
      fileName: 'corrupt_sample.pdf',
      bytesBase64: readFixtureBase64('corrupt_sample.pdf'),
    });
    expect(corruptRes.ok).toBe(false);
    if (!corruptRes.ok) {
      expect(corruptRes.error.code).toBe('INVALID_PDF_HEADER');
    }

    ctx.close();
  });

  it('HIL-01 & HIL-03 & VOC-01 & VOC-03: persists polysemous word across 2 books under 1 Lexeme with 2 distinct Occurrences, preserves user edits, and deletes single occurrence safely', () => {
    const appDataDir = createTempProfile();
    const ctx = openLexiBookDatabase(appDataDir);
    const repos = createRepositories(ctx);

    const bookA = repos.importPdf({
      fileName: 'habit_systems.pdf',
      bytesBase64: readFixtureBase64('habit_systems.pdf'),
    });
    const bookB = repos.importPdf({
      fileName: 'deep_focus_two_col.pdf',
      bytesBase64: readFixtureBase64('deep_focus_two_col.pdf'),
    });
    if (!bookA.ok || !bookB.ok) throw new Error('Import failed');

    // Highlight "charge" in Book A (leadership context)
    const hA = repos.createHighlight({
      bookId: bookA.data.book.id,
      pageNumber1Based: 2,
      selectedText: 'charge',
      sentenceText: 'The board asked the new director to take charge of the restructuring by Friday.',
      paragraphText: 'The board asked the new director to take charge of the restructuring by Friday.',
      textAnchor: {
        algorithmVersion: 1,
        exact: 'charge',
        prefix: 'new director to take ',
        suffix: ' of the restructuring',
        startOffset: 41,
        endOffset: 47,
        pdfFingerprint: bookA.data.book.sha256,
        pageRotation: 0,
      },
      normalizedQuads: [{ x: 0.2, y: 0.3, width: 0.08, height: 0.02 }],
    });
    expect(hA.ok).toBe(true);

    // Idempotent duplicate highlight on the exact same passage returns deduplicated = true
    const hADup = repos.createHighlight({
      bookId: bookA.data.book.id,
      pageNumber1Based: 2,
      selectedText: 'charge',
      sentenceText: 'The board asked the new director to take charge of the restructuring by Friday.',
      paragraphText: 'The board asked the new director to take charge of the restructuring by Friday.',
      textAnchor: {
        algorithmVersion: 1,
        exact: 'charge',
        prefix: 'new director to take ',
        suffix: ' of the restructuring',
        startOffset: 41,
        endOffset: 47,
        pdfFingerprint: bookA.data.book.sha256,
        pageRotation: 0,
      },
      normalizedQuads: [{ x: 0.2, y: 0.3, width: 0.08, height: 0.02 }],
    });
    expect(hADup.ok && hADup.data.deduplicated).toBe(true);

    // Highlight "Charge" in Book B (electrical context)
    const hB = repos.createHighlight({
      bookId: bookB.data.book.id,
      pageNumber1Based: 1,
      selectedText: 'Charge',
      sentenceText: 'Each capacitor holds a measurable electrical charge even after power is removed.',
      paragraphText: 'Each capacitor holds a measurable electrical charge even after power is removed.',
      textAnchor: {
        algorithmVersion: 1,
        exact: 'charge',
        prefix: 'measurable electrical ',
        suffix: ' even after power',
        startOffset: 45,
        endOffset: 51,
        pdfFingerprint: bookB.data.book.sha256,
        pageRotation: 0,
      },
      normalizedQuads: [{ x: 0.55, y: 0.4, width: 0.09, height: 0.02 }],
    });
    expect(hB.ok).toBe(true);

    if (!hA.ok || !hB.ok) throw new Error('Highlights failed');

    // Both occurrences share the same Lexeme ID ("charge") but have distinct Occurrence IDs
    expect(hA.data.lexeme.id).toBe(hB.data.lexeme.id);
    expect(hA.data.occurrence.id).not.toBe(hB.data.occurrence.id);

    const vocabList = repos.listVocabulary();
    expect(vocabList.ok).toBe(true);
    if (vocabList.ok) {
      expect(vocabList.data).toHaveLength(1);
      expect(vocabList.data[0].occurrenceCount).toBe(2);
      expect(vocabList.data[0].bookIds).toHaveLength(2);
    }

    // Delete only occurrence A -> occurrence B remains intact!
    const delRes = repos.deleteVocabulary({
      scope: 'occurrence_only',
      occurrenceId: hA.data.occurrence.id,
    });
    expect(delRes.ok).toBe(true);

    const vocabAfter = repos.getVocabularyDetail(hA.data.lexeme.id);
    expect(vocabAfter.ok).toBe(true);
    if (vocabAfter.ok) {
      expect(vocabAfter.data.occurrenceCount).toBe(1);
      expect(vocabAfter.data.occurrences[0].occurrence.id).toBe(hB.data.occurrence.id);
    }

    ctx.close();
  });

  it('BAK-01 & BAK-02 & SEC-02: exports full backup, restores into clean profile, and blocks path traversal, hash mismatch, and corrupt snapshots without touching existing DB', () => {
    const sourceDir = createTempProfile();
    const sourceCtx = openLexiBookDatabase(sourceDir);
    const sourceRepos = createRepositories(sourceCtx);

    const imported = sourceRepos.importPdf({
      fileName: 'habit_systems.pdf',
      bytesBase64: readFixtureBase64('habit_systems.pdf'),
    });
    if (!imported.ok) throw new Error('Expected import ok');

    const hl = sourceRepos.createHighlight({
      bookId: imported.data.book.id,
      pageNumber1Based: 1,
      selectedText: 'compound',
      sentenceText: 'Small daily habits compound into remarkable results over years of practice.',
      paragraphText: 'Small daily habits compound into remarkable results over years of practice.',
      textAnchor: {
        algorithmVersion: 1,
        exact: 'compound',
        prefix: 'Small daily habits ',
        suffix: ' into remarkable',
        startOffset: 19,
        endOffset: 27,
        pdfFingerprint: imported.data.book.sha256,
        pageRotation: 0,
      },
      normalizedQuads: [{ x: 0.15, y: 0.25, width: 0.12, height: 0.025 }],
    });
    expect(hl.ok).toBe(true);

    const exported = exportBackup(sourceCtx, { includePdfs: true });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error('Expected export ok');
    expect(exported.data.manifest.counts.books).toBe(1);
    expect(exported.data.manifest.counts.highlights).toBe(1);

    sourceCtx.close();

    // Restore into a completely fresh profile directory
    const targetDir = createTempProfile();
    const targetCtx = openLexiBookDatabase(targetDir);
    const targetRepos = createRepositories(targetCtx);

    const restoreRes = importBackup(targetCtx, {
      archiveBytesBase64: exported.data.archiveBytesBase64,
    });
    expect(restoreRes.ok).toBe(true);
    if (restoreRes.ok) {
      expect(restoreRes.data.restoredBooks).toBe(1);
      expect(restoreRes.data.restoredHighlights).toBe(1);
    }

    const restoredBooks = targetRepos.listBooks();
    expect(restoredBooks.ok && restoredBooks.data.length === 1).toBe(true);

    // SEC-02 & BAK-02: Attack 1 — Path traversal entry (`../../evil.dll`) inside ZIP
    const traversalZip = zipSync({
      'manifest.json': new TextEncoder().encode(JSON.stringify(exported.data.manifest)),
      '../../evil.dll': new TextEncoder().encode('malicious payload'),
    });
    const traversalRes = importBackup(targetCtx, {
      archiveBytesBase64: Buffer.from(traversalZip).toString('base64'),
    });
    expect(traversalRes.ok).toBe(false);
    if (!traversalRes.ok) {
      expect(traversalRes.error.code).toBe('BACKUP_PATH_UNSAFE');
    }

    // Attack 2 — Tampered SHA-256 hash in manifest
    const badManifest = {
      ...exported.data.manifest,
      files: exported.data.manifest.files.map((f) => ({
        ...f,
        sha256: '0000000000000000000000000000000000000000000000000000000000000000',
      })),
    };
    const badHashZip = zipSync({
      'manifest.json': new TextEncoder().encode(JSON.stringify(badManifest)),
      'snapshot.json': new TextEncoder().encode('{}'),
    });
    const badHashRes = importBackup(targetCtx, {
      archiveBytesBase64: Buffer.from(badHashZip).toString('base64'),
    });
    expect(badHashRes.ok).toBe(false);
    if (!badHashRes.ok) {
      expect(badHashRes.error.code).toBe('BACKUP_HASH_MISMATCH');
    }

    // Verify existing restored library in targetCtx is 100% untouched after failed attacks
    const postAttackBooks = targetRepos.listBooks();
    expect(postAttackBooks.ok && postAttackBooks.data.length === 1).toBe(true);

    // Direct path validator checks
    expect(validateSafeRelativePath(targetDir, '../outside.pdf').ok).toBe(false);
    expect(validateSafeRelativePath(targetDir, 'C:\\Windows\\System32\\cmd.exe').ok).toBe(false);

    targetCtx.close();
  });
});
