import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react';
import { lexiBookClient } from '../../shared/api/client';
import type {
  AiKeyStatus,
  AppSettings,
  ExportBackupResult,
  ImportBackupResult,
  LexiBookApi,
  ReminderConfig,
} from '../../shared/types/contracts';

export interface SettingsScreenProps {
  api?: LexiBookApi;
  onSettingsChanged?: (settings: AppSettings) => void;
  onBackupRestored?: (result: ImportBackupResult) => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  api = lexiBookClient,
  onSettingsChanged,
  onBackupRestored,
}) => {
  const [aiStatus, setAiStatus] = useState<AiKeyStatus>({
    hasKey: false,
    selectedModel: 'gemma-4-31b-it',
    supportedModels: [
      'gemma-4-31b-it',
      'gemini-3.5-flash-lite',
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-3.5-flash',
      'gemma-4-26b-a4b-it',
      'gemini-2.5-flash-lite',
    ],
    lastTestedAt: null,
    lastTestSuccess: null,
    cacheEntryCount: 0,
  });
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKeyText, setShowKeyText] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemma-4-31b-it');
  const [aiFeedbackVi, setAiFeedbackVi] = useState<string | null>(null);
  const [aiErrorVi, setAiErrorVi] = useState<string | null>(null);
  const [isBusyAi, setIsBusyAi] = useState(false);

  const [appSettings, setAppSettings] = useState<AppSettings>({
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
  });
  const [settingsFeedbackVi, setSettingsFeedbackVi] = useState<string | null>(null);

  const [reminderConfig, setReminderConfig] = useState<ReminderConfig>({
    enabled: false,
    localTime: '20:00',
    quietStart: '22:00',
    quietEnd: '07:00',
    autostartOptIn: false,
    lastNotifiedLocalDate: null,
    snoozedUntilIso: null,
    permissionState: 'prompt',
  });
  const [reminderFeedbackVi, setReminderFeedbackVi] = useState<string | null>(null);

  const [includePdfsInBackup, setIncludePdfsInBackup] = useState(true);
  const [restoreArchiveBase64, setRestoreArchiveBase64] = useState('');
  const [confirmRestoreChecked, setConfirmRestoreChecked] = useState(false);
  const [lastExportResult, setLastExportResult] = useState<ExportBackupResult | null>(null);
  const [lastRestoreResult, setLastRestoreResult] = useState<ImportBackupResult | null>(null);
  const [backupMessageVi, setBackupMessageVi] = useState<string | null>(null);
  const [backupErrorVi, setBackupErrorVi] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadAll() {
      const [keyRes, settingsRes, reminderRes] = await Promise.all([
        api.getAiKeyStatus(),
        api.getAppSettings(),
        api.getReminderConfig(),
      ]);

      if (!active) return;

      if (keyRes.ok) {
        setAiStatus(keyRes.data);
        setSelectedModel(keyRes.data.selectedModel || 'gemma-4-31b-it');
      }
      if (settingsRes.ok) {
        setAppSettings(settingsRes.data);
      }
      if (reminderRes.ok) {
        setReminderConfig(reminderRes.data);
      }
    }
    void loadAll();
    return () => {
      active = false;
    };
  }, [api]);

  const handleSaveApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setAiFeedbackVi(null);
    setAiErrorVi(null);
    setIsBusyAi(true);
    try {
      const res = await api.setAiKey(apiKeyInput.trim(), selectedModel);
      // Never echo the API key back into the input field
      setApiKeyInput('');
      if (res.ok) {
        setAiStatus(res.data);
        setAiFeedbackVi('Đã lưu cấu hình khóa API bảo mật.');
      } else {
        setAiErrorVi(res.error.messageVi);
      }
    } finally {
      setIsBusyAi(false);
    }
  };

  const handleTestAiConnection = async () => {
    setAiFeedbackVi(null);
    setAiErrorVi(null);
    setIsBusyAi(true);
    try {
      const res = await api.testAiConnection();
      if (res.ok) {
        setAiFeedbackVi(res.data.messageVi);
        const statusRes = await api.getAiKeyStatus();
        if (statusRes.ok) setAiStatus(statusRes.data);
      } else {
        setAiErrorVi(res.error.messageVi);
      }
    } finally {
      setIsBusyAi(false);
    }
  };

  const handleDeleteAiKey = async () => {
    setAiFeedbackVi(null);
    setAiErrorVi(null);
    setIsBusyAi(true);
    try {
      const res = await api.deleteAiKey();
      setApiKeyInput('');
      if (res.ok) {
        setAiStatus(res.data);
        setAiFeedbackVi('Đã xóa khóa API khỏi Windows Credential Manager.');
      } else {
        setAiErrorVi(res.error.messageVi);
      }
    } finally {
      setIsBusyAi(false);
    }
  };

  const handleClearAiCache = async () => {
    setAiFeedbackVi(null);
    setAiErrorVi(null);
    const res = await api.clearAiCache();
    if (res.ok) {
      setAiFeedbackVi(`Đã xóa ${res.data.clearedCount} mục bộ nhớ đệm AI.`);
      const statusRes = await api.getAiKeyStatus();
      if (statusRes.ok) setAiStatus(statusRes.data);
    } else {
      setAiErrorVi(res.error.messageVi);
    }
  };

  const handleUpdateSettings = async (partial: Partial<AppSettings>) => {
    setSettingsFeedbackVi(null);
    const res = await api.updateAppSettings(partial);
    if (res.ok) {
      setAppSettings(res.data);
      setSettingsFeedbackVi('Đã lưu cài đặt đọc sách & ôn tập.');
      onSettingsChanged?.(res.data);
    }
  };

  const handleUpdateReminder = async (partial: Partial<ReminderConfig>) => {
    setReminderFeedbackVi(null);
    const res = await api.updateReminderConfig(partial);
    if (res.ok) {
      setReminderConfig(res.data);
      setReminderFeedbackVi('Đã cập nhật cấu hình nhắc nhở.');
    }
  };

  const handleSnooze30Min = async () => {
    setReminderFeedbackVi(null);
    const res = await api.snoozeReminder(30, new Date().toISOString());
    if (res.ok) {
      setReminderConfig(res.data);
      setReminderFeedbackVi('Đã tạm hoãn nhắc nhở 30 phút.');
    }
  };

  const handleDismissToday = async () => {
    setReminderFeedbackVi(null);
    const todayLocal = new Date().toISOString().slice(0, 10);
    const res = await api.dismissReminderToday(todayLocal);
    if (res.ok) {
      setReminderConfig(res.data);
      setReminderFeedbackVi('Đã bỏ qua nhắc nhở cho hôm nay.');
    }
  };

  const handleExportBackup = async () => {
    setBackupMessageVi(null);
    setBackupErrorVi(null);
    const res = await api.exportBackup({ includePdfs: includePdfsInBackup });
    if (res.ok) {
      setLastExportResult(res.data);
      setRestoreArchiveBase64(res.data.archiveBytesBase64);
      setBackupMessageVi(`Đã tạo bản sao lưu ${res.data.archiveFileName} thành công.`);
    } else {
      setBackupErrorVi(res.error.messageVi);
    }
  };

  const handleImportBackupFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    setRestoreArchiveBase64(btoa(binary));
  };

  const handleImportBackup = async () => {
    setBackupMessageVi(null);
    setBackupErrorVi(null);
    if (!confirmRestoreChecked) {
      setBackupErrorVi('Vui lòng xác nhận trước khi khôi phục dữ liệu.');
      return;
    }
    if (!restoreArchiveBase64.trim()) {
      setBackupErrorVi('Vui lòng chọn tệp sao lưu (.zip) hợp lệ.');
      return;
    }

    const res = await api.importBackup({ archiveBytesBase64: restoreArchiveBase64.trim() });
    if (res.ok) {
      setLastRestoreResult(res.data);
      setBackupMessageVi(
        `Đã khôi phục ${res.data.restoredBooks} sách, ${res.data.restoredHighlights} đánh dấu và ${res.data.restoredStudyCards} thẻ ôn tập.`
      );
      onBackupRestored?.(res.data);
    } else {
      setBackupErrorVi(res.error.messageVi);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 text-[#18181B]" data-testid="settings-screen">
      <header className="bg-white border border-[#E4E1DA] rounded-2xl p-6 shadow-2xs">
        <h1 className="text-xl font-bold tracking-tight text-[#18181B]">
          Cài đặt hệ thống &amp; Quyền riêng tư
        </h1>
        <p className="mt-1 text-sm text-[#52525B]">
          Quản lý khóa Google AI Studio / Gemini BYOK, chế độ đọc PDF, lịch ôn tập FSRS, thông báo
          Windows và sao lưu cục bộ.
        </p>
      </header>

      {/* Section 1: Khóa API Gemini (BYOK) & Quyền riêng tư */}
      <section
        aria-labelledby="settings-ai-heading"
        className="rounded-2xl border border-[#E4E1DA] bg-white p-6 shadow-2xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#EEF2FF] text-[#3F51B5] flex items-center justify-center">
              <KeyRound className="w-4 h-4" />
            </div>
            <h2 id="settings-ai-heading" className="text-base font-bold text-[#18181B]">
              1. Khóa API Gemini (BYOK) &amp; Quyền riêng tư
            </h2>
          </div>
          <span
            data-testid="ai-key-status-badge"
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              aiStatus.hasKey
                ? 'bg-[#DCFCE7] text-[#166534] border border-[#22C55E]/30'
                : 'bg-[#FEF3C7] text-[#92400E] border border-[#F59E0B]/35'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            {aiStatus.hasKey
              ? 'Đã lưu khóa bảo mật trong Windows Credential Manager'
              : 'Chưa cấu hình khóa API'}
          </span>
        </div>

        <div className="mt-4 rounded-xl bg-[#FAF9F6] border border-[#E4E1DA] p-3.5 text-xs text-[#52525B] leading-relaxed">
          <strong className="text-[#18181B]">Cam kết quyền riêng tư:</strong> Toàn bộ tệp sách PDF,
          đánh dấu và lịch sử ôn tập luôn được lưu trữ cục bộ trên máy tính của bạn. Chỉ câu văn và
          đoạn văn ngắn xung quanh từ được bạn xác nhận đánh dấu mới được gửi tới Google Gemini để
          phân tích ngữ cảnh. Khóa API không bao giờ lưu trong cơ sở dữ liệu SQLite hay bản sao lưu.
        </div>

        <form onSubmit={handleSaveApiKey} className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="gemini-api-key-input"
                className="block text-xs font-semibold text-[#18181B] mb-1.5"
              >
                Khóa Google Gemini API
              </label>
              <div className="relative">
                <input
                  id="gemini-api-key-input"
                  type={showKeyText ? 'text' : 'password'}
                  autoComplete="off"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder={
                    aiStatus.hasKey
                      ? '•••••••••••••••• (Nhập mới để thay thế hoặc để trống khi chỉ đổi mô hình)'
                      : 'Nhập khóa từ Google AI Studio...'
                  }
                  className="w-full rounded-xl border border-[#D6D2C8] bg-[#FAF9F6] pl-3.5 pr-9 py-2 text-sm focus:bg-white focus:border-[#3F51B5]"
                />
                <button
                  type="button"
                  onClick={() => setShowKeyText((v) => !v)}
                  aria-label={showKeyText ? 'Ẩn khóa API' : 'Hiện khóa API'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#71717A] hover:text-[#18181B] cursor-pointer"
                >
                  {showKeyText ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="gemini-model-select"
                className="block text-xs font-semibold text-[#18181B] mb-1.5"
              >
                Mô hình Gemini / Gemma hỗ trợ
              </label>
              <select
                id="gemini-model-select"
                value={selectedModel}
                onChange={(e) => {
                  const nextModel = e.target.value;
                  setSelectedModel(nextModel);
                  if (aiStatus.hasKey) {
                    void api.setAiKey('', nextModel).then((res) => {
                      if (res.ok) {
                        setAiStatus(res.data);
                        setAiFeedbackVi(`Đã chuyển mô hình mặc định sang ${nextModel}.`);
                      }
                    });
                  }
                }}
                className="w-full rounded-xl border border-[#D6D2C8] bg-[#FAF9F6] px-3.5 py-2 text-sm text-[#18181B]"
              >
                {(aiStatus.supportedModels.length > 0
                  ? aiStatus.supportedModels
                  : ['gemma-4-31b-it', 'gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro']
                ).map((modelId) => (
                  <option key={modelId} value={modelId}>
                    {modelId}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="submit"
              disabled={isBusyAi}
              className="rounded-xl bg-[#3F51B5] px-4 py-2 text-xs font-semibold text-white hover:bg-[#32408F] disabled:opacity-50 cursor-pointer"
            >
              Lưu khóa API
            </button>
            <button
              type="button"
              disabled={isBusyAi}
              onClick={handleTestAiConnection}
              className="rounded-xl border border-[#E4E1DA] bg-white px-4 py-2 text-xs font-medium text-[#18181B] hover:bg-[#F3F1EC] disabled:opacity-50 cursor-pointer"
            >
              Kiểm tra kết nối
            </button>
            <button
              type="button"
              disabled={isBusyAi}
              onClick={handleDeleteAiKey}
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 cursor-pointer"
            >
              Xóa khóa API
            </button>
            <button
              type="button"
              onClick={handleClearAiCache}
              className="rounded-xl border border-[#E4E1DA] bg-white px-4 py-2 text-xs font-medium text-[#52525B] hover:bg-[#F3F1EC] cursor-pointer"
            >
              Xóa bộ nhớ đệm AI ({aiStatus.cacheEntryCount} mục)
            </button>
          </div>
        </form>

        {aiFeedbackVi && (
          <p role="status" className="mt-3 text-xs font-semibold text-[#15803D]">
            {aiFeedbackVi}
          </p>
        )}
        {aiErrorVi && (
          <p role="alert" className="mt-3 text-xs font-semibold text-[#DC2626]">
            {aiErrorVi}
          </p>
        )}
      </section>

      {/* Section 2: Cài đặt Đọc sách & Ôn tập (FSRS) */}
      <section
        aria-labelledby="settings-reading-study-heading"
        className="rounded-2xl border border-[#E4E1DA] bg-white p-6 shadow-2xs"
      >
        <h2 id="settings-reading-study-heading" className="text-base font-bold text-[#18181B]">
          2. Cài đặt Đọc sách &amp; Ôn tập (FSRS)
        </h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="settings-theme-select"
              className="block text-xs font-semibold text-[#18181B] mb-1.5"
            >
              Giao diện đọc sách
            </label>
            <select
              id="settings-theme-select"
              value={appSettings.theme}
              onChange={(e) =>
                void handleUpdateSettings({ theme: e.target.value as AppSettings['theme'] })
              }
              className="w-full rounded-xl border border-[#D6D2C8] bg-[#FAF9F6] px-3.5 py-2 text-sm"
            >
              <option value="light">Sáng ấm áp</option>
              <option value="dark">Tối dịu mắt</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="settings-pdf-scale"
              className="block text-xs font-semibold text-[#18181B] mb-1.5"
            >
              Tỷ lệ thu phóng PDF mặc định
            </label>
            <select
              id="settings-pdf-scale"
              value={String(appSettings.defaultPdfScale)}
              onChange={(e) =>
                void handleUpdateSettings({ defaultPdfScale: Number(e.target.value) })
              }
              className="w-full rounded-xl border border-[#D6D2C8] bg-[#FAF9F6] px-3.5 py-2 text-sm"
            >
              <option value="0.75">75%</option>
              <option value="1">100%</option>
              <option value="1.25">125%</option>
              <option value="1.5">150%</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="settings-daily-new-limit"
              className="block text-xs font-semibold text-[#18181B] mb-1.5"
            >
              Số thẻ mới tối đa mỗi ngày
            </label>
            <input
              id="settings-daily-new-limit"
              type="number"
              min={1}
              max={200}
              value={appSettings.dailyNewLimit}
              onChange={(e) =>
                void handleUpdateSettings({
                  dailyNewLimit: Math.max(1, Number(e.target.value) || 10),
                })
              }
              className="w-full rounded-xl border border-[#D6D2C8] bg-[#FAF9F6] px-3.5 py-2 text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="settings-daily-review-limit"
              className="block text-xs font-semibold text-[#18181B] mb-1.5"
            >
              Số lượt ôn tối đa mỗi ngày
            </label>
            <input
              id="settings-daily-review-limit"
              type="number"
              min={1}
              max={500}
              value={appSettings.dailyReviewLimit}
              onChange={(e) =>
                void handleUpdateSettings({
                  dailyReviewLimit: Math.max(1, Number(e.target.value) || 50),
                })
              }
              className="w-full rounded-xl border border-[#D6D2C8] bg-[#FAF9F6] px-3.5 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-4 space-y-2.5">
          <label className="flex items-center gap-2.5 text-sm text-[#18181B] cursor-pointer">
            <input
              type="checkbox"
              checked={appSettings.autoAnalyzeOnHighlight}
              onChange={(e) =>
                void handleUpdateSettings({ autoAnalyzeOnHighlight: e.target.checked })
              }
              className="rounded border-[#D6D2C8]"
            />
            <span>Tự động phân tích AI sau khi xác nhận đánh dấu</span>
          </label>

          <label className="flex items-center gap-2.5 text-sm text-[#18181B] cursor-pointer">
            <input
              type="checkbox"
              checked={appSettings.autoAddToStudy}
              onChange={(e) => void handleUpdateSettings({ autoAddToStudy: e.target.checked })}
              className="rounded border-[#D6D2C8]"
            />
            <span>Tự động thêm vào danh sách Ôn tập</span>
          </label>
        </div>

        {settingsFeedbackVi && (
          <p role="status" className="mt-3 text-xs font-semibold text-[#15803D]">
            {settingsFeedbackVi}
          </p>
        )}
      </section>

      {/* Section 3: Nhắc nhở Ôn tập trên Windows (Opt-in) */}
      <section
        aria-labelledby="settings-reminders-heading"
        className="rounded-2xl border border-[#E4E1DA] bg-white p-6 shadow-2xs"
      >
        <h2 id="settings-reminders-heading" className="text-base font-bold text-[#18181B]">
          3. Nhắc nhở Ôn tập trên Windows (Opt-in)
        </h2>

        <div
          data-testid="windows-reminder-disclosure"
          className="mt-3 rounded-xl border border-[#F59E0B]/35 bg-[#FEF3C7]/60 p-3.5 text-xs text-[#92400E]"
        >
          Lưu ý: Nhắc nhở hoạt động khi ứng dụng đang mở hoặc thu nhỏ xuống khay hệ thống (System
          Tray). Khi thoát hoàn toàn ứng dụng (Quit), bộ hẹn giờ nền sẽ dừng trừ khi bạn bật khởi
          động cùng Windows.
        </div>

        {reminderConfig.permissionState === 'denied' && (
          <div
            role="alert"
            data-testid="reminder-permission-denied-banner"
            className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-900"
          >
            Quyền thông báo Windows đang bị từ chối. Huy hiệu (badge) báo số thẻ đến hạn trong ứng
            dụng vẫn hoạt động ngoại tuyến bình thường mà không cần quyền thông báo hệ điều hành.
          </div>
        )}

        <div className="mt-4 space-y-2.5">
          <label className="flex items-center gap-2.5 text-sm font-medium text-[#18181B] cursor-pointer">
            <input
              type="checkbox"
              checked={reminderConfig.enabled}
              onChange={(e) => void handleUpdateReminder({ enabled: e.target.checked })}
              className="rounded border-[#D6D2C8]"
            />
            <span>Bật nhắc nhở ôn tập hằng ngày</span>
          </label>

          <label className="flex items-center gap-2.5 text-sm text-[#52525B] cursor-pointer">
            <input
              type="checkbox"
              checked={reminderConfig.autostartOptIn}
              onChange={(e) => void handleUpdateReminder({ autostartOptIn: e.target.checked })}
              className="rounded border-[#D6D2C8]"
            />
            <span>Khởi động cùng Windows (Opt-in)</span>
          </label>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label
              htmlFor="reminder-local-time"
              className="block text-xs font-semibold text-[#18181B] mb-1.5"
            >
              Giờ nhắc
            </label>
            <input
              id="reminder-local-time"
              type="time"
              value={reminderConfig.localTime}
              onChange={(e) => void handleUpdateReminder({ localTime: e.target.value })}
              className="w-full rounded-xl border border-[#D6D2C8] bg-[#FAF9F6] px-3.5 py-2 text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="reminder-quiet-start"
              className="block text-xs font-semibold text-[#18181B] mb-1.5"
            >
              Giờ yên lặng (Bắt đầu)
            </label>
            <input
              id="reminder-quiet-start"
              type="time"
              value={reminderConfig.quietStart ?? ''}
              onChange={(e) =>
                void handleUpdateReminder({ quietStart: e.target.value || null })
              }
              className="w-full rounded-xl border border-[#D6D2C8] bg-[#FAF9F6] px-3.5 py-2 text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="reminder-quiet-end"
              className="block text-xs font-semibold text-[#18181B] mb-1.5"
            >
              Giờ yên lặng (Kết thúc)
            </label>
            <input
              id="reminder-quiet-end"
              type="time"
              value={reminderConfig.quietEnd ?? ''}
              onChange={(e) => void handleUpdateReminder({ quietEnd: e.target.value || null })}
              className="w-full rounded-xl border border-[#D6D2C8] bg-[#FAF9F6] px-3.5 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleSnooze30Min}
            className="rounded-xl border border-[#E4E1DA] bg-white px-4 py-2 text-xs font-medium text-[#18181B] hover:bg-[#F3F1EC] cursor-pointer"
          >
            Tạm hoãn 30 phút (Snooze)
          </button>
          <button
            type="button"
            onClick={handleDismissToday}
            className="rounded-xl border border-[#E4E1DA] bg-white px-4 py-2 text-xs font-medium text-[#18181B] hover:bg-[#F3F1EC] cursor-pointer"
          >
            Bỏ qua hôm nay (Dismiss)
          </button>
        </div>

        {reminderFeedbackVi && (
          <p role="status" className="mt-3 text-xs font-semibold text-[#15803D]">
            {reminderFeedbackVi}
          </p>
        )}
      </section>

      {/* Section 4: Sao lưu & Khôi phục Dữ liệu Cục bộ */}
      <section
        aria-labelledby="settings-backup-heading"
        className="rounded-2xl border border-[#E4E1DA] bg-white p-6 shadow-2xs"
      >
        <h2 id="settings-backup-heading" className="text-base font-bold text-[#18181B]">
          4. Sao lưu &amp; Khôi phục Dữ liệu Cục bộ
        </h2>

        <p className="mt-1.5 text-xs text-[#52525B]">
          Quá trình khôi phục kiểm tra tính toàn vẹn mã băm SHA-256 trong thư mục tạm (staging
          folder) trước khi áp dụng và không bao giờ bao gồm khóa API Gemini.
        </p>

        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-2.5 text-sm text-[#18181B] cursor-pointer">
            <input
              type="checkbox"
              checked={includePdfsInBackup}
              onChange={(e) => setIncludePdfsInBackup(e.target.checked)}
              className="rounded border-[#D6D2C8]"
            />
            <span>Bao gồm các tệp sách PDF trong bản sao lưu</span>
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleExportBackup}
              className="rounded-xl bg-[#3F51B5] px-4 py-2 text-xs font-semibold text-white hover:bg-[#32408F] cursor-pointer"
            >
              Xuất bản sao lưu (.zip)
            </button>
          </div>

          {lastExportResult && (
            <div
              data-testid="backup-export-summary"
              className="rounded-xl border border-[#22C55E]/35 bg-[#DCFCE7]/50 p-3 text-xs text-[#166534]"
            >
              Đã xuất: <strong>{lastExportResult.archiveFileName}</strong> (
              {lastExportResult.manifest.counts.books} sách,{' '}
              {lastExportResult.manifest.counts.highlights} đánh dấu,{' '}
              {lastExportResult.manifest.counts.studyCards} thẻ ôn tập)
            </div>
          )}
        </div>

        <div className="mt-6 border-t border-[#E4E1DA] pt-4 space-y-3">
          <div>
            <label
              htmlFor="backup-file-input"
              className="block text-xs font-semibold text-[#18181B] mb-1.5"
            >
              Chọn tệp sao lưu (.zip) để khôi phục
            </label>
            <input
              id="backup-file-input"
              type="file"
              accept=".zip,application/zip"
              onChange={(e) => void handleImportBackupFileChange(e)}
              className="mt-1 block w-full text-xs text-[#52525B]"
            />
          </div>

          <label className="flex items-center gap-2.5 text-xs text-[#52525B] cursor-pointer">
            <input
              type="checkbox"
              checked={confirmRestoreChecked}
              onChange={(e) => setConfirmRestoreChecked(e.target.checked)}
              className="rounded border-[#D6D2C8]"
            />
            <span>
              Tôi xác nhận khôi phục dữ liệu từ bản sao lưu (xác thực SHA-256 trong thư mục
              staging, không ghi đè khóa API).
            </span>
          </label>

          <button
            type="button"
            onClick={handleImportBackup}
            className="rounded-xl border border-[#E4E1DA] bg-white px-4 py-2 text-xs font-medium text-[#18181B] hover:bg-[#F3F1EC] cursor-pointer"
          >
            Khôi phục từ bản sao lưu
          </button>

          {lastRestoreResult && (
            <div
              data-testid="backup-restore-summary"
              className="rounded-xl border border-[#22C55E]/35 bg-[#DCFCE7]/50 p-3 text-xs text-[#166534]"
            >
              Khôi phục thành công: {lastRestoreResult.restoredBooks} sách,{' '}
              {lastRestoreResult.restoredHighlights} đánh dấu,{' '}
              {lastRestoreResult.restoredStudyCards} thẻ ôn tập.
            </div>
          )}
        </div>

        {backupMessageVi && (
          <p role="status" className="mt-3 text-xs font-semibold text-[#15803D]">
            {backupMessageVi}
          </p>
        )}
        {backupErrorVi && (
          <p role="alert" className="mt-3 text-xs font-semibold text-[#DC2626]">
            {backupErrorVi}
          </p>
        )}
      </section>
    </div>
  );
};
