import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

export const LibraryScreen: React.FC<LibraryScreenProps> = ({
  onOpenBook,
  onOpenVocabularyForBook,
  showOnboarding = false,
  onDismissOnboarding,
}) => {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [importing, setImporting] = useState<boolean>(false);
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
    <div className="space-y-6 max-w-7xl mx-auto" data-testid="library-screen">
      {showOnboarding && onDismissOnboarding && (
        <OnboardingBanner onDismiss={onDismissOnboarding} />
      )}

      {/* Top Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-4 rounded-xl border border-[#E2DFD7]">
        <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm sách theo tiêu đề..."
              aria-label="Tìm kiếm sách theo tiêu đề"
              className="w-full rounded-lg border border-[#E2DFD7] bg-[#F8F6F1] px-3.5 py-2 text-sm text-[#1E2024] placeholder:text-[#525866] focus:bg-white focus:border-[#3F51B5]"
            />
          </div>

          <div
            role="group"
            aria-label="Lọc theo trạng thái đọc"
            className="inline-flex items-center rounded-lg bg-[#F1EFEA] p-1"
          >
            {(
              [
                { value: 'all', label: 'Tất cả' },
                { value: 'reading', label: 'Đang đọc' },
                { value: 'finished', label: 'Đã hoàn thành' },
              ] as const
            ).map((tab) => {
              const active = statusFilter === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setStatusFilter(tab.value)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-white text-[#1E2024] shadow-xs'
                      : 'text-[#525866] hover:text-[#1E2024]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
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
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-56 rounded-xl border border-[#E2DFD7] bg-white p-5 animate-pulse flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="h-5 w-3/4 rounded bg-[#F1EFEA]" />
                <div className="h-4 w-1/2 rounded bg-[#F1EFEA]" />
              </div>
              <div className="h-9 w-full rounded bg-[#F1EFEA]" />
            </div>
          ))}
        </div>
      ) : visibleBooks.length === 0 ? (
        <EmptyState
          testId="library-empty-state"
          title="Chưa có cuốn sách nào trong thư viện"
          description="Hãy nhập tệp PDF tiếng Anh từ máy tính của bạn để bắt đầu đọc, tra nghĩa theo ngữ cảnh và lưu từ vựng."
          actionLabel="Nhập sách PDF"
          onAction={() => fileInputRef.current?.click()}
        />
      ) : (
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
          data-testid="library-book-grid"
        >
          {visibleBooks.map((book) => {
            const safePageCount = Math.max(1, book.pageCount);
            const progressPercent = Math.min(
              100,
              Math.max(0, Math.round((book.lastPage / safePageCount) * 100))
            );
            const termCount = book.uniqueTermCount ?? book.highlightCount ?? 0;
            const dueCount = book.dueCardCount ?? 0;

            return (
              <article
                key={book.id}
                data-testid={`book-card-${book.id}`}
                className="flex flex-col justify-between rounded-xl border border-[#E2DFD7] bg-white p-5 shadow-xs transition-shadow hover:shadow-md"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-base font-semibold text-[#1E2024] line-clamp-2 leading-snug">
                      {book.title}
                    </h2>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {book.isScanOnly && <Badge variant="amber">Bản quét (Scan)</Badge>}
                      <button
                        type="button"
                        onClick={() => void handleToggleBookStatus(book)}
                        title="Nhấn để đổi trạng thái đọc"
                        className="cursor-pointer"
                      >
                        <Badge variant={book.status === 'finished' ? 'green' : 'indigo'}>
                          {book.status === 'finished' ? 'Đã hoàn thành' : 'Đang đọc'}
                        </Badge>
                      </button>
                    </div>
                  </div>

                  {/* Reading Progress */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-[#525866]">
                      <span>
                        Trang {book.lastPage} / {book.pageCount}
                      </span>
                      <span className="font-medium text-[#1E2024]">{progressPercent}%</span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label={`Tiến độ đọc ${book.title}`}
                      aria-valuenow={progressPercent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="h-2 w-full overflow-hidden rounded-full bg-[#F1EFEA]"
                    >
                      <div
                        className="h-full bg-[#3F51B5] transition-all"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Vocabulary & Due counts */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Badge variant="amber">{termCount} từ vựng</Badge>
                    <Badge variant={dueCount > 0 ? 'indigo' : 'neutral'}>
                      {dueCount} thẻ cần ôn
                    </Badge>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-5 pt-4 border-t border-[#E2DFD7] space-y-2.5">
                  <Button
                    variant="primary"
                    className="w-full"
                    onClick={() => onOpenBook(book.id)}
                  >
                    Tiếp tục đọc
                  </Button>
                  <div className="flex items-center justify-between gap-1.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onOpenVocabularyForBook(book.id)}
                    >
                      Xem từ vựng
                    </Button>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenRenameModal(book)}
                      >
                        Đổi tên
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-[#DC2626] hover:text-[#B91C1C]"
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
          <div className="space-y-2">
            <p>
              Tệp PDF <strong>{pendingDuplicate.fileName}</strong> có mã băm SHA-256 trùng khớp với
              cuốn sách đã có trong thư viện:{' '}
              <strong>{pendingDuplicate.existingBook.title}</strong>.
            </p>
            <p className="text-[#525866]">
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
          <label htmlFor="rename-book-input" className="block text-xs font-medium text-[#525866]">
            Tiêu đề hiển thị trong thư viện
          </label>
          <input
            id="rename-book-input"
            type="text"
            aria-label="Tên sách mới"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            className="w-full rounded-lg border border-[#E2DFD7] bg-white px-3.5 py-2 text-sm text-[#1E2024] focus:border-[#3F51B5]"
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
            <div className="space-y-2.5 rounded-lg bg-[#F8F6F1] p-3.5 border border-[#E2DFD7]">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteManagedFile}
                  onChange={(e) => setDeleteManagedFile(e.target.checked)}
                  className="mt-0.5 rounded border-[#E2DFD7]"
                />
                <span className="text-sm text-[#1E2024]">
                  Xóa tệp PDF khỏi thư mục ứng dụng
                </span>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteRetainedVocabulary}
                  onChange={(e) => setDeleteRetainedVocabulary(e.target.checked)}
                  className="mt-0.5 rounded border-[#E2DFD7]"
                />
                <span className="text-sm text-[#1E2024]">
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
