import type { LexiBookDbContext } from './db';
import type {
  AppSettings,
  ReminderConfig,
  ReminderEvaluateInput,
  ReminderEvaluationResult,
} from '../shared/types/contracts';

interface ReminderConfigRow {
  enabled: number;
  local_time: string;
  quiet_start: string | null;
  quiet_end: string | null;
  autostart_opt_in: number;
  last_notified_local_date: string | null;
  snoozed_until_iso: string | null;
  permission_state: 'granted' | 'denied' | 'prompt';
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
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
};

/**
 * Reads the singleton `reminder_config` row (`id = 1`) from SQLite.
 */
export function getReminderConfig(ctx: LexiBookDbContext): ReminderConfig {
  const row = ctx.db
    .prepare(
      `SELECT enabled, local_time, quiet_start, quiet_end, autostart_opt_in,
              last_notified_local_date, snoozed_until_iso, permission_state
       FROM reminder_config
       WHERE id = 1`
    )
    .get() as ReminderConfigRow | undefined;

  if (!row) {
    ctx.db
      .prepare(
        `INSERT OR IGNORE INTO reminder_config (
          id, enabled, local_time, quiet_start, quiet_end, autostart_opt_in,
          last_notified_local_date, snoozed_until_iso, permission_state
        ) VALUES (1, 0, '20:00', '22:00', '07:00', 0, NULL, NULL, 'prompt')`
      )
      .run();
    return {
      enabled: false,
      localTime: '20:00',
      quietStart: '22:00',
      quietEnd: '07:00',
      autostartOptIn: false,
      lastNotifiedLocalDate: null,
      snoozedUntilIso: null,
      permissionState: 'prompt',
    };
  }

  return {
    enabled: Boolean(row.enabled),
    localTime: row.local_time,
    quietStart: row.quiet_start ?? null,
    quietEnd: row.quiet_end ?? null,
    autostartOptIn: Boolean(row.autostart_opt_in),
    lastNotifiedLocalDate: row.last_notified_local_date ?? null,
    snoozedUntilIso: row.snoozed_until_iso ?? null,
    permissionState: row.permission_state,
  };
}

/**
 * Updates the singleton `reminder_config` row (`id = 1`) and returns the persisted state.
 */
export function updateReminderConfig(
  ctx: LexiBookDbContext,
  partial: Partial<ReminderConfig>
): ReminderConfig {
  const current = getReminderConfig(ctx);
  const next: ReminderConfig = {
    enabled: partial.enabled !== undefined ? partial.enabled : current.enabled,
    localTime: partial.localTime !== undefined ? partial.localTime : current.localTime,
    quietStart: partial.quietStart !== undefined ? partial.quietStart : current.quietStart,
    quietEnd: partial.quietEnd !== undefined ? partial.quietEnd : current.quietEnd,
    autostartOptIn:
      partial.autostartOptIn !== undefined ? partial.autostartOptIn : current.autostartOptIn,
    lastNotifiedLocalDate:
      partial.lastNotifiedLocalDate !== undefined
        ? partial.lastNotifiedLocalDate
        : current.lastNotifiedLocalDate,
    snoozedUntilIso:
      partial.snoozedUntilIso !== undefined ? partial.snoozedUntilIso : current.snoozedUntilIso,
    permissionState:
      partial.permissionState !== undefined ? partial.permissionState : current.permissionState,
  };

  ctx.db
    .prepare(
      `UPDATE reminder_config
       SET enabled = ?,
           local_time = ?,
           quiet_start = ?,
           quiet_end = ?,
           autostart_opt_in = ?,
           last_notified_local_date = ?,
           snoozed_until_iso = ?,
           permission_state = ?
       WHERE id = 1`
    )
    .run(
      next.enabled ? 1 : 0,
      next.localTime,
      next.quietStart,
      next.quietEnd,
      next.autostartOptIn ? 1 : 0,
      next.lastNotifiedLocalDate,
      next.snoozedUntilIso,
      next.permissionState
    );

  return getReminderConfig(ctx);
}

/**
 * Evaluates whether `localTimeHHmm` ("HH:mm") falls within `[quietStart, quietEnd)`.
 * Handles both same-day intervals (e.g. "13:00" to "15:00") and overnight intervals
 * crossing midnight (e.g. "22:00" to "07:00", where "23:30" and "06:15" are inside quiet hours,
 * and "20:00" is outside).
 */
export function isWithinQuietHours(
  localTimeHHmm: string,
  quietStart: string | null,
  quietEnd: string | null
): boolean {
  if (!quietStart || !quietEnd || quietStart === quietEnd) {
    return false;
  }

  if (quietStart < quietEnd) {
    return localTimeHHmm >= quietStart && localTimeHHmm < quietEnd;
  }

  // Overnight interval crossing midnight (e.g. 22:00 -> 07:00)
  return localTimeHHmm >= quietStart || localTimeHHmm < quietEnd;
}

/**
 * Deterministically evaluates whether a Windows study reminder should fire at `input`.
 * When triggered and `triggerSideEffect` is true, records `last_notified_local_date = input.localDate`
 * and clears `snoozed_until_iso` so the user is notified at most once per local date.
 */
export function evaluateReminder(
  ctx: LexiBookDbContext,
  input: ReminderEvaluateInput,
  triggerSideEffect = true
): ReminderEvaluationResult {
  const config = getReminderConfig(ctx);

  const countRow = ctx.db
    .prepare('SELECT COUNT(*) AS cnt FROM study_cards WHERE enabled = 1 AND due_at <= ?')
    .get(input.nowIso) as { cnt: number } | undefined;
  const dueCount = Number(countRow?.cnt ?? 0);

  if (!config.enabled) {
    return { shouldNotify: false, reason: 'disabled', dueCount };
  }

  if (config.permissionState === 'denied') {
    return { shouldNotify: false, reason: 'permission_denied', dueCount };
  }

  if (dueCount === 0) {
    return { shouldNotify: false, reason: 'no_due_cards', dueCount: 0 };
  }

  if (config.snoozedUntilIso && input.nowIso < config.snoozedUntilIso) {
    return { shouldNotify: false, reason: 'snoozed', dueCount };
  }

  if (config.lastNotifiedLocalDate === input.localDate) {
    return { shouldNotify: false, reason: 'already_notified_today', dueCount };
  }

  if (isWithinQuietHours(input.localTimeHHmm, config.quietStart, config.quietEnd)) {
    return { shouldNotify: false, reason: 'quiet_hours', dueCount };
  }

  if (input.localTimeHHmm < config.localTime) {
    return { shouldNotify: false, reason: 'before_scheduled_time', dueCount };
  }

  if (triggerSideEffect) {
    updateReminderConfig(ctx, {
      lastNotifiedLocalDate: input.localDate,
      snoozedUntilIso: null,
    });
  }

  return {
    shouldNotify: true,
    reason: 'triggered',
    dueCount,
    notificationTitle: 'LexiBook AI — Đến giờ ôn tập từ vựng',
    notificationBody: `Bạn có ${dueCount} thẻ từ vựng theo ngữ cảnh cần ôn hôm nay.`,
  };
}

/**
 * Snoozes notifications for `minutes` starting from `nowIso`.
 */
export function snoozeReminder(
  ctx: LexiBookDbContext,
  minutes: number,
  nowIso: string = new Date().toISOString()
): ReminderConfig {
  const safeMinutes = Math.max(1, Math.round(minutes));
  const baseMs = new Date(nowIso).getTime();
  const snoozedUntilIso = new Date(baseMs + safeMinutes * 60_000).toISOString();
  return updateReminderConfig(ctx, { snoozedUntilIso });
}

/**
 * Dismisses notifications for the remainder of `localDate` ("YYYY-MM-DD").
 */
export function dismissReminderToday(
  ctx: LexiBookDbContext,
  localDate: string
): ReminderConfig {
  return updateReminderConfig(ctx, {
    lastNotifiedLocalDate: localDate,
    snoozedUntilIso: null,
  });
}

/**
 * Reads persisted `AppSettings` from `app_settings` table, merging with defaults.
 */
export function getAppSettings(ctx: LexiBookDbContext): AppSettings {
  const row = ctx.db
    .prepare('SELECT value_json FROM app_settings WHERE key = ?')
    .get('app_settings') as { value_json: string } | undefined;

  if (!row) {
    return { ...DEFAULT_APP_SETTINGS };
  }

  try {
    const parsed = JSON.parse(row.value_json) as Partial<AppSettings>;
    return {
      ...DEFAULT_APP_SETTINGS,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

/**
 * Updates persisted `AppSettings` in `app_settings` table.
 */
export function updateAppSettings(
  ctx: LexiBookDbContext,
  partial: Partial<AppSettings>
): AppSettings {
  const next: AppSettings = {
    ...getAppSettings(ctx),
    ...partial,
  };

  ctx.db
    .prepare(
      `INSERT INTO app_settings (key, value_json)
       VALUES ('app_settings', ?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json`
    )
    .run(JSON.stringify(next));

  return next;
}
