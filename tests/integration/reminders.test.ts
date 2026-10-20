import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openLexiBookDatabase, type LexiBookDbContext } from '../../src/backend/db';
import {
  dismissReminderToday,
  evaluateReminder,
  getReminderConfig,
  isWithinQuietHours,
  snoozeReminder,
  updateReminderConfig,
} from '../../src/backend/reminderService';
import { SettingsScreen } from '../../src/features/settings/SettingsScreen';
import type { LexiBookApi } from '../../src/shared/types/contracts';

function seedDueStudyCard(ctx: LexiBookDbContext, dueAtIso: string, enabled = 1): void {
  const nowIso = '2026-10-20T08:00:00.000Z';
  ctx.db
    .prepare(
      `INSERT INTO books (id, sha256, title, managed_path, page_count, last_page, last_scroll_offset, status, is_scan_only, added_at)
       VALUES ('book-1', 'sha-1', 'Deep Work', 'books/sha-1.pdf', 10, 1, 0, 'reading', 0, ?)`
    )
    .run(nowIso);

  ctx.db
    .prepare(
      `INSERT INTO highlights (id, book_id, page_number_1based, selected_text, sentence_text, paragraph_text, text_anchor_json, normalized_quads_json, anchor_signature, created_at)
       VALUES ('hl-1', 'book-1', 1, 'traction', 'Gain traction fast.', 'Gain traction fast.', '{}', '[]', 'sig-1', ?)`
    )
    .run(nowIso);

  ctx.db
    .prepare(
      `INSERT INTO lexemes (id, normalized_key, canonical_form, part_of_speech, created_at)
       VALUES ('lex-1', 'traction', 'traction', 'noun', ?)`
    )
    .run(nowIso);

  ctx.db
    .prepare(
      `INSERT INTO senses (id, lexeme_id, general_meanings_vi_json, contextual_meaning_vi, contextual_explanation_vi, source_excerpt, generation_state, user_edited_flags_json, created_at, updated_at)
       VALUES ('sense-1', 'lex-1', '["Sức kéo"]', 'Đà phát triển', 'Giải thích', 'Gain traction fast.', 'succeeded', '{}', ?, ?)`
    )
    .run(nowIso, nowIso);

  ctx.db
    .prepare(
      `INSERT INTO occurrences (id, lexeme_id, highlight_id, sense_id, created_at)
       VALUES ('occ-1', 'lex-1', 'hl-1', 'sense-1', ?)`
    )
    .run(nowIso);

  ctx.db
    .prepare(
      `INSERT INTO study_cards (id, sense_id, representative_occurrence_id, enabled, created_at, due_at, fsrs_state_json, is_mastered)
       VALUES ('card-1', 'sense-1', 'occ-1', ?, ?, ?, '{}', 0)`
    )
    .run(enabled, nowIso, dueAtIso);
}

describe('Windows Reminders & Settings Integration (NTF-01, NTF-02)', () => {
  let tempDir: string;
  let ctx: LexiBookDbContext;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexibook-reminders-test-'));
    ctx = openLexiBookDatabase(tempDir);
  });

  afterEach(() => {
    ctx.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('NTF-01: evaluates quiet hours (same-day and overnight crossing midnight) and triggers at most once per local date', () => {
    // Same-day quiet hours: 13:00 -> 15:00
    expect(isWithinQuietHours('13:30', '13:00', '15:00')).toBe(true);
    expect(isWithinQuietHours('12:59', '13:00', '15:00')).toBe(false);
    expect(isWithinQuietHours('15:00', '13:00', '15:00')).toBe(false);

    // Overnight quiet hours crossing midnight: 22:00 -> 07:00
    expect(isWithinQuietHours('23:30', '22:00', '07:00')).toBe(true);
    expect(isWithinQuietHours('06:15', '22:00', '07:00')).toBe(true);
    expect(isWithinQuietHours('20:00', '22:00', '07:00')).toBe(false);
    expect(isWithinQuietHours('07:00', '22:00', '07:00')).toBe(false);

    seedDueStudyCard(ctx, '2026-10-20T12:00:00.000Z');

    // Default config is disabled (opt-in required)
    const initialEval = evaluateReminder(ctx, {
      nowIso: '2026-10-20T13:05:00.000Z',
      localDate: '2026-10-20',
      localTimeHHmm: '20:05',
    });
    expect(initialEval).toEqual({
      shouldNotify: false,
      reason: 'disabled',
      dueCount: 1,
    });

    // Enable reminder for 20:00 with quiet hours 22:00 -> 07:00
    updateReminderConfig(ctx, {
      enabled: true,
      localTime: '20:00',
      quietStart: '22:00',
      quietEnd: '07:00',
      permissionState: 'granted',
    });

    // Before scheduled time (19:30 < 20:00)
    const beforeScheduled = evaluateReminder(ctx, {
      nowIso: '2026-10-20T12:30:00.000Z',
      localDate: '2026-10-20',
      localTimeHHmm: '19:30',
    });
    expect(beforeScheduled.shouldNotify).toBe(false);
    expect(beforeScheduled.reason).toBe('before_scheduled_time');

    // Inside overnight quiet hours (23:30)
    const inQuietHours = evaluateReminder(ctx, {
      nowIso: '2026-10-20T16:30:00.000Z',
      localDate: '2026-10-20',
      localTimeHHmm: '23:30',
    });
    expect(inQuietHours.shouldNotify).toBe(false);
    expect(inQuietHours.reason).toBe('quiet_hours');

    // Snooze for 30 minutes from 13:00Z -> 13:30Z
    snoozeReminder(ctx, 30, '2026-10-20T13:00:00.000Z');
    const whileSnoozed = evaluateReminder(ctx, {
      nowIso: '2026-10-20T13:15:00.000Z',
      localDate: '2026-10-20',
      localTimeHHmm: '20:15',
    });
    expect(whileSnoozed.shouldNotify).toBe(false);
    expect(whileSnoozed.reason).toBe('snoozed');

    // After snooze expires (13:35Z, local 20:35) -> triggers!
    const triggered = evaluateReminder(ctx, {
      nowIso: '2026-10-20T13:35:00.000Z',
      localDate: '2026-10-20',
      localTimeHHmm: '20:35',
    });
    expect(triggered).toEqual({
      shouldNotify: true,
      reason: 'triggered',
      dueCount: 1,
      notificationTitle: 'LexiBook AI — Đến giờ ôn tập từ vựng',
      notificationBody: 'Bạn có 1 thẻ từ vựng theo ngữ cảnh cần ôn hôm nay.',
    });

    // Second check on the same local date must not re-notify
    const secondCheckSameDay = evaluateReminder(ctx, {
      nowIso: '2026-10-20T14:00:00.000Z',
      localDate: '2026-10-20',
      localTimeHHmm: '21:00',
    });
    expect(secondCheckSameDay.shouldNotify).toBe(false);
    expect(secondCheckSameDay.reason).toBe('already_notified_today');

    // Next day dismiss prevents notification for that date
    dismissReminderToday(ctx, '2026-10-21');
    expect(getReminderConfig(ctx).lastNotifiedLocalDate).toBe('2026-10-21');
  });

  it('NTF-02: handles permission_denied, no_due_cards, and renders SettingsScreen with honest Windows tray disclosure & non-echoed BYOK key', async () => {
    seedDueStudyCard(ctx, '2026-10-20T12:00:00.000Z');
    updateReminderConfig(ctx, {
      enabled: true,
      localTime: '20:00',
      permissionState: 'denied',
    });

    const deniedEval = evaluateReminder(ctx, {
      nowIso: '2026-10-20T13:05:00.000Z',
      localDate: '2026-10-20',
      localTimeHHmm: '20:05',
    });
    expect(deniedEval).toEqual({
      shouldNotify: false,
      reason: 'permission_denied',
      dueCount: 1,
    });

    const setAiKeySpy = vi.fn().mockResolvedValue({
      ok: true,
      data: {
        hasKey: true,
        selectedModel: 'gemini-2.5-flash',
        supportedModels: ['gemini-2.5-flash', 'gemini-2.5-pro'],
        lastTestedAt: null,
        lastTestSuccess: true,
        cacheEntryCount: 3,
      },
    });

    const mockApi = {
      getAiKeyStatus: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          hasKey: false,
          selectedModel: 'gemini-2.5-flash',
          supportedModels: ['gemini-2.5-flash', 'gemini-2.5-pro'],
          lastTestedAt: null,
          lastTestSuccess: null,
          cacheEntryCount: 3,
        },
      }),
      setAiKey: setAiKeySpy,
      testAiConnection: vi.fn().mockResolvedValue({
        ok: true,
        data: { ok: true, modelId: 'gemini-2.5-flash', messageVi: 'Kết nối Gemini hợp lệ.' },
      }),
      deleteAiKey: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          hasKey: false,
          selectedModel: 'gemini-2.5-flash',
          supportedModels: ['gemini-2.5-flash', 'gemini-2.5-pro'],
          lastTestedAt: null,
          lastTestSuccess: null,
          cacheEntryCount: 3,
        },
      }),
      clearAiCache: vi.fn().mockResolvedValue({ ok: true, data: { clearedCount: 3 } }),
      getAppSettings: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          theme: 'light',
          defaultPdfScale: 1.0,
          defaultSidebarOpen: true,
          autoAnalyzeOnHighlight: true,
          autoAddToStudy: false,
          dailyNewLimit: 10,
          dailyReviewLimit: 50,
          preferredQuizMode: 'mixed',
          showStreakOnProgress: true,
          onboardingCompleted: false,
        },
      }),
      updateAppSettings: vi.fn(),
      getReminderConfig: vi.fn().mockResolvedValue({
        ok: true,
        data: getReminderConfig(ctx),
      }),
      updateReminderConfig: vi.fn(),
      snoozeReminder: vi.fn(),
      dismissReminderToday: vi.fn(),
      exportBackup: vi.fn().mockResolvedValue({
        ok: true,
        data: {
          archiveFileName: 'lexibook-backup.zip',
          archiveBytesBase64: 'UEsDBAoAAAAAA==',
          manifest: {
            formatVersion: 1,
            schemaVersion: 1,
            appVersion: '0.1.0',
            exportedAt: '2026-10-20T13:00:00.000Z',
            includePdfs: true,
            counts: {
              books: 1,
              highlights: 1,
              lexemes: 1,
              occurrences: 1,
              senses: 1,
              studyCards: 1,
              reviewEvents: 0,
            },
            files: [],
          },
        },
      }),
      importBackup: vi.fn(),
    } as unknown as LexiBookApi;

    render(React.createElement(SettingsScreen, { api: mockApi }));

    // Verify honest Windows tray/exit disclosure and permission denied warning
    const disclosure = await screen.findByTestId('windows-reminder-disclosure');
    expect(disclosure.textContent).toContain(
      'Lưu ý: Nhắc nhở hoạt động khi ứng dụng đang mở hoặc thu nhỏ xuống khay hệ thống (System Tray). Khi thoát hoàn toàn ứng dụng (Quit), bộ hẹn giờ nền sẽ dừng trừ khi bạn bật khởi động cùng Windows.'
    );
    expect(await screen.findByTestId('reminder-permission-denied-banner')).toBeInTheDocument();

    // Verify BYOK API key is submitted and never echoed back into input field
    const keyInput = screen.getByLabelText('Khóa Google Gemini API') as HTMLInputElement;
    fireEvent.change(keyInput, { target: { value: 'AIzaSyTestSecretKeyValue123456' } });
    fireEvent.click(screen.getByText('Lưu khóa API'));

    await waitFor(() => {
      expect(setAiKeySpy).toHaveBeenCalledWith('AIzaSyTestSecretKeyValue123456', 'gemini-2.5-flash');
    });
    expect(keyInput.value).toBe('');
    expect(screen.getByTestId('ai-key-status-badge').textContent).toContain(
      'Đã lưu khóa bảo mật trong Windows Credential Manager'
    );

    // Verify Backup export button works
    fireEvent.click(screen.getByText('Xuất bản sao lưu (.zip)'));
    expect(await screen.findByTestId('backup-export-summary')).toBeInTheDocument();
  });
});
