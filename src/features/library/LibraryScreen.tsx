import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookMarked,
  BookOpen,
  CheckCircle2,
  Edit3,
  FileText,
  FolderPlus,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { lexiBookClient } from '../../shared/api/client';
import type { Book, BookStatus } from '../../shared/types/contracts';
import {
  Badge,
  Button,
  EmptyState,
  ErrorBanner,
  Modal,
  OnboardingBanner,
} from '../../shared/ui/components';

export interface LibraryScreenProps {
  onOpenBook: (bookId: string) => void;
  onOpenVocabularyForBook: (bookId: string) => void;
  showOnboarding?: boolean;
  onDismissOnboarding?: () => void;
  onOpenSettings?: () => void;
}

interface PendingDuplicateState {
  fileName: string;
  bytesBase64: string;
  existingBook: Book;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return typeof btoa === 'function' ? btoa(binary) : '';
}

async function readFileAsBase64(file: File): Promise<string> {
  if (typeof file.arrayBuffer === 'function') {
    const buffer = await file.arrayBuffer();
    return arrayBufferToBase64(buffer);
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        const commaIdx = result.indexOf(',');
        resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
      } else if (result instanceof ArrayBuffer) {
        resolve(arrayBufferToBase64(result));
      } else {
        resolve('');
      }
    };
    reader.onerror = () => reject(new Error('Không thể đọc tệp PDF đã chọn.'));
    reader.readAsDataURL(file);
  });
}

const BOOK_ACCENT_PALETTES = [
  'from-[#3F51B5] to-[#283593]',
  'from-[#0F766E] to-[#115E59]',
  'from-[#B45309] to-[#92400E]',
  'from-[#4338CA] to-[#312E81]',
  'from-[#15803D] to-[#166534]',
];

export const LibraryScreen: React.FC<LibraryScreenProps> = ({
  onOpenBook,
  onOpenVocabularyForBook,
  showOnboarding = false,
  onDismissOnboarding,
  onOpenSettings,
}) => {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [importing, setImporting] = useState<boolean>(false);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | BookStatus>('all');

  const [pendingDuplicate, setPendingDuplicate] = useState<PendingDuplicateState | null>(null);
  const [renamingBook, setRenamingBook] = useState<Book | null>(null);
  const [renameValue, setRenameValue] = useState<string>('');

  const [deletingBook, setDeletingBook] = useState<Book | null>(null);
  const [deleteManagedFile, setDeleteManagedFile] = useState<boolean>(true);
  const [deleteRetainedVocabulary, setDeleteRetainedVocabulary] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadBooks = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    const res = await lexiBookClient.listBooks({
      search: searchQuery.trim() || undefined,
      status: statusFilter,
    });
    if (res.ok) {
      setBooks(res.data);
    } else {
      setErrorMessage(res.error.messageVi);
    }
    setLoading(false);
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    void loadBooks();
  }, [loadBooks]);

  const visibleBooks = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return books.filter((book) => {
      if (statusFilter !== 'all' && book.status !== statusFilter) {
        return false;
      }
      if (normalizedQuery && !book.title.toLowerCase().includes(normalizedQuery)) {
        return false;
      }
      return true;
    });
  }, [books, searchQuery, statusFilter]);

  const libraryStats = useMemo(() => {
    const readingCount = books.filter((b) => b.status === 'reading').length;
    const finishedCount = books.filter((b) => b.status === 'finished').length;
    const totalTerms = books.reduce(
      (acc, b) => acc + (b.uniqueTermCount ?? b.highlightCount ?? 0),
      0
    );
    return { total: books.length, readingCount, finishedCount, totalTerms };
  }, [books]);

  const handleImportPayload = async (fileName: string, bytesBase64: string) => {
    setImporting(true);
    setErrorMessage(null);
    const res = await lexiBookClient.importPdf({
      fileName,
      bytesBase64,
      duplicateResolution: 'prompt',
    });
    setImporting(false);

    if (!res.ok) {
      setErrorMessage(res.error.messageVi);
      return;
    }

    if (res.data.status === 'duplicate_detected') {
      setPendingDuplicate({
        fileName,
        bytesBase64,
        existingBook: res.data.existingBook ?? res.data.book,
      });
      return;
    }

    await loadBooks();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const bytesBase64 = await readFileAsBase64(file);
      await handleImportPayload(file.name, bytesBase64);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Lỗi đọc tệp PDF.');
    }
  };

  const handleDropPdf = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingOver(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    try {
      const bytesBase64 = await readFileAsBase64(file);
      await handleImportPayload(file.name, bytesBase64);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Lỗi đọc tệp PDF kéo thả.');
    }
  };

  const handleResolveDuplicate = async (resolution: 'open_existing' | 'import_copy') => {
    if (!pendingDuplicate) return;
    const current = pendingDuplicate;
    setPendingDuplicate(null);
    setImporting(true);
    setErrorMessage(null);

    const res = await lexiBookClient.importPdf({
      fileName: current.fileName,
      bytesBase64: current.bytesBase64,
      duplicateResolution: resolution,
    });
    setImporting(false);

    if (!res.ok) {
      setErrorMessage(res.error.messageVi);
      return;
    }

    await loadBooks();
    if (resolution === 'open_existing') {
      onOpenBook(res.data.book.id);
    }
  };

  const handleOpenRenameModal = (book: Book) => {
    setRenamingBook(book);
    setRenameValue(book.title);
  };

  const handleConfirmRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingBook) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setErrorMessage('Tiêu đề sách không được để trống.');
      return;
    }

    const res = await lexiBookClient.updateBook({
      bookId: renamingBook.id,
      title: trimmed,
    });
    if (!res.ok) {
      setErrorMessage(res.error.messageVi);
      return;
    }
    setRenamingBook(null);
    await loadBooks();
  };

  const handleToggleBookStatus = async (book: Book) => {
    const nextStatus: BookStatus = book.status === 'reading' ? 'finished' : 'reading';
    const res = await lexiBookClient.updateBook({
      bookId: book.id,
      status: nextStatus,
    });
    if (!res.ok) {
      setErrorMessage(res.error.messageVi);
      return;
    }
    await loadBooks();
  };

  const handleOpenDeleteModal = (book: Book) => {
    setDeletingBook(book);
    setDeleteManagedFile(true);
    setDeleteRetainedVocabulary(false);
  };

  const handleConfirmDelete = async () => {
    if (!deletingBook) return;
    const targetId = deletingBook.id;
    const res = await lexiBookClient.removeBook({
      bookId: targetId,
      deleteManagedFile,
      deleteRetainedVocabulary,
    });
    if (!res.ok) {
      setErrorMessage(res.error.messageVi);
      return;
    }
    setDeletingBook(null);
    await loadBooks();
  };

  return (
    <div
      className="space-y-6 max-w-7xl mx-auto"
      data-testid="library-screen"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={(e) => void handleDropPdf(e)}
    >
      {showOnboarding && onDismissOnboarding && (
        <OnboardingBanner onDismiss={onDismissOnboarding} onOpenSettings={onOpenSettings} />
      )}

      {/* Top Header & Controls */}
      <div
        className={`flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-4 rounded-2xl border transition-all shadow-2xs ${
          isDraggingOver
            ? 'border-[#3F51B5] ring-2 ring-[#3F51B5]/20 bg-[#EEF2FF]/30'
            : 'border-[#E4E1DA]'
        }`}
      >
        <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-[#71717A] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm sách theo tiêu đề..."
              aria-label="Tìm kiếm sách theo tiêu đề"
              className="w-full rounded-xl border border-[#E4E1DA] bg-[#F7F5F0] pl-10 pr-3.5 py-2 text-sm text-[#18181B] placeholder:text-[#71717A] focus:bg-white focus:border-[#3F51B5] transition-colors"
            />
          </div>

          <div
            role="group"
            aria-label="Lọc theo trạng thái đọc"
            className="inline-flex items-center rounded-xl bg-[#F3F1EC] p-1 border border-[#E4E1DA]/60"
          >
            {(
              [
                { value: 'all', label: `Tất cả (${libraryStats.total})` },
                { value: 'reading', label: `Đang đọc (${libraryStats.readingCount})` },
                { value: 'finished', label: `Đã hoàn thành (${libraryStats.finishedCount})` },
              ] as const
            ).map((tab) => {
              const active = statusFilter === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setStatusFilter(tab.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    active
                      ? 'bg-white text-[#18181B] font-semibold shadow-2xs'
                      : 'text-[#52525B] hover:text-[#18181B]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden xl:inline-flex items-center gap-1.5 text-xs text-[#71717A]">
            <UploadCloud className="w-3.5 h-3.5" />
            Kéo thả tệp .pdf vào bất kỳ đâu hoặc
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            data-testid="pdf-file-input"
            onChange={handleFileChange}
            className="sr-only"
            aria-label="Chọn tệp PDF để nhập"
          />
          <Button
            variant="primary"
            loading={importing}
            leftIcon={<FolderPlus className="w-4 h-4" />}
            onClick={() => fileInputRef.current?.click()}
          >
            Nhập sách PDF
          </Button>
        </div>
      </div>

      {errorMessage && (
        <ErrorBanner
          messageVi={errorMessage}
          onRetry={() => void loadBooks()}
          onDismiss={() => setErrorMessage(null)}
        />
      )}

      {/* Main Content */}
      {loading ? (
        <div
          role="status"
          aria-live="polite"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-60 rounded-2xl border border-[#E4E1DA] bg-white p-5 animate-pulse flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="h-5 w-3/4 rounded-lg bg-[#EFECE6]" />
                <div className="h-4 w-1/2 rounded-lg bg-[#EFECE6]" />
              </div>
              <div className="h-10 w-full rounded-xl bg-[#EFECE6]" />
            </div>
          ))}
        </div>
      ) : visibleBooks.length === 0 ? (
        <EmptyState
          testId="library-empty-state"
          icon={<BookOpen className="w-6 h-6" />}
          title="Chưa có cuốn sách nào trong thư viện"
          description="Hãy nhập tệp PDF tiếng Anh từ máy tính của bạn (hoặc kéo thả tệp .pdf trực tiếp vào cửa sổ này) để bắt đầu đọc, tra nghĩa theo ngữ cảnh và lưu từ vựng."
          actionLabel="Nhập sách PDF"
          onAction={() => fileInputRef.current?.click()}
        />
      ) : (
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
          data-testid="library-book-grid"
        >
          {visibleBooks.map((book, idx) => {
            const safePageCount = Math.max(1, book.pageCount);
            const progressPercent = Math.min(
              100,
              Math.max(0, Math.round((book.lastPage / safePageCount) * 100))
            );
            const termCount = book.uniqueTermCount ?? book.highlightCount ?? 0;
            const dueCount = book.dueCardCount ?? 0;
            const spineGradient = BOOK_ACCENT_PALETTES[idx % BOOK_ACCENT_PALETTES.length];

            return (
              <article
                key={book.id}
                data-testid={`book-card-${book.id}`}
                className="group relative flex flex-col justify-between rounded-2xl border border-[#E4E1DA] bg-white p-5 shadow-2xs transition-all duration-200 hover:shadow-md hover:border-[#3F51B5]/35"
              >
                <div className="space-y-4">
                  {/* Top Book Cover Miniature + Title */}
                  <div className="flex items-start gap-3.5">
                    <div
                      onClick={() => onOpenBook(book.id)}
                      className={`w-11 h-14 rounded-lg bg-gradient-to-br ${spineGradient} text-white flex flex-col items-center justify-center shrink-0 shadow-xs cursor-pointer group-hover:scale-[1.03] transition-transform`}
                    >
                      <FileText className="w-5 h-5 opacity-90" />
                      <span className="text-[9px] font-bold tracking-wider uppercase mt-0.5 opacity-80">
                        PDF
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h2
                          onClick={() => onOpenBook(book.id)}
                          className="text-base font-semibold text-[#18181B] line-clamp-2 leading-snug cursor-pointer group-hover:text-[#3F51B5] transition-colors"
                        >
                          {book.title}
                        </h2>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        {book.isScanOnly && <Badge variant="amber">Bản quét (Scan)</Badge>}
                        <button
                          type="button"
                          onClick={() => void handleToggleBookStatus(book)}
                          title="Nhấn để đổi trạng thái đọc"
                          className="cursor-pointer"
                        >
                          <Badge variant={book.status === 'finished' ? 'green' : 'indigo'}>
                            {book.status === 'finished' ? (
                              <>
                                <CheckCircle2 className="w-3 h-3" />
                                Đã hoàn thành
                              </>
                            ) : (
                              'Đang đọc'
                            )}
                          </Badge>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Reading Progress */}
                  <div className="space-y-1.5 bg-[#FAF9F6] p-3 rounded-xl border border-[#E4E1DA]/70">
                    <div className="flex items-center justify-between text-xs text-[#52525B]">
                      <span>
                        Trang <strong className="text-[#18181B]">{book.lastPage}</strong> /{' '}
                        {book.pageCount}
                      </span>
                      <span className="font-semibold text-[#3F51B5]">{progressPercent}%</span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label={`Tiến độ đọc ${book.title}`}
                      aria-valuenow={progressPercent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="h-1.5 w-full overflow-hidden rounded-full bg-[#E4E1DA]"
                    >
                      <div
                        className="h-full bg-[#3F51B5] rounded-full transition-all duration-300"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Vocabulary & Due counts */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="amber">
                      <BookMarked className="w-3 h-3" />
                      {termCount} từ vựng
                    </Badge>
                    <Badge variant={dueCount > 0 ? 'indigo' : 'neutral'}>
                      <Sparkles className="w-3 h-3" />
                      {dueCount} thẻ cần ôn
                    </Badge>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-5 pt-4 border-t border-[#E4E1DA]/80 space-y-2.5">
                  <Button
                    variant="primary"
                    className="w-full"
                    leftIcon={<BookOpen className="w-4 h-4" />}
                    onClick={() => onOpenBook(book.id)}
                  >
                    Tiếp tục đọc
                  </Button>
                  <div className="flex items-center justify-between gap-1.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      leftIcon={<BookMarked className="w-3.5 h-3.5" />}
                      onClick={() => onOpenVocabularyForBook(book.id)}
                    >
                      Xem từ vựng
                    </Button>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<Edit3 className="w-3.5 h-3.5" />}
                        onClick={() => handleOpenRenameModal(book)}
                      >
                        Đổi tên
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                        className="text-[#DC2626] hover:text-[#B91C1C] hover:bg-red-50"
                        onClick={() => handleOpenDeleteModal(book)}
                      >
                        Xóa sách
                      </Button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Duplicate PDF Resolution Modal */}
      <Modal
        isOpen={Boolean(pendingDuplicate)}
        title="Phát hiện sách trùng lặp"
        onClose={() => setPendingDuplicate(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDuplicate(null)}>
              Hủy
            </Button>
            <Button
              variant="secondary"
              onClick={() => void handleResolveDuplicate('import_copy')}
            >
              Nhập bản sao độc lập
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleResolveDuplicate('open_existing')}
            >
              Mở sách đã có
            </Button>
          </>
        }
      >
        {pendingDuplicate && (
          <div className="space-y-2.5">
            <p>
              Tệp PDF <strong>{pendingDuplicate.fileName}</strong> có mã băm SHA-256 trùng khớp với
              cuốn sách đã có trong thư viện:{' '}
              <strong>{pendingDuplicate.existingBook.title}</strong>.
            </p>
            <p className="text-[#52525B]">
              Bạn muốn mở ngay cuốn sách hiện có (giữ nguyên trang đang đọc và từ vựng đã lưu) hay
              nhập thành một bản sao độc lập?
            </p>
          </div>
        )}
      </Modal>

      {/* Rename Book Modal */}
      <Modal
        isOpen={Boolean(renamingBook)}
        title="Đổi tên sách"
        onClose={() => setRenamingBook(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenamingBook(null)}>
              Hủy
            </Button>
            <Button variant="primary" onClick={(e) => void handleConfirmRename(e)}>
              Lưu tên mới
            </Button>
          </>
        }
      >
        <form onSubmit={(e) => void handleConfirmRename(e)} className="space-y-3">
          <label htmlFor="rename-book-input" className="block text-xs font-medium text-[#52525B]">
            Tiêu đề hiển thị trong thư viện
          </label>
          <input
            id="rename-book-input"
            type="text"
            aria-label="Tên sách mới"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            className="w-full rounded-xl border border-[#E4E1DA] bg-white px-3.5 py-2.5 text-sm text-[#18181B] focus:border-[#3F51B5]"
          />
        </form>
      </Modal>

      {/* Delete Book Confirmation Modal */}
      <Modal
        isOpen={Boolean(deletingBook)}
        title="Xác nhận xóa sách"
        onClose={() => setDeletingBook(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeletingBook(null)}>
              Hủy
            </Button>
            <Button variant="danger" onClick={() => void handleConfirmDelete()}>
              Xác nhận xóa
            </Button>
          </>
        }
      >
        {deletingBook && (
          <div className="space-y-4">
            <p>
              Bạn sắp xóa cuốn sách <strong>{deletingBook.title}</strong> khỏi thư viện. Vui lòng
              chọn cách xử lý dữ liệu liên quan:
            </p>
            <div className="space-y-3 rounded-xl bg-[#FAF9F6] p-4 border border-[#E4E1DA]">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteManagedFile}
                  onChange={(e) => setDeleteManagedFile(e.target.checked)}
                  className="mt-0.5 rounded border-[#E4E1DA]"
                />
                <span className="text-sm text-[#18181B]">
                  Xóa tệp PDF khỏi thư mục ứng dụng
                </span>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteRetainedVocabulary}
                  onChange={(e) => setDeleteRetainedVocabulary(e.target.checked)}
                  className="mt-0.5 rounded border-[#E4E1DA]"
                />
                <span className="text-sm text-[#18181B]">
                  Xóa luôn từ vựng đã lưu từ sách này
                </span>
              </label>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
