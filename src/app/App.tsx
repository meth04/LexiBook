import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  BookMarked,
  BookOpen,
  GraduationCap,
  Library,
  Moon,
  Settings,
  Sparkles,
  Sun,
} from 'lucide-react';
import { LibraryScreen } from '../features/library/LibraryScreen';
import { ProgressScreen } from '../features/progress/ProgressScreen';
import { ReaderScreen } from '../features/reader/ReaderScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';
import { StudyScreen } from '../features/study/StudyScreen';
import { VocabularyScreen } from '../features/vocabulary/VocabularyScreen';
import { lexiBookClient } from '../shared/api/client';
import type { AppRoute, AppSettings } from '../shared/types/contracts';

const NAV_ITEMS: Array<{
  route: AppRoute;
  labelVi: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { route: 'library', labelVi: 'Thư viện', icon: Library },
  { route: 'reader', labelVi: 'Đọc sách', icon: BookOpen },
  { route: 'vocabulary', labelVi: 'Từ vựng', icon: BookMarked },
  { route: 'study', labelVi: 'Ôn tập', icon: GraduationCap },
  { route: 'progress', labelVi: 'Tiến độ', icon: BarChart3 },
  { route: 'settings', labelVi: 'Cài đặt', icon: Settings },
];

export const App: React.FC = () => {
  const [activeRoute, setActiveRoute] = useState<AppRoute>('library');
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [readerPageNumber, setReaderPageNumber] = useState<number | null>(null);
  const [focusedHighlightId, setFocusedHighlightId] = useState<string | null>(null);
  const [vocabBookFilterId, setVocabBookFilterId] = useState<string | null>(null);

  const [dueCount, setDueCount] = useState<number>(0);
  const [hasAiKey, setHasAiKey] = useState<boolean>(false);
  const [activeModel, setActiveModel] = useState<string>('gemma-4-31b-it');
  const [showOnboarding, setShowOnboarding] = useState<boolean>(true);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const refreshShellMetadata = useCallback(async () => {
    try {
      const [settingsRes, queueRes, booksRes, aiRes] = await Promise.all([
        lexiBookClient.getAppSettings(),
        lexiBookClient.getStudyQueue(),
        lexiBookClient.listBooks(),
        lexiBookClient.getAiKeyStatus(),
      ]);

      if (settingsRes.ok) {
        setShowOnboarding(!settingsRes.data.onboardingCompleted);
        setTheme(settingsRes.data.theme);
      }

      if (queueRes.ok) {
        setDueCount(queueRes.data.totalDueCount + queueRes.data.totalNewAvailableCount);
      }

      if (booksRes.ok && booksRes.data.length > 0 && !activeBookId) {
        setActiveBookId(booksRes.data[0].id);
      }

      if (aiRes.ok) {
        setHasAiKey(aiRes.data.hasKey);
        setActiveModel(aiRes.data.selectedModel || 'gemma-4-31b-it');
      }
    } catch {
      // ignore if backend not yet attached in unit test
    }
  }, [activeBookId]);

  useEffect(() => {
    void refreshShellMetadata();
  }, [refreshShellMetadata, activeRoute]);

  const handleDismissOnboarding = async () => {
    setShowOnboarding(false);
    await lexiBookClient.updateAppSettings({ onboardingCompleted: true });
  };

  const handleToggleTheme = async () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    await lexiBookClient.updateAppSettings({ theme: nextTheme });
  };

  const handleOpenBook = (bookId: string) => {
    setActiveBookId(bookId);
    setReaderPageNumber(null);
    setFocusedHighlightId(null);
    setActiveRoute('reader');
  };

  const handleOpenVocabularyForBook = (bookId: string) => {
    setVocabBookFilterId(bookId);
    setActiveRoute('vocabulary');
  };

  const handleJumpToOccurrence = (
    bookId: string,
    pageNumber1Based: number,
    highlightId: string
  ) => {
    setActiveBookId(bookId);
    setReaderPageNumber(pageNumber1Based);
    setFocusedHighlightId(highlightId);
    setActiveRoute('reader');
  };

  const handleSettingsChanged = (nextSettings: AppSettings) => {
    setTheme(nextSettings.theme);
    setShowOnboarding(!nextSettings.onboardingCompleted);
  };

  return (
    <div
      data-theme={theme}
      className={`min-h-screen flex flex-col transition-colors ${
        theme === 'dark' ? 'dark bg-[#121316] text-stone-100' : 'bg-[#F7F5F0] text-[#18181B]'
      }`}
    >
      <header className="sticky top-0 z-30 h-14 bg-white/95 backdrop-blur-md border-b border-[#E4E1DA] px-5 flex items-center justify-between gap-4 shadow-2xs">
        <button
          type="button"
          onClick={() => setActiveRoute('library')}
          className="flex items-center gap-3 text-left group cursor-pointer focus:outline-none"
        >
          <div className="w-8 h-8 rounded-xl bg-[#3F51B5] text-white font-bold text-sm flex items-center justify-center shadow-xs group-hover:bg-[#32408F] transition-colors">
            L
          </div>
          <div className="hidden sm:block">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-[#18181B]">LexiBook AI</h1>
              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#EEF2FF] text-[#3F51B5]">
                Desktop
              </span>
            </div>
            <p className="text-[11px] text-[#52525B] leading-tight">
              Đọc PDF tiếng Anh &amp; học từ vựng theo ngữ cảnh
            </p>
          </div>
        </button>

        <nav
          aria-label="Điều hướng chính"
          className="flex items-center gap-1 bg-[#F3F1EC] p-1 rounded-xl border border-[#E4E1DA]/70"
        >
          {NAV_ITEMS.map((item) => {
            const active = activeRoute === item.route;
            const Icon = item.icon;
            return (
              <button
                key={item.route}
                type="button"
                data-testid={`nav-${item.route}`}
                onClick={() => {
                  if (item.route !== 'vocabulary') {
                    setVocabBookFilterId(null);
                  }
                  setActiveRoute(item.route);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                  active
                    ? 'bg-white text-[#3F51B5] font-semibold shadow-2xs'
                    : 'text-[#52525B] hover:text-[#18181B] hover:bg-white/50'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-[#3F51B5]' : 'text-[#71717A]'}`} />
                <span>{item.labelVi}</span>
                {item.route === 'study' && dueCount > 0 && (
                  <span
                    data-testid="nav-due-badge"
                    className="px-1.5 py-0.2 text-[10px] font-bold bg-[#FEF3C7] text-[#92400E] border border-[#F59E0B]/40 rounded-full"
                  >
                    {dueCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="hidden md:flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveRoute('settings')}
            title="Cấu hình mô hình AI & Khóa API"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors cursor-pointer ${
              hasAiKey
                ? 'bg-[#EEF2FF] text-[#3730A3] border-[#6366F1]/25 hover:bg-[#E0E7FF]'
                : 'bg-[#FEF3C7]/70 text-[#92400E] border-[#F59E0B]/30 hover:bg-[#FEF3C7]'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            <span>{hasAiKey ? activeModel : 'Chưa gắn khóa AI'}</span>
          </button>

          <button
            type="button"
            onClick={() => void handleToggleTheme()}
            aria-label={theme === 'light' ? 'Chuyển sang giao diện tối' : 'Chuyển sang giao diện sáng'}
            title={theme === 'light' ? 'Chế độ tối dịu mắt' : 'Chế độ sáng ấm áp'}
            className="p-1.5 rounded-lg border border-[#E4E1DA] bg-white text-[#52525B] hover:bg-[#F3F1EC] hover:text-[#18181B] transition-colors cursor-pointer"
          >
            {theme === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col">
        {activeRoute === 'library' && (
          <div className="p-6 flex-1">
            <LibraryScreen
              onOpenBook={handleOpenBook}
              onOpenVocabularyForBook={handleOpenVocabularyForBook}
              showOnboarding={showOnboarding}
              onDismissOnboarding={() => void handleDismissOnboarding()}
              onOpenSettings={() => setActiveRoute('settings')}
            />
          </div>
        )}

        {activeRoute === 'reader' && (
          <div className="flex-1 flex flex-col">
            {activeBookId ? (
              <ReaderScreen
                bookId={activeBookId}
                initialPageNumber={readerPageNumber}
                focusedHighlightId={focusedHighlightId}
                onBackToLibrary={() => setActiveRoute('library')}
                onOpenStudy={() => setActiveRoute('study')}
              />
            ) : (
              <div className="m-auto max-w-md p-10 text-center bg-white rounded-2xl border border-[#E4E1DA] shadow-xs space-y-4">
                <div className="mx-auto w-12 h-12 rounded-2xl bg-[#EEF2FF] text-[#3F51B5] flex items-center justify-center">
                  <BookOpen className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-base font-semibold text-[#18181B]">
                    Chưa chọn cuốn sách nào để đọc
                  </p>
                  <p className="text-xs text-[#52525B]">
                    Hãy mở một cuốn sách PDF tiếng Anh từ Thư viện hoặc nhập tệp PDF mới từ máy tính.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveRoute('library')}
                  className="px-4 py-2 bg-[#3F51B5] text-white text-sm font-medium rounded-lg hover:bg-[#32408F] transition-colors cursor-pointer"
                >
                  Quay lại Thư viện để mở sách
                </button>
              </div>
            )}
          </div>
        )}

        {activeRoute === 'vocabulary' && (
          <div className="p-6 flex-1">
            <VocabularyScreen
              initialBookIdFilter={vocabBookFilterId}
              onJumpToOccurrence={handleJumpToOccurrence}
            />
          </div>
        )}

        {activeRoute === 'study' && (
          <div className="flex-1">
            <StudyScreen onJumpToOccurrence={handleJumpToOccurrence} />
          </div>
        )}

        {activeRoute === 'progress' && (
          <div className="p-6 flex-1">
            <ProgressScreen
              onOpenBook={handleOpenBook}
              onStartStudy={() => setActiveRoute('study')}
            />
          </div>
        )}

        {activeRoute === 'settings' && (
          <div className="p-6 flex-1">
            <SettingsScreen
              onSettingsChanged={handleSettingsChanged}
              onBackupRestored={() => void refreshShellMetadata()}
            />
          </div>
        )}
      </main>
    </div>
  );
};
