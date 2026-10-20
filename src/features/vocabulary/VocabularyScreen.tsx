import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  Edit3,
  ExternalLink,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { lexiBookClient } from '../../shared/api/client';
import type {
  Book,
  DeleteVocabularyScope,
  OccurrenceWithContext,
  Sense,
  VocabularyListItem,
  VocabularyStudyStatus,
} from '../../shared/types/contracts';

export interface VocabularyScreenProps {
  initialBookIdFilter?: string | null;
  onJumpToOccurrence: (bookId: string, pageNumber1Based: number, highlightId: string) => void;
}

interface SenseEditFormState {
  senseId: string;
  contextualMeaningVi: string;
  contextualExplanationVi: string;
  generalMeaningsViText: string;
  ipa: string;
  collocation: string;
  exampleEn: string;
  exampleVi: string;
}

interface PendingDeleteState {
  scope: DeleteVocabularyScope;
  occurrenceId?: string;
  lexemeId?: string;
  studyCardId?: string;
  labelVi: string;
}

function hasUserEdits(sense: Sense | null): boolean {
  if (!sense || !sense.userEditedFlags) return false;
  return Boolean(
    sense.userEditedFlags.generalMeaningsVi ||
      sense.userEditedFlags.contextualMeaningVi ||
      sense.userEditedFlags.contextualExplanationVi ||
      sense.userEditedFlags.exampleEn ||
      sense.userEditedFlags.exampleVi
  );
}

function renderStatusBadge(status: VocabularyStudyStatus): React.ReactElement {
  if (status === 'mastered') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800">
        Thành thạo
      </span>
    );
  }
  if (status === 'studying') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-800">
        Đang học
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-stone-200 text-stone-700">
      Đã lưu
    </span>
  );
}

function renderHighlightedSentence(sentence: string, target: string): React.ReactNode {
  if (!target.trim()) return sentence;
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = sentence.split(regex);
  return parts.map((part, idx) =>
    part.toLowerCase() === target.trim().toLowerCase() ? (
      <mark
        key={`${idx}-${part}`}
        className="bg-amber-200/80 text-stone-900 font-semibold px-1 rounded"
      >
        {part}
      </mark>
    ) : (
      <React.Fragment key={`${idx}-${part}`}>{part}</React.Fragment>
    )
  );
}

export const VocabularyScreen: React.FC<VocabularyScreenProps> = ({
  initialBookIdFilter = null,
  onJumpToOccurrence,
}) => {
  const [books, setBooks] = useState<Book[]>([]);
  const [items, setItems] = useState<VocabularyListItem[]>([]);
  const [selectedLexemeId, setSelectedLexemeId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorVi, setErrorVi] = useState<string | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [bookIdFilter, setBookIdFilter] = useState<string>(initialBookIdFilter ?? 'all');
  const [statusFilter, setStatusFilter] = useState<'all' | VocabularyStudyStatus>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'page' | 'name'>('recent');

  const [editingSense, setEditingSense] = useState<SenseEditFormState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDeleteState | null>(null);

  useEffect(() => {
    if (initialBookIdFilter !== undefined) {
      setBookIdFilter(initialBookIdFilter ?? 'all');
    }
  }, [initialBookIdFilter]);

  const loadBooks = useCallback(async () => {
    const res = await lexiBookClient.listBooks();
    if (res.ok) {
      setBooks(res.data);
    }
  }, []);

  const loadVocabulary = useCallback(async () => {
    setLoading(true);
    setErrorVi(null);
    const res = await lexiBookClient.listVocabulary({
      bookId: bookIdFilter === 'all' ? undefined : bookIdFilter,
      studyStatus: statusFilter,
      search: searchQuery.trim() || undefined,
      sortBy,
    });

    if (!res.ok) {
      setErrorVi(res.error.messageVi);
      setItems([]);
      setLoading(false);
      return;
    }

    setItems(res.data);
    setSelectedLexemeId((prev) => {
      if (prev && res.data.some((item) => item.lexeme.id === prev)) {
        return prev;
      }
      return res.data[0]?.lexeme.id ?? null;
    });
    setLoading(false);
  }, [bookIdFilter, statusFilter, searchQuery, sortBy]);

  useEffect(() => {
    void loadBooks();
  }, [loadBooks]);

  useEffect(() => {
    void loadVocabulary();
  }, [loadVocabulary]);

  const selectedItem = useMemo(
    () => items.find((item) => item.lexeme.id === selectedLexemeId) ?? null,
    [items, selectedLexemeId]
  );

  const handleStartEditSense = (sense: Sense) => {
    setEditingSense({
      senseId: sense.id,
      contextualMeaningVi: sense.contextualMeaningVi,
      contextualExplanationVi: sense.contextualExplanationVi,
      generalMeaningsViText: sense.generalMeaningsVi.join(', '),
      ipa: sense.ipa ?? '',
      collocation: sense.collocation ?? '',
      exampleEn: sense.exampleEn ?? '',
      exampleVi: sense.exampleVi ?? '',
    });
  };

  const handleSaveEditSense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSense) return;

    setActionBusyId(editingSense.senseId);
    setErrorVi(null);

    const generalMeaningsVi = editingSense.generalMeaningsViText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const res = await lexiBookClient.editSense({
      senseId: editingSense.senseId,
      contextualMeaningVi: editingSense.contextualMeaningVi.trim(),
      contextualExplanationVi: editingSense.contextualExplanationVi.trim(),
      generalMeaningsVi,
      ipa: editingSense.ipa.trim() || null,
      collocation: editingSense.collocation.trim() || null,
      exampleEn: editingSense.exampleEn.trim() || null,
      exampleVi: editingSense.exampleVi.trim() || null,
    });

    setActionBusyId(null);

    if (!res.ok) {
      setErrorVi(res.error.messageVi);
      return;
    }

    setEditingSense(null);
    await loadVocabulary();
  };

  const handleToggleStudyOptIn = async (occ: OccurrenceWithContext) => {
    if (!occ.sense) return;
    const currentlyEnabled = Boolean(occ.studyCard && occ.studyCard.enabled);
    setActionBusyId(occ.occurrence.id);
    setErrorVi(null);

    const res = await lexiBookClient.setStudyOptIn({
      senseId: occ.sense.id,
      representativeOccurrenceId: occ.occurrence.id,
      enabled: !currentlyEnabled,
    });

    setActionBusyId(null);
    if (!res.ok) {
      setErrorVi(res.error.messageVi);
      return;
    }
    await loadVocabulary();
  };

  const handleReanalyzeOccurrence = async (occurrenceId: string) => {
    setActionBusyId(occurrenceId);
    setErrorVi(null);

    const res = await lexiBookClient.analyzeOccurrence({
      occurrenceId,
      forceRefresh: true,
    });

    setActionBusyId(null);
    if (!res.ok) {
      setErrorVi(res.error.messageVi);
      return;
    }
    await loadVocabulary();
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    setActionBusyId('delete-action');
    setErrorVi(null);

    const res = await lexiBookClient.deleteVocabulary({
      scope: pendingDelete.scope,
      occurrenceId: pendingDelete.occurrenceId,
      lexemeId: pendingDelete.lexemeId,
      studyCardId: pendingDelete.studyCardId,
    });

    setActionBusyId(null);
    setPendingDelete(null);

    if (!res.ok) {
      setErrorVi(res.error.messageVi);
      return;
    }
    await loadVocabulary();
  };

  return (
    <div className="flex flex-col gap-5 h-full" data-testid="vocabulary-screen">
      {/* Filter & Search Bar */}
      <section
        aria-label="Bộ lọc từ vựng"
        className="bg-white border border-[#E2DFD7] rounded-lg p-4 shadow-xs flex flex-wrap items-center gap-3"
      >
        <div className="relative flex-1 min-w-[260px]">
          <Search className="w-4 h-4 text-[#525866] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            aria-label="Tìm kiếm từ vựng"
            placeholder="Tìm từ vựng, nghĩa tiếng Việt hoặc câu ngữ cảnh..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-[#E2DFD7] rounded-md bg-[#F8F6F1] text-[#1E2024] focus:outline-none focus:ring-2 focus:ring-[#3F51B5]"
          />
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="vocab-book-filter" className="text-xs font-medium text-[#525866]">
            Sách:
          </label>
          <select
            id="vocab-book-filter"
            aria-label="Lọc theo sách"
            value={bookIdFilter}
            onChange={(e) => setBookIdFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-[#E2DFD7] rounded-md bg-white text-[#1E2024]"
          >
            <option value="all">Tất cả sách</option>
            {books.map((book) => (
              <option key={book.id} value={book.id}>
                {book.title}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="vocab-status-filter" className="text-xs font-medium text-[#525866]">
            Trạng thái:
          </label>
          <select
            id="vocab-status-filter"
            aria-label="Lọc theo trạng thái học"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | VocabularyStudyStatus)}
            className="px-3 py-2 text-sm border border-[#E2DFD7] rounded-md bg-white text-[#1E2024]"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="saved">Đã lưu (Saved)</option>
            <option value="studying">Đang học (Studying)</option>
            <option value="mastered">Thành thạo (Mastered)</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="vocab-sort-select" className="text-xs font-medium text-[#525866]">
            Sắp xếp:
          </label>
          <select
            id="vocab-sort-select"
            aria-label="Sắp xếp từ vựng"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'recent' | 'page' | 'name')}
            className="px-3 py-2 text-sm border border-[#E2DFD7] rounded-md bg-white text-[#1E2024]"
          >
            <option value="recent">Mới gặp gần đây</option>
            <option value="page">Theo trang sách</option>
            <option value="name">Theo bảng chữ cái A-Z</option>
          </select>
        </div>
      </section>

      {errorVi && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md text-sm flex items-center justify-between"
        >
          <span>{errorVi}</span>
          <button
            type="button"
            onClick={() => setErrorVi(null)}
            className="text-xs font-medium underline ml-4"
          >
            Đóng
          </button>
        </div>
      )}

      {pendingDelete && (
        <div
          role="alertdialog"
          aria-label="Xác nhận xóa dữ liệu từ vựng"
          className="bg-amber-50 border border-amber-300 text-amber-950 px-4 py-3 rounded-md flex items-center justify-between gap-4"
        >
          <div className="text-sm font-medium">{pendingDelete.labelVi}</div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={actionBusyId === 'delete-action'}
              onClick={() => void handleConfirmDelete()}
              className="px-3 py-1.5 rounded bg-red-600 text-white text-xs font-semibold hover:bg-red-700"
            >
              Xác nhận xóa
            </button>
            <button
              type="button"
              onClick={() => setPendingDelete(null)}
              className="px-3 py-1.5 rounded border border-stone-300 bg-white text-stone-700 text-xs font-medium hover:bg-stone-50"
            >
              Hủy
            </button>
          </div>
        </div>
      )}

      {/* Master-Detail Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-[520px]">
        <section
          aria-label="Danh sách từ vựng"
          className="lg:col-span-5 bg-white border border-[#E2DFD7] rounded-lg overflow-hidden flex flex-col"
        >
          <div className="px-4 py-3 border-b border-[#E2DFD7] bg-[#F8F6F1] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#1E2024]">
              Từ vựng đã lưu ({items.length})
            </h2>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-[#525866]">
              Đang tải danh sách từ vựng...
            </div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#525866]">
              Chưa có từ vựng nào khớp với bộ lọc hiện tại.
            </div>
          ) : (
            <div className="divide-y divide-[#E2DFD7] overflow-y-auto flex-1">
              {items.map((item) => {
                const isSelected = item.lexeme.id === selectedLexemeId;
                return (
                  <button
                    key={item.lexeme.id}
                    type="button"
                    data-testid={`vocab-row-${item.lexeme.normalizedKey}`}
                    onClick={() => setSelectedLexemeId(item.lexeme.id)}
                    className={`w-full text-left p-4 transition-colors flex flex-col gap-1.5 ${
                      isSelected ? 'bg-indigo-50/70 border-l-4 border-l-[#3F51B5]' : 'hover:bg-[#F8F6F1]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-baseline gap-2">
                        <span className="font-semibold text-base text-[#1E2024]">
                          {item.lexeme.canonicalForm}
                        </span>
                        {item.lexeme.partOfSpeech && (
                          <span className="text-xs italic text-[#525866]">
                            ({item.lexeme.partOfSpeech})
                          </span>
                        )}
                      </div>
                      {renderStatusBadge(item.studyStatus)}
                    </div>

                    <p className="text-sm text-[#1E2024] line-clamp-1">{item.primaryMeaningVi}</p>

                    <div className="flex flex-wrap items-center justify-between gap-2 mt-1 text-xs text-[#525866]">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {item.bookTitles.map((title) => (
                          <span
                            key={title}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#F1EFEA] text-[#525866]"
                          >
                            <BookOpen className="w-3 h-3" />
                            {title}
                          </span>
                        ))}
                      </div>
                      <span>{item.occurrenceCount} ngữ cảnh</span>
                    </div>

                    {item.nextDueAt && (
                      <div className="text-[11px] text-indigo-700 mt-0.5">
                        Ôn tập tiếp: {new Date(item.nextDueAt).toLocaleDateString('vi-VN')}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Right Detail Panel */}
        <section
          aria-label="Chi tiết từ vựng và ngữ cảnh"
          className="lg:col-span-7 bg-white border border-[#E2DFD7] rounded-lg p-5 flex flex-col gap-4 overflow-y-auto"
        >
          {!selectedItem ? (
            <div className="m-auto text-center text-sm text-[#525866] py-12">
              Chọn một từ vựng ở danh sách bên trái để xem tất cả ngữ cảnh và nghĩa chi tiết.
            </div>
          ) : (
            <>
              <div className="border-b border-[#E2DFD7] pb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-2xl font-bold text-[#1E2024]">
                      {selectedItem.lexeme.canonicalForm}
                    </h2>
                    {selectedItem.lexeme.partOfSpeech && (
                      <span className="px-2 py-0.5 text-xs rounded bg-[#F1EFEA] text-[#525866] font-medium">
                        {selectedItem.lexeme.partOfSpeech}
                      </span>
                    )}
                    {renderStatusBadge(selectedItem.studyStatus)}
                  </div>
                  <p className="text-xs text-[#525866] mt-1">
                    Xuất hiện trong {selectedItem.bookTitles.length} sách ·{' '}
                    {selectedItem.occurrenceCount} ngữ cảnh được lưu
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setPendingDelete({
                      scope: 'lexeme_all',
                      lexemeId: selectedItem.lexeme.id,
                      labelVi: `Bạn có chắc muốn xóa toàn bộ từ vựng "${selectedItem.lexeme.canonicalForm}" cùng tất cả lần xuất hiện?`,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-red-200 bg-red-50 text-red-700 text-xs font-medium hover:bg-red-100"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Xóa toàn bộ từ vựng này
                </button>
              </div>

              <div className="flex flex-col gap-4">
                {selectedItem.occurrences.map((occ, index) => {
                  const sense = occ.sense;
                  const isEdited = hasUserEdits(sense);
                  const isStudyEnabled = Boolean(occ.studyCard && occ.studyCard.enabled);
                  const isEditingThisSense = Boolean(
                    sense && editingSense && editingSense.senseId === sense.id
                  );

                  return (
                    <article
                      key={occ.occurrence.id}
                      data-testid={`occurrence-card-${occ.occurrence.id}`}
                      className="border border-[#E2DFD7] rounded-lg p-4 bg-[#F8F6F1]/50 flex flex-col gap-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2DFD7] pb-2.5">
                        <div className="flex items-center gap-2 text-xs font-medium text-[#1E2024]">
                          <span className="px-2 py-0.5 rounded bg-[#3F51B5]/10 text-[#3F51B5] font-semibold">
                            Ngữ cảnh #{index + 1}
                          </span>
                          <span>{occ.bookTitle}</span>
                          <span>·</span>
                          <span>Trang {occ.highlight.pageNumber1Based}</span>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            onJumpToOccurrence(
                              occ.highlight.bookId,
                              occ.highlight.pageNumber1Based,
                              occ.highlight.id
                            )
                          }
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#3F51B5] text-white text-xs font-medium hover:bg-[#32408F]"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Mở trang gốc trong PDF
                        </button>
                      </div>

                      <blockquote className="p-3 rounded bg-white border border-[#E2DFD7] text-sm text-[#1E2024] leading-relaxed">
                        {renderHighlightedSentence(
                          occ.highlight.sentenceText,
                          occ.highlight.selectedText
                        )}
                      </blockquote>

                      {!sense ? (
                        <div className="text-xs text-[#525866] italic">
                          Chưa có phân tích ngữ cảnh cho lần xuất hiện này.
                        </div>
                      ) : isEditingThisSense && editingSense ? (
                        <form
                          onSubmit={(e) => void handleSaveEditSense(e)}
                          className="bg-white border border-[#3F51B5] rounded-md p-3.5 flex flex-col gap-3"
                        >
                          <div className="text-xs font-semibold text-[#3F51B5]">
                            Chỉnh sửa nghĩa theo ngữ cảnh
                          </div>

                          <div className="flex flex-col gap-1">
                            <label
                              htmlFor={`edit-contextual-meaning-${sense.id}`}
                              className="text-xs font-medium text-[#1E2024]"
                            >
                              Nghĩa trong ngữ cảnh này
                            </label>
                            <input
                              id={`edit-contextual-meaning-${sense.id}`}
                              type="text"
                              required
                              value={editingSense.contextualMeaningVi}
                              onChange={(e) =>
                                setEditingSense({
                                  ...editingSense,
                                  contextualMeaningVi: e.target.value,
                                })
                              }
                              className="px-2.5 py-1.5 text-sm border border-[#E2DFD7] rounded"
                            />
                          </div>

                          <div className="flex flex-col gap-1">
                            <label
                              htmlFor={`edit-contextual-explanation-${sense.id}`}
                              className="text-xs font-medium text-[#1E2024]"
                            >
                              Giải thích ngữ cảnh
                            </label>
                            <textarea
                              id={`edit-contextual-explanation-${sense.id}`}
                              rows={2}
                              value={editingSense.contextualExplanationVi}
                              onChange={(e) =>
                                setEditingSense({
                                  ...editingSense,
                                  contextualExplanationVi: e.target.value,
                                })
                              }
                              className="px-2.5 py-1.5 text-sm border border-[#E2DFD7] rounded"
                            />
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div className="flex flex-col gap-1">
                              <label
                                htmlFor={`edit-general-meanings-${sense.id}`}
                                className="text-xs font-medium text-[#1E2024]"
                              >
                                Nghĩa thông dụng (phân cách bằng dấu phẩy)
                              </label>
                              <input
                                id={`edit-general-meanings-${sense.id}`}
                                type="text"
                                value={editingSense.generalMeaningsViText}
                                onChange={(e) =>
                                  setEditingSense({
                                    ...editingSense,
                                    generalMeaningsViText: e.target.value,
                                  })
                                }
                                className="px-2.5 py-1.5 text-sm border border-[#E2DFD7] rounded"
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <label
                                htmlFor={`edit-ipa-${sense.id}`}
                                className="text-xs font-medium text-[#1E2024]"
                              >
                                Phiên âm IPA
                              </label>
                              <input
                                id={`edit-ipa-${sense.id}`}
                                type="text"
                                value={editingSense.ipa}
                                onChange={(e) =>
                                  setEditingSense({
                                    ...editingSense,
                                    ipa: e.target.value,
                                  })
                                }
                                className="px-2.5 py-1.5 text-sm border border-[#E2DFD7] rounded"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div className="flex flex-col gap-1">
                              <label
                                htmlFor={`edit-example-en-${sense.id}`}
                                className="text-xs font-medium text-[#1E2024]"
                              >
                                Ví dụ tiếng Anh
                              </label>
                              <input
                                id={`edit-example-en-${sense.id}`}
                                type="text"
                                value={editingSense.exampleEn}
                                onChange={(e) =>
                                  setEditingSense({
                                    ...editingSense,
                                    exampleEn: e.target.value,
                                  })
                                }
                                className="px-2.5 py-1.5 text-sm border border-[#E2DFD7] rounded"
                              />
                            </div>

                            <div className="flex flex-col gap-1">
                              <label
                                htmlFor={`edit-example-vi-${sense.id}`}
                                className="text-xs font-medium text-[#1E2024]"
                              >
                                Dịch ví dụ tiếng Việt
                              </label>
                              <input
                                id={`edit-example-vi-${sense.id}`}
                                type="text"
                                value={editingSense.exampleVi}
                                onChange={(e) =>
                                  setEditingSense({
                                    ...editingSense,
                                    exampleVi: e.target.value,
                                  })
                                }
                                className="px-2.5 py-1.5 text-sm border border-[#E2DFD7] rounded"
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setEditingSense(null)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-[#E2DFD7] text-xs font-medium text-[#525866]"
                            >
                              <X className="w-3.5 h-3.5" />
                              Hủy
                            </button>
                            <button
                              type="submit"
                              disabled={actionBusyId === sense.id}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-[#3F51B5] text-white text-xs font-medium"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Lưu chỉnh sửa
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="flex flex-col gap-2 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <span className="text-xs font-semibold uppercase tracking-wider text-[#525866]">
                                Nghĩa trong đoạn này:{' '}
                              </span>
                              <span className="font-semibold text-[#1E2024]">
                                {sense.contextualMeaningVi}
                              </span>
                            </div>

                            {isEdited && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-100 text-amber-900">
                                Đã chỉnh sửa thủ công
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-[#525866] leading-relaxed">
                            {sense.contextualExplanationVi}
                          </p>

                          {sense.generalMeaningsVi.length > 0 && (
                            <div className="text-xs text-[#1E2024]">
                              <span className="font-medium text-[#525866]">Nghĩa thông dụng: </span>
                              {sense.generalMeaningsVi.join('; ')}
                            </div>
                          )}

                          <div className="flex flex-wrap items-center gap-4 text-xs text-[#525866]">
                            {sense.ipa && (
                              <span>
                                <strong>IPA:</strong> {sense.ipa}
                              </span>
                            )}
                            {sense.collocation && (
                              <span>
                                <strong>Cụm từ:</strong> {sense.collocation}
                              </span>
                            )}
                          </div>

                          {(sense.exampleEn || sense.exampleVi) && (
                            <div className="text-xs bg-white border border-[#E2DFD7] rounded p-2.5 text-[#525866]">
                              {sense.exampleEn && (
                                <div className="italic text-[#1E2024]">{sense.exampleEn}</div>
                              )}
                              {sense.exampleVi && <div>→ {sense.exampleVi}</div>}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E2DFD7]">
                        <div className="flex flex-wrap items-center gap-2">
                          {sense && (
                            <>
                              <button
                                type="button"
                                disabled={actionBusyId === occ.occurrence.id}
                                onClick={() => void handleToggleStudyOptIn(occ)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                                  isStudyEnabled
                                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                    : 'bg-white border border-[#E2DFD7] text-[#1E2024] hover:bg-[#F1EFEA]'
                                }`}
                              >
                                <Sparkles className="w-3.5 h-3.5" />
                                {isStudyEnabled ? 'Đang trong danh sách Ôn tập' : 'Đưa vào Ôn tập'}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleStartEditSense(sense)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-[#E2DFD7] bg-white text-xs font-medium text-[#1E2024] hover:bg-[#F1EFEA]"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                Chỉnh sửa nghĩa
                              </button>
                            </>
                          )}

                          <button
                            type="button"
                            disabled={actionBusyId === occ.occurrence.id}
                            onClick={() => void handleReanalyzeOccurrence(occ.occurrence.id)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-[#E2DFD7] bg-white text-xs font-medium text-[#1E2024] hover:bg-[#F1EFEA]"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Phân tích lại bằng AI
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {occ.studyCard && (
                            <button
                              type="button"
                              onClick={() =>
                                setPendingDelete({
                                  scope: 'study_card_only',
                                  studyCardId: occ.studyCard?.id,
                                  labelVi:
                                    'Bạn có chắc muốn hủy thẻ Ôn tập của nghĩa này (vẫn giữ lại từ vựng và highlight)?',
                                })
                              }
                              className="px-2.5 py-1.5 rounded border border-amber-200 bg-amber-50 text-amber-900 text-xs font-medium hover:bg-amber-100"
                            >
                              Chỉ hủy thẻ Ôn tập
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              setPendingDelete({
                                scope: 'occurrence_only',
                                occurrenceId: occ.occurrence.id,
                                labelVi:
                                  'Bạn có chắc muốn xóa lần xuất hiện này? Các ngữ cảnh khác của từ vẫn được giữ nguyên.',
                              })
                            }
                            className="px-2.5 py-1.5 rounded border border-red-200 bg-red-50 text-red-700 text-xs font-medium hover:bg-red-100"
                          >
                            Xóa lần xuất hiện này
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};
