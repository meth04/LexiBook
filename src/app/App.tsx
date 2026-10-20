import React, { useCallback, useEffect, useState } from 'react';
import { LibraryScreen } from '../features/library/LibraryScreen';
import { ProgressScreen } from '../features/progress/ProgressScreen';
import { ReaderScreen } from '../features/reader/ReaderScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';
import { StudyScreen } from '../features/study/StudyScreen';
import { VocabularyScreen } from '../features/vocabulary/VocabularyScreen';
import { lexiBookClient } from '../shared/api/client';
import type { AppRoute, AppSettings } from '../shared/types/contracts';

const NAV_ITEMS: Array<{ route: AppRoute; labelVi: string }> = [
  { route: 'library', labelVi: 'Thư viện' },
  { route: 'reader', labelVi: 'Đọc sách' },
  { route: 'vocabulary', labelVi: 'Từ vựng' },
  { route: 'study', labelVi: 'Ôn tập' },
  { route: 'progress', labelVi: 'Tiến độ' },
  { route: 'settings', labelVi: 'Cài đặt' },
];

export const App: React.FC = () => {
  const [activeRoute, setActiveRoute] = useState<AppRoute>('library');
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [readerPageNumber, setReaderPageNumber] = useState<number | null>(null);
  const [focusedHighlightId, setFocusedHighlightId] = useState<string | null>(null);
  const [vocabBookFilterId, setVocabBookFilterId] = useState<string | null>(null);

  const [dueCount, setDueCount] = useState<number>(0);
  const [showOnboarding, setShowOnboarding] = useState<boolean>(true);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const refreshShellMetadata = useCallback(async () => {
    try {
      const [settingsRes, queueRes, booksRes] = await Promise.all([
        lexiBookClient.getAppSettings(),
        lexiBookClient.getStudyQueue(),
        lexiBookClient.listBooks(),
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
      className={`min-h-screen flex flex-col ${
        theme === 'dark' ? 'bg-stone-900 text-stone-100' : 'bg-[#FAF8F5] text-stone-900'
      }`}
    >
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-stone-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white font-bold flex items-center justify-center shadow-xs">
            L
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-stone-900">LexiBook AI</h1>
            <p className="text-xs text-stone-500">Đọc sách PDF tiếng Anh & học từ vựng theo ngữ cảnh</p>
          </div>
        </div>

        <nav aria-label="Điều hướng chính" className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const active = activeRoute === item.route;
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
                className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  active
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                }`}
              >
                <span>{item.labelVi}</span>
                {item.route === 'study' && dueCount > 0 && (
                  <span
                    data-testid="nav-due-badge"
                    className="px-1.5 py-0.5 text-[11px] font-bold bg-amber-200 text-amber-950 rounded-full"
                  >
                    {dueCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="flex-1">
        {activeRoute === 'library' && (
          <div className="p-6">
            <LibraryScreen
              onOpenBook={handleOpenBook}
              onOpenVocabularyForBook={handleOpenVocabularyForBook}
              showOnboarding={showOnboarding}
              onDismissOnboarding={() => void handleDismissOnboarding()}
            />
          </div>
        )}

        {activeRoute === 'reader' && (
          <div>
            {activeBookId ? (
              <ReaderScreen
                bookId={activeBookId}
                initialPageNumber={readerPageNumber}
                focusedHighlightId={focusedHighlightId}
                onBackToLibrary={() => setActiveRoute('library')}
                onOpenStudy={() => setActiveRoute('study')}
              />
            ) : (
              <div className="p-12 text-center space-y-3">
                <p className="text-base font-medium text-stone-700">
                  Chưa chọn cuốn sách nào để đọc.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveRoute('library')}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
                >
                  Quay lại Thư viện để mở sách
                </button>
              </div>
            )}
          </div>
        )}

        {activeRoute === 'vocabulary' && (
          <div className="p-6">
            <VocabularyScreen
              initialBookIdFilter={vocabBookFilterId}
              onJumpToOccurrence={handleJumpToOccurrence}
            />
          </div>
        )}

        {activeRoute === 'study' && (
          <StudyScreen onJumpToOccurrence={handleJumpToOccurrence} />
        )}

        {activeRoute === 'progress' && (
          <div className="p-6">
            <ProgressScreen
              onOpenBook={handleOpenBook}
              onStartStudy={() => setActiveRoute('study')}
            />
          </div>
        )}

        {activeRoute === 'settings' && (
          <div className="p-6">
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
