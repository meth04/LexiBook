import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createTextAnchor,
  normalizedQuadToViewportRect,
  rectToNormalizedQuad,
  resolveTextAnchor,
} from './anchorEngine';
import {
  extractSelectionContext,
  extractSinglePdfPage,
  measureDomTextScaleX,
  renderPdfPageToCanvas,
  type PdfPageExtraction,
  type SelectionExtractionResult,
} from './pdfTextEngine';
import { lexiBookClient } from '../../shared/api/client';
import type {
  Book,
  NormalizedQuad,
  OccurrenceWithContext,
} from '../../shared/types/contracts';
import { Badge, Button, ErrorBanner, Modal } from '../../shared/ui/components';

export interface ReaderScreenProps {
  bookId: string;
  initialPageNumber?: number | null;
  focusedHighlightId?: string | null;
  onBackToLibrary: () => void;
  onOpenStudy?: () => void;
}

const ZOOM_PRESETS = [0.5, 1.0, 1.25, 2.0] as const;

export const ReaderScreen: React.FC<ReaderScreenProps> = ({
  bookId,
  initialPageNumber,
  focusedHighlightId: initialFocusedHighlightId,
  onBackToLibrary,
}) => {
  const [book, setBook] = useState<Book | null>(null);
  const [pageExtraction, setPageExtraction] = useState<PdfPageExtraction | null>(null);
  const [docScanOnly, setDocScanOnly] = useState<boolean>(false);
  const [pdfBytesBase64, setPdfBytesBase64] = useState<string | null>(null);
  const [canvasRendered, setCanvasRendered] = useState<boolean>(false);
  const [pageInputText, setPageInputText] = useState<string>('1');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [highlights, setHighlights] = useState<OccurrenceWithContext[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(initialPageNumber ?? 1);
  const [zoomScale, setZoomScale] = useState<number>(1.0);
  const [rotation, setRotation] = useState<number>(0);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [sidebarWidth, setSidebarWidth] = useState<number>(360);
  const [sidebarScope, setSidebarScope] = useState<'book' | 'page'>('book');
  const [sidebarSearch, setSidebarSearch] = useState<string>('');
  const [sidebarSort, setSidebarSort] = useState<'recent' | 'page' | 'name'>('recent');

  const [inPdfQuery, setInPdfQuery] = useState<string>('');
  const [selectionDraft, setSelectionDraft] = useState<SelectionExtractionResult | null>(null);
  const [editableSentence, setEditableSentence] = useState<string>('');
  const [customPhraseInput, setCustomPhraseInput] = useState<string>('');

  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState<string | null>(null);
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(
    initialFocusedHighlightId ?? null
  );
  const [analyzingIds, setAnalyzingIds] = useState<Record<string, boolean>>({});
  const [analysisErrors, setAnalysisErrors] = useState<Record<string, string>>({});

  const [editingSenseOcc, setEditingSenseOcc] = useState<OccurrenceWithContext | null>(null);
  const [editContextualMeaning, setEditContextualMeaning] = useState<string>('');
  const [editContextualExplanation, setEditContextualExplanation] = useState<string>('');
  const [editGeneralMeanings, setEditGeneralMeanings] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadReaderData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [bookRes, pdfRes, hlRes, settingsRes] = await Promise.all([
        lexiBookClient.getBook(bookId),
        lexiBookClient.getBookPdfBytes(bookId),
        lexiBookClient.listHighlights(bookId),
        lexiBookClient.getAppSettings(),
      ]);

      if (!bookRes.ok) {
        setErrorMsg(bookRes.error.messageVi);
        setLoading(false);
        return;
      }

      const loadedBook = bookRes.data;
      setBook(loadedBook);

      if (settingsRes.ok) {
        setZoomScale(settingsRes.data.defaultPdfScale || 1.0);
        setSidebarOpen(settingsRes.data.defaultSidebarOpen ?? true);
      }

      const targetPage =
        initialPageNumber && initialPageNumber >= 1 && initialPageNumber <= loadedBook.pageCount
          ? initialPageNumber
          : loadedBook.lastPage || 1;
      setCurrentPage(targetPage);

      if (pdfRes.ok) {
        setPdfBytesBase64(pdfRes.data.bytesBase64);
        const single = await extractSinglePdfPage(pdfRes.data.bytesBase64, targetPage);
        setPageExtraction(single.page);
        setDocScanOnly(single.isScanOnly);
        setBook((prev) =>
          prev
            ? {
                ...prev,
                pageCount: single.pageCount || prev.pageCount,
                isScanOnly: single.isScanOnly,
              }
            : prev
        );
      } else {
        setErrorMsg(pdfRes.error.messageVi);
      }

      if (hlRes.ok) {
        setHighlights(hlRes.data);
        if (initialFocusedHighlightId) {
          const match = hlRes.data.find((h) => h.highlight.id === initialFocusedHighlightId);
          if (match) {
            setSelectedOccurrenceId(match.occurrence.id);
            setActiveHighlightId(match.highlight.id);
            setCurrentPage(match.highlight.pageNumber1Based);
          }
        } else if (hlRes.data.length > 0) {
          setSelectedOccurrenceId(hlRes.data[0].occurrence.id);
        }
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Không thể mở tài liệu PDF.');
    } finally {
      setLoading(false);
    }
  }, [bookId, initialPageNumber, initialFocusedHighlightId]);

  useEffect(() => {
    void loadReaderData();
  }, [loadReaderData]);

  useEffect(() => {
    if (initialPageNumber && initialPageNumber >= 1) {
      setCurrentPage(initialPageNumber);
    }
    if (initialFocusedHighlightId) {
      setActiveHighlightId(initialFocusedHighlightId);
      const found = highlights.find((h) => h.highlight.id === initialFocusedHighlightId);
      if (found) {
        setSelectedOccurrenceId(found.occurrence.id);
      }
    }
  }, [initialPageNumber, initialFocusedHighlightId, highlights]);

  const handlePageChange = useCallback(
    async (nextPage: number) => {
      if (!book) return;
      const clamped = Math.max(1, Math.min(book.pageCount, nextPage));
      setCurrentPage(clamped);
      setSelectionDraft(null);
      const saved = await lexiBookClient.saveReadingPosition({
        bookId: book.id,
        pageNumber1Based: clamped,
        scrollOffsetNormalized: 0,
      });
      if (saved.ok) {
        setBook(saved.data);
      }
    },
    [book]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        if (e.key === 'Escape') {
          setSelectionDraft(null);
        }
        return;
      }
      if (e.key === 'Escape') {
        setSelectionDraft(null);
      } else if (e.key === 'ArrowRight' && book && currentPage < book.pageCount) {
        void handlePageChange(currentPage + 1);
      } else if (e.key === 'ArrowLeft' && book && currentPage > 1) {
        void handlePageChange(currentPage - 1);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [book, currentPage, handlePageChange]);

  const isScanOnly = Boolean(docScanOnly || book?.isScanOnly);

  useEffect(() => {
    setPageInputText(String(currentPage));
  }, [currentPage]);

  // Extract ONLY the current page's text on-demand when navigating pages (never scans all 355 pages)
  useEffect(() => {
    if (!pdfBytesBase64) return;
    let active = true;
    void extractSinglePdfPage(pdfBytesBase64, currentPage)
      .then((single) => {
        if (!active) return;
        setPageExtraction(single.page);
      })
      .catch(() => {
        // ignore
      });
    return () => {
      active = false;
    };
  }, [pdfBytesBase64, currentPage]);

  // Always render the authentic PDF page onto the <canvas> so original layout is 100% preserved
  useEffect(() => {
    if (!pdfBytesBase64 || !canvasRef.current) return;
    let active = true;
    void renderPdfPageToCanvas(
      pdfBytesBase64,
      currentPage,
      canvasRef.current,
      zoomScale,
      rotation
    ).then((rendered) => {
      if (active) {
        setCanvasRendered(rendered);
      }
    });
    return () => {
      active = false;
    };
  }, [pdfBytesBase64, currentPage, zoomScale, rotation]);

  const inPdfMatches = useMemo(() => {
    if (!pageExtraction || !inPdfQuery.trim()) return [];
    const q = inPdfQuery.trim().toLowerCase();
    const matchesOnPage = pageExtraction.canonicalText.toLowerCase().split(q).length - 1;
    if (matchesOnPage > 0) {
      return [{ pageNumber1Based: currentPage, count: matchesOnPage }];
    }
    return [];
  }, [pageExtraction, currentPage, inPdfQuery]);

  const initiateSelection = useCallback(
    (
      rawText: string,
      options?: {
        startOffset?: number;
        endOffset?: number;
        occurrenceIndex?: number;
        snapToWords?: boolean;
        targetQuad?: NormalizedQuad;
        customQuads?: NormalizedQuad[];
      }
    ) => {
      if (!pageExtraction || isScanOnly) return;
      const trimmed = rawText.trim();
      if (!trimmed) return;
      try {
        const extracted = extractSelectionContext(pageExtraction, trimmed, options);
        const wasSnappedToDifferentLength =
          Boolean(options?.snapToWords) &&
          Math.abs(extracted.selectedText.length - trimmed.length) >= 2;
        if (options?.customQuads && options.customQuads.length > 0 && !wasSnappedToDifferentLength) {
          extracted.normalizedQuads = options.customQuads;
        }
        setSelectionDraft(extracted);
        setEditableSentence(extracted.sentenceText);
      } catch {
        // ignore empty selection
      }
    },
    [pageExtraction, isScanOnly]
  );

  const handleDomTextSelection = () => {
    if (isScanOnly || !pageExtraction) return;
    const sel = window.getSelection?.();
    const text = sel ? sel.toString().replace(/\s+/g, ' ').trim() : '';
    if (!text || text.length < 2) return;

    let customQuads: NormalizedQuad[] | undefined;
    let domStartOffset: number | undefined;
    let domEndOffset: number | undefined;

    if (sel && sel.rangeCount > 0 && surfaceRef.current) {
      const range = sel.getRangeAt(0);

      const resolveBoundaryOffset = (container: Node, offsetInNode: number): number | undefined => {
        if (container.nodeType === Node.TEXT_NODE) {
          const spanEl = container.parentElement?.closest('[data-start-offset]') as HTMLElement | null;
          if (spanEl && spanEl.dataset.startOffset !== undefined) {
            return Number(spanEl.dataset.startOffset) + offsetInNode;
          }
        } else if (container.nodeType === Node.ELEMENT_NODE) {
          const el = container as HTMLElement;
          const child = el.childNodes[offsetInNode] as HTMLElement | undefined;
          const targetEl =
            (child?.closest?.('[data-start-offset]') as HTMLElement | null) ??
            (el.closest('[data-start-offset]') as HTMLElement | null);
          if (targetEl && targetEl.dataset.startOffset !== undefined) {
            return Number(targetEl.dataset.startOffset);
          }
        }
        return undefined;
      };

      const resolvedStart = resolveBoundaryOffset(range.startContainer, range.startOffset);
      const resolvedEnd = resolveBoundaryOffset(range.endContainer, range.endOffset);
      if (resolvedStart !== undefined && resolvedEnd !== undefined) {
        domStartOffset = Math.min(resolvedStart, resolvedEnd);
        domEndOffset = Math.max(resolvedStart, resolvedEnd);
      }

      const surfaceRect = surfaceRef.current.getBoundingClientRect();
      if (surfaceRect.width > 0 && surfaceRect.height > 0) {
        const clientRects = Array.from(range.getClientRects());
        const mapped = clientRects
          .filter((r) => r.width > 1 && r.height > 1)
          .map((r) =>
            rectToNormalizedQuad(
              {
                left: r.left - surfaceRect.left,
                top: r.top - surfaceRect.top,
                width: r.width,
                height: r.height,
              },
              surfaceRect.width,
              surfaceRect.height,
              rotation
            )
          );
        if (mapped.length > 0) {
          customQuads = mapped;
        }
      }
    }

    initiateSelection(text, {
      startOffset: domStartOffset,
      endOffset: domEndOffset,
      snapToWords: true,
      targetQuad: customQuads?.[0],
      customQuads,
    });
  };

  const triggerAiAnalysisForOccurrence = async (
    occurrenceId: string,
    overrideSentence?: string
  ) => {
    setAnalyzingIds((prev) => ({ ...prev, [occurrenceId]: true }));
    setAnalysisErrors((prev) => {
      const next = { ...prev };
      delete next[occurrenceId];
      return next;
    });

    const aiRes = await lexiBookClient.analyzeOccurrence({
      occurrenceId,
      overrideSentenceText: overrideSentence,
    });

    const refreshed = await lexiBookClient.listHighlights(bookId);
    if (refreshed.ok) {
      setHighlights(refreshed.data);
    }

    setAnalyzingIds((prev) => ({ ...prev, [occurrenceId]: false }));

    if (!aiRes.ok) {
      setAnalysisErrors((prev) => ({
        ...prev,
        [occurrenceId]: aiRes.error.messageVi,
      }));
    }
  };

  const handleConfirmHighlight = async (runAiAnalysis: boolean) => {
    if (!book || !pageExtraction || !selectionDraft) return;

    const effectiveSentence = editableSentence.trim() || selectionDraft.sentenceText;
    const textAnchor = createTextAnchor(
      pageExtraction.canonicalText,
      selectionDraft.selectedText,
      {
        startOffset: selectionDraft.startOffset,
        occurrenceIndex: selectionDraft.occurrenceIndex,
      },
      book.sha256,
      rotation
    );

    const createRes = await lexiBookClient.createHighlight({
      bookId: book.id,
      pageNumber1Based: currentPage,
      selectedText: selectionDraft.selectedText,
      sentenceText: effectiveSentence,
      paragraphText: selectionDraft.paragraphText,
      textAnchor,
      normalizedQuads: selectionDraft.normalizedQuads,
      autoAnalyze: runAiAnalysis,
    });

    if (!createRes.ok) {
      setErrorMsg(createRes.error.messageVi);
      return;
    }

    setSelectionDraft(null);
    setCustomPhraseInput('');

    // Immediately refresh highlights list BEFORE AI finishes so the sidebar shows the persisted item right away
    const hlRes = await lexiBookClient.listHighlights(book.id);
    if (hlRes.ok) {
      setHighlights(hlRes.data);
    }

    const newOccId = createRes.data.occurrence.id;
    setSelectedOccurrenceId(newOccId);
    setActiveHighlightId(createRes.data.highlight.id);

    if (runAiAnalysis) {
      void triggerAiAnalysisForOccurrence(newOccId, effectiveSentence);
    }
  };

  const handleCancelAiAnalysis = async (occurrenceId: string) => {
    await lexiBookClient.cancelAnalysis(occurrenceId);
    setAnalyzingIds((prev) => ({ ...prev, [occurrenceId]: false }));
    const hlRes = await lexiBookClient.listHighlights(bookId);
    if (hlRes.ok) setHighlights(hlRes.data);
  };

  const handleToggleStudyOptIn = async (occ: OccurrenceWithContext) => {
    if (!occ.sense) return;
    const nextEnabled = !(occ.studyCard && occ.studyCard.enabled);
    const res = await lexiBookClient.setStudyOptIn({
      senseId: occ.sense.id,
      representativeOccurrenceId: occ.occurrence.id,
      enabled: nextEnabled,
    });
    if (res.ok) {
      const hlRes = await lexiBookClient.listHighlights(bookId);
      if (hlRes.ok) setHighlights(hlRes.data);
    }
  };

  const handleDeleteHighlight = async (highlightId: string) => {
    const res = await lexiBookClient.removeHighlight(highlightId);
    if (res.ok) {
      const hlRes = await lexiBookClient.listHighlights(bookId);
      if (hlRes.ok) {
        setHighlights(hlRes.data);
        if (selectedOccurrenceId && !hlRes.data.some((h) => h.occurrence.id === selectedOccurrenceId)) {
          setSelectedOccurrenceId(hlRes.data[0]?.occurrence.id ?? null);
        }
      }
    }
  };

  const openEditSenseModal = (occ: OccurrenceWithContext) => {
    if (!occ.sense) return;
    setEditingSenseOcc(occ);
    setEditContextualMeaning(occ.sense.contextualMeaningVi);
    setEditContextualExplanation(occ.sense.contextualExplanationVi);
    setEditGeneralMeanings(occ.sense.generalMeaningsVi.join(', '));
  };

  const handleSaveEditedSense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSenseOcc?.sense) return;
    const res = await lexiBookClient.editSense({
      senseId: editingSenseOcc.sense.id,
      contextualMeaningVi: editContextualMeaning,
      contextualExplanationVi: editContextualExplanation,
      generalMeaningsVi: editGeneralMeanings
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    });
    if (res.ok) {
      setEditingSenseOcc(null);
      const hlRes = await lexiBookClient.listHighlights(bookId);
      if (hlRes.ok) setHighlights(hlRes.data);
    }
  };

  const currentPageHighlights = useMemo(
    () => highlights.filter((h) => h.highlight.pageNumber1Based === currentPage),
    [highlights, currentPage]
  );

  const filteredSidebarHighlights = useMemo(() => {
    let list =
      sidebarScope === 'page'
        ? highlights.filter((h) => h.highlight.pageNumber1Based === currentPage)
        : [...highlights];

    if (sidebarSearch.trim()) {
      const q = sidebarSearch.trim().toLowerCase();
      list = list.filter(
        (item) =>
          item.highlight.selectedText.toLowerCase().includes(q) ||
          item.lexeme.canonicalForm.toLowerCase().includes(q) ||
          item.sense?.contextualMeaningVi.toLowerCase().includes(q) ||
          item.highlight.sentenceText.toLowerCase().includes(q)
      );
    }

    if (sidebarSort === 'name') {
      list.sort((a, b) =>
        a.lexeme.canonicalForm.localeCompare(b.lexeme.canonicalForm, 'en', {
          sensitivity: 'base',
        })
      );
    } else if (sidebarSort === 'page') {
      list.sort((a, b) => a.highlight.pageNumber1Based - b.highlight.pageNumber1Based);
    } else {
      list.sort((a, b) => b.highlight.createdAt.localeCompare(a.highlight.createdAt));
    }

    return list;
  }, [highlights, sidebarScope, currentPage, sidebarSearch, sidebarSort]);

  const selectedOccurrence = useMemo(
    () => highlights.find((h) => h.occurrence.id === selectedOccurrenceId) ?? null,
    [highlights, selectedOccurrenceId]
  );

  const baseWidth = pageExtraction?.pageWidth ?? 612;
  const baseHeight = pageExtraction?.pageHeight ?? 792;
  const isRotatedSideways = rotation === 90 || rotation === 270;
  const viewportWidth = Math.round((isRotatedSideways ? baseHeight : baseWidth) * zoomScale);
  const viewportHeight = Math.round((isRotatedSideways ? baseWidth : baseHeight) * zoomScale);

  if (loading) {
    return (
      <div className="p-8 text-center text-stone-600" role="status">
        Đang tải trang đọc sách PDF...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.75rem)] bg-stone-100 overflow-hidden">
      {/* Top Reader Toolbar */}
      <div className="bg-white border-b border-stone-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="secondary" size="sm" onClick={onBackToLibrary}>
            ← Thư viện
          </Button>
          <div>
            <h2 className="text-sm font-semibold text-stone-900 line-clamp-1" data-testid="reader-book-title">
              {book?.title ?? 'Tài liệu PDF'}
            </h2>
            <p className="text-xs text-stone-500">
              Trang {currentPage} / {book?.pageCount ?? 1}
            </p>
          </div>
        </div>

        {/* Page Navigation & In-PDF Search */}
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={!book || currentPage <= 1}
            onClick={() => void handlePageChange(currentPage - 1)}
            data-testid="prev-page-btn"
          >
            Trang trước
          </Button>
          <span
            className="px-2.5 py-1 text-xs font-medium bg-stone-100 rounded border border-stone-200"
            data-testid="page-indicator"
          >
            Trang {currentPage} / {book?.pageCount ?? 1}
          </span>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const parsed = Number(pageInputText);
              if (!Number.isNaN(parsed) && parsed >= 1) {
                void handlePageChange(parsed);
              }
            }}
            className="inline-flex items-center gap-1"
          >
            <input
              type="number"
              min={1}
              max={book?.pageCount ?? 1}
              value={pageInputText}
              onChange={(e) => setPageInputText(e.target.value)}
              aria-label="Đi tới số trang"
              title="Nhập số trang và nhấn Enter để chuyển nhanh"
              className="w-16 px-2 py-1 text-xs rounded border border-stone-300 text-center"
              data-testid="jump-page-input"
            />
          </form>
          <Button
            variant="secondary"
            size="sm"
            disabled={!book || currentPage >= book.pageCount}
            onClick={() => void handlePageChange(currentPage + 1)}
            data-testid="next-page-btn"
          >
            Trang sau
          </Button>

          <div className="relative ml-2">
            <input
              type="search"
              value={inPdfQuery}
              onChange={(e) => setInPdfQuery(e.target.value)}
              placeholder="Tìm trong PDF..."
              aria-label="Tìm trong PDF"
              className="w-44 px-2.5 py-1 text-xs rounded border border-stone-300 focus:outline-none focus:ring-2 focus:ring-indigo-600"
              data-testid="in-pdf-search-input"
            />
            {inPdfMatches.length > 0 && (
              <div className="inline-flex items-center gap-1 ml-1.5">
                {inPdfMatches.map((m) => (
                  <button
                    key={m.pageNumber1Based}
                    type="button"
                    onClick={() => void handlePageChange(m.pageNumber1Based)}
                    className="px-1.5 py-0.5 text-[11px] bg-amber-100 text-amber-900 rounded hover:bg-amber-200"
                  >
                    Tr.{m.pageNumber1Based} ({m.count})
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Zoom, Rotation & Sidebar Toggle */}
        <div className="flex items-center gap-1.5">
          {ZOOM_PRESETS.map((preset) => {
            const pct = Math.round(preset * 100);
            const active = Math.abs(zoomScale - preset) < 0.01;
            return (
              <button
                key={pct}
                type="button"
                onClick={() => setZoomScale(preset)}
                data-testid={`zoom-${pct}`}
                className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                  active
                    ? 'bg-indigo-600 text-white'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                {pct}%
              </button>
            );
          })}

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            data-testid="rotate-page-btn"
          >
            Xoay trang ({rotation}°)
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setSidebarOpen((open) => !open)}
            data-testid="toggle-sidebar-btn"
          >
            {sidebarOpen ? 'Thu gọn bảng từ vựng' : 'Mở bảng từ vựng'}
          </Button>
        </div>
      </div>

      {errorMsg && (
        <div className="px-4 pt-2">
          <ErrorBanner messageVi={errorMsg} onRetry={() => void loadReaderData()} />
        </div>
      )}

      {/* Scan-Only Warning Banner */}
      {isScanOnly && (
        <div
          role="alert"
          data-testid="scan-only-banner"
          className="bg-amber-50 border-b border-amber-300 px-4 py-2.5 text-xs text-amber-900 flex items-center justify-between"
        >
          <span>
            <strong>Tài liệu PDF dạng ảnh quét (Scan)</strong> — Chưa hỗ trợ OCR trong phiên bản
            MVP. Bạn vẫn có thể đọc toàn văn nhưng không thể bôi đen từ.
          </span>
          <Badge variant="amber">Không có lớp văn bản (No Text Layer)</Badge>
        </div>
      )}

      {/* Main Split Reader + Sidebar Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left/Center PDF Reading Canvas (~68% width) */}
        <div className="flex-1 flex flex-col overflow-auto p-4 items-center bg-stone-200/70">
          {/* Quick Phrase Selection Bar for Keyboard & Assistive / Deterministic Selection */}
          {!isScanOnly && pageExtraction && (
            <div className="w-full max-w-4xl mb-3 bg-white border border-stone-200 rounded-lg px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 shadow-xs">
              <div className="flex items-center gap-2 text-xs text-stone-600">
                <span className="font-medium text-stone-800">Bôi đen từ trên trang hoặc nhập cụm từ:</span>
                <input
                  type="text"
                  value={customPhraseInput}
                  onChange={(e) => setCustomPhraseInput(e.target.value)}
                  placeholder="Nhập từ/cụm từ trên trang (vd: compound, gain traction)..."
                  aria-label="Nhập cụm từ cần đánh dấu trên trang"
                  data-testid="quick-select-input"
                  className="w-64 px-2.5 py-1 text-xs border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!customPhraseInput.trim()}
                  onClick={() => initiateSelection(customPhraseInput)}
                  data-testid="quick-select-btn"
                >
                  Chọn cụm từ
                </Button>
              </div>
              {pageExtraction.isTwoColumn && (
                <Badge variant="amber">Trang bố cục 2 cột</Badge>
              )}
            </div>
          )}

          {/* Non-blocking Selection Confirmation Bar */}
          {selectionDraft && (
            <div
              role="region"
              aria-label="Xác nhận đánh dấu từ vựng"
              data-testid="selection-confirm-bar"
              className="w-full max-w-4xl mb-4 bg-amber-50 border border-amber-300 rounded-xl p-3.5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1 min-w-[260px]">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="amber">Cụm từ đã chọn</Badge>
                    <span className="font-bold text-stone-900 text-sm" data-testid="selected-phrase-preview">
                      {selectionDraft.selectedText}
                    </span>
                  </div>

                  {selectionDraft.layoutUncertainty ? (
                    <div className="mt-2">
                      <label
                        htmlFor="editable-context-sentence"
                        className="block text-xs font-medium text-amber-900 mb-1"
                      >
                        Bố cục trang phức tạp (2 cột): Bạn có thể kiểm tra hoặc chỉnh sửa câu ngữ
                        cảnh trước khi lưu:
                      </label>
                      <textarea
                        id="editable-context-sentence"
                        data-testid="editable-context-input"
                        rows={2}
                        value={editableSentence}
                        onChange={(e) => setEditableSentence(e.target.value)}
                        className="w-full text-xs p-2 rounded border border-amber-400 bg-white text-stone-900"
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-stone-700 italic mt-1" data-testid="selected-sentence-preview">
                      “{editableSentence}”
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => void handleConfirmHighlight(true)}
                    data-testid="confirm-highlight-btn"
                  >
                    Lưu đánh dấu & Giải thích ngữ cảnh
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleConfirmHighlight(false)}
                    data-testid="save-without-ai-btn"
                  >
                    Chỉ lưu đánh dấu
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectionDraft(null)}
                    data-testid="cancel-selection-btn"
                  >
                    Hủy
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* PDF Page Viewport Surface: Original PDF Canvas + Transparent Selectable Text Overlay */}
          <div
            ref={surfaceRef}
            onMouseUp={handleDomTextSelection}
            data-testid="pdf-page-surface"
            data-zoom-scale={zoomScale}
            data-rotation={rotation}
            style={{
              width: `${viewportWidth}px`,
              minHeight: `${viewportHeight}px`,
            }}
            className={`relative bg-white shadow-md border border-stone-300 rounded-sm transition-all select-text ${
              canvasRendered ? 'p-0 overflow-hidden' : 'p-8'
            }`}
          >
            {/* Layer 1: Authentic PDF.js Page Canvas (100% original PDF layout, fonts, images) */}
            <canvas
              ref={canvasRef}
              data-testid="pdf-page-canvas"
              className={`block pointer-events-none select-none ${
                canvasRendered ? 'opacity-100' : 'hidden'
              }`}
            />

            {/* Layer 2: Persisted Highlight Overlays */}
            <div className="pointer-events-none absolute inset-0 z-10" data-testid="highlight-overlay-layer">
              {currentPageHighlights.map((item) => {
                const anchorCheck =
                  pageExtraction && book
                    ? resolveTextAnchor(
                        pageExtraction.canonicalText,
                        item.highlight.textAnchor,
                        book.sha256
                      )
                    : { resolved: true, anchorUncertain: false };

                const isFocused = activeHighlightId === item.highlight.id;

                return item.highlight.normalizedQuads.map((quad, qIdx) => {
                  const rect = normalizedQuadToViewportRect(
                    quad,
                    viewportWidth,
                    viewportHeight,
                    rotation
                  );
                  return (
                    <div
                      key={`${item.highlight.id}_${qIdx}`}
                      data-testid={`highlight-overlay-${item.highlight.id}`}
                      data-left={Math.round(rect.left)}
                      data-top={Math.round(rect.top)}
                      data-width={Math.round(rect.width)}
                      data-height={Math.round(rect.height)}
                      data-anchor-resolved={String(anchorCheck.resolved)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedOccurrenceId(item.occurrence.id);
                        setActiveHighlightId(item.highlight.id);
                      }}
                      style={{
                        left: `${rect.left}px`,
                        top: `${rect.top}px`,
                        width: `${rect.width}px`,
                        height: `${rect.height}px`,
                      }}
                      title={`${item.highlight.selectedText}: ${
                        item.sense?.contextualMeaningVi ?? 'Đã lưu đánh dấu'
                      }`}
                      className={`pointer-events-auto cursor-pointer absolute rounded-xs transition-all mix-blend-multiply ${
                        isFocused
                          ? 'bg-amber-300/65 ring-2 ring-indigo-600'
                          : 'bg-amber-200/50 hover:bg-amber-300/65'
                      }`}
                    />
                  );
                });
              })}
            </div>

            {/* Layer 3: Selectable Text Layer Overlaid at Exact PDF Coordinates */}
            {isScanOnly ? (
              <div className="h-96 flex flex-col items-center justify-center text-stone-400 border-2 border-dashed border-stone-200 rounded-lg p-6 text-center">
                <p className="text-sm font-medium text-stone-600 mb-1">
                  Trang {currentPage} (Bản quét hình ảnh — Không có lớp văn bản)
                </p>
                <p className="text-xs text-stone-500 max-w-md">
                  Tệp PDF này chỉ chứa dữ liệu điểm ảnh quét (scanned page) và không có toán tử văn
                  bản có thể bôi đen.
                </p>
              </div>
            ) : pageExtraction ? (
              <div
                className={
                  canvasRendered
                    ? 'absolute inset-0 z-20 select-text'
                    : 'relative z-20 space-y-3 select-text'
                }
                data-testid="pdf-text-layer"
              >
                {pageExtraction.items.map((item, idx) => {
                  const offsetInfo = pageExtraction.itemOffsets.find((o) => o.itemIndex === idx);
                  const lineStartOffset = offsetInfo?.startOffset ?? 0;
                  const words = item.str.split(/(\s+)/);
                  let runningChar = lineStartOffset;

                  const ascent = item.ascent ?? 0.89;
                  const leftPx = (item.x / baseWidth) * viewportWidth;
                  const topY = Math.max(0, baseHeight - item.y - item.height * ascent);
                  const topPx = (topY / baseHeight) * viewportHeight;
                  const widthPx = (item.width / baseWidth) * viewportWidth;
                  const fontSizePx = Math.max(8, (item.height / baseHeight) * viewportHeight);
                  const scaleX = canvasRendered
                    ? measureDomTextScaleX(item.str, fontSizePx, item.fontFamily, widthPx)
                    : 1;
                  const cssFontFamily =
                    item.fontFamily === 'sans-serif'
                      ? '"Segoe UI", Arial, sans-serif'
                      : item.fontFamily === 'monospace'
                        ? 'Consolas, "Courier New", monospace'
                        : '"Times New Roman", Georgia, serif';

                  return (
                    <div
                      key={idx}
                      style={
                        canvasRendered
                          ? {
                              position: 'absolute',
                              left: `${leftPx}px`,
                              top: `${topPx}px`,
                              fontSize: `${fontSizePx}px`,
                              fontFamily: cssFontFamily,
                              lineHeight: 1,
                              whiteSpace: 'pre',
                              transformOrigin: '0% 0%',
                              transform: scaleX !== 1 ? `scaleX(${scaleX})` : undefined,
                            }
                          : { fontSize: `${Math.round(15 * zoomScale)}px` }
                      }
                      className={
                        canvasRendered
                          ? 'text-transparent selection:bg-amber-400/35 selection:text-transparent cursor-text'
                          : 'leading-relaxed text-stone-900 font-serif'
                      }
                    >
                      {words.map((token, wIdx) => {
                        const tokenStart = runningChar;
                        runningChar += token.length;
                        const leadingPunctMatch = token.match(/^[.,!?;:()"'“”‘’[\]{}—–-]+/);
                        const leadingPunctLen = leadingPunctMatch ? leadingPunctMatch[0].length : 0;
                        const cleanToken = token
                          .replace(/^[.,!?;:()"'“”‘’[\]{}—–-]+|[.,!?;:()"'“”‘’[\]{}—–-]+$/g, '')
                          .trim();
                        if (!cleanToken) {
                          return (
                            <span key={wIdx} data-start-offset={tokenStart}>
                              {token}
                            </span>
                          );
                        }
                        const cleanStartOffset = tokenStart + leadingPunctLen;
                        return (
                          <span
                            key={wIdx}
                            role="button"
                            tabIndex={0}
                            data-testid={`pdf-word-token-${cleanToken.toLowerCase()}`}
                            data-start-offset={tokenStart}
                            onClick={() => {
                              const sel = window.getSelection?.();
                              if (sel && sel.toString().trim().length >= 2) {
                                return;
                              }
                              initiateSelection(cleanToken, { startOffset: cleanStartOffset });
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                initiateSelection(cleanToken, { startOffset: cleanStartOffset });
                              }
                            }}
                            className={
                              canvasRendered
                                ? 'text-transparent selection:bg-amber-400/35 selection:text-transparent focus:outline-none'
                                : 'cursor-pointer rounded-xs px-0.5 hover:bg-amber-100 focus:outline-none focus:ring-1 focus:ring-indigo-500'
                            }
                          >
                            {token}
                          </span>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

        {/* Right-Hand Resizable Vocabulary Sidebar (~32% width) */}
        {sidebarOpen && (
          <aside
            aria-label="Bảng từ vựng theo sách"
            data-testid="reader-vocab-sidebar"
            style={{ width: `${sidebarWidth}px` }}
            className="bg-white border-l border-stone-200 flex flex-col shrink-0 h-full overflow-hidden"
          >
            {/* Sidebar Header & Scope Tabs */}
            <div className="p-3.5 border-b border-stone-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-stone-900">
                  Từ vựng đã đánh dấu ({highlights.length})
                </h3>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    title="Thu hẹp bảng bên"
                    onClick={() => setSidebarWidth((w) => Math.max(280, w - 40))}
                    className="px-1.5 py-0.5 text-xs text-stone-500 hover:bg-stone-100 rounded"
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    title="Mở rộng bảng bên"
                    onClick={() => setSidebarWidth((w) => Math.min(460, w + 40))}
                    className="px-1.5 py-0.5 text-xs text-stone-500 hover:bg-stone-100 rounded"
                  >
                    ▶
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1 bg-stone-100 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setSidebarScope('book')}
                  data-testid="sidebar-tab-book"
                  className={`py-1 text-xs font-medium rounded-md transition-colors ${
                    sidebarScope === 'book'
                      ? 'bg-white text-stone-900 shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  Tất cả trong sách ({highlights.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarScope('page')}
                  data-testid="sidebar-tab-page"
                  className={`py-1 text-xs font-medium rounded-md transition-colors ${
                    sidebarScope === 'page'
                      ? 'bg-white text-stone-900 shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  Trang này ({currentPageHighlights.length})
                </button>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="search"
                  value={sidebarSearch}
                  onChange={(e) => setSidebarSearch(e.target.value)}
                  placeholder="Tìm từ đã đánh dấu..."
                  aria-label="Tìm từ đã đánh dấu"
                  className="flex-1 px-2.5 py-1 text-xs border border-stone-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
                <select
                  value={sidebarSort}
                  onChange={(e) =>
                    setSidebarSort(e.target.value as 'recent' | 'page' | 'name')
                  }
                  aria-label="Sắp xếp từ vựng"
                  className="px-2 py-1 text-xs border border-stone-300 rounded bg-white"
                >
                  <option value="recent">Mới nhất</option>
                  <option value="page">Theo trang</option>
                  <option value="name">Theo tên A-Z</option>
                </select>
              </div>
            </div>

            {/* Selected Occurrence Detail Panel */}
            {selectedOccurrence && (
              <div
                data-testid="sidebar-detail-panel"
                className="p-3.5 bg-stone-50 border-b border-stone-200 space-y-2.5 max-h-[52%] overflow-y-auto"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-stone-900">
                        {selectedOccurrence.lexeme.canonicalForm}
                      </span>
                      {selectedOccurrence.sense?.ipa && (
                        <span className="text-xs text-stone-500 font-mono">
                          {selectedOccurrence.sense.ipa}
                        </span>
                      )}
                      {selectedOccurrence.lexeme.partOfSpeech && (
                        <Badge variant="neutral">
                          {selectedOccurrence.lexeme.partOfSpeech}
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-stone-500">
                      Trang {selectedOccurrence.highlight.pageNumber1Based}
                    </p>
                  </div>

                  {selectedOccurrence.studyCard?.enabled ? (
                    <Badge variant="indigo">Đang học FSRS</Badge>
                  ) : (
                    <Badge variant="amber">Đã lưu</Badge>
                  )}
                </div>

                {/* AI Generation Loading / Error / Succeeded States */}
                {analyzingIds[selectedOccurrence.occurrence.id] ||
                selectedOccurrence.sense?.generationState === 'loading' ? (
                  <div
                    role="status"
                    data-testid="ai-loading-indicator"
                    className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-900 flex items-center justify-between"
                  >
                    <span>Đang phân tích ngữ cảnh bằng AI...</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        void handleCancelAiAnalysis(selectedOccurrence.occurrence.id)
                      }
                      data-testid="cancel-ai-btn"
                    >
                      Hủy phân tích
                    </Button>
                  </div>
                ) : analysisErrors[selectedOccurrence.occurrence.id] ||
                  selectedOccurrence.sense?.generationState === 'failed' ? (
                  <div
                    role="alert"
                    data-testid="ai-error-panel"
                    className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-900 space-y-2"
                  >
                    <p>
                      {analysisErrors[selectedOccurrence.occurrence.id] ||
                        selectedOccurrence.sense?.aiMetadata?.errorMessageVi ||
                        'Không thể phân tích AI. Đánh dấu của bạn vẫn được lưu an toàn.'}
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        void triggerAiAnalysisForOccurrence(selectedOccurrence.occurrence.id)
                      }
                      data-testid="retry-ai-btn"
                    >
                      Thử lại phân tích
                    </Button>
                  </div>
                ) : selectedOccurrence.sense &&
                  selectedOccurrence.sense.contextualMeaningVi ? (
                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="font-semibold text-stone-700">Nghĩa thông dụng: </span>
                      <span className="text-stone-800">
                        {selectedOccurrence.sense.generalMeaningsVi.join('; ')}
                      </span>
                    </div>
                    <div className="p-2 bg-amber-50/80 border border-amber-200 rounded">
                      <span className="font-semibold text-amber-950 block mb-0.5">
                        Nghĩa trong ngữ cảnh này:
                      </span>
                      <span
                        className="text-stone-900 font-medium"
                        data-testid="detail-contextual-meaning"
                      >
                        {selectedOccurrence.sense.contextualMeaningVi}
                      </span>
                      <p className="text-stone-700 mt-1">
                        {selectedOccurrence.sense.contextualExplanationVi}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-2.5 bg-stone-100 rounded text-xs text-stone-600 flex items-center justify-between">
                    <span>Chưa có giải thích ngữ cảnh AI.</span>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() =>
                        void triggerAiAnalysisForOccurrence(selectedOccurrence.occurrence.id)
                      }
                      data-testid="analyze-now-btn"
                    >
                      Phân tích ngữ cảnh AI
                    </Button>
                  </div>
                )}

                <div className="text-xs">
                  <span className="font-semibold text-stone-700 block mb-0.5">
                    Câu gốc trong sách:
                  </span>
                  <blockquote className="p-2 bg-white border-l-2 border-indigo-500 text-stone-700 italic">
                    “{selectedOccurrence.highlight.sentenceText}”
                  </blockquote>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {selectedOccurrence.sense && (
                    <>
                      <Button
                        variant={selectedOccurrence.studyCard?.enabled ? 'secondary' : 'primary'}
                        size="sm"
                        onClick={() => void handleToggleStudyOptIn(selectedOccurrence)}
                        data-testid="sidebar-study-optin-btn"
                      >
                        {selectedOccurrence.studyCard?.enabled
                          ? 'Đang trong Ôn tập'
                          : 'Đưa vào Ôn tập'}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openEditSenseModal(selectedOccurrence)}
                        data-testid="sidebar-edit-sense-btn"
                      >
                        Chỉnh sửa
                      </Button>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      void handleDeleteHighlight(selectedOccurrence.highlight.id)
                    }
                    data-testid="sidebar-delete-highlight-btn"
                  >
                    Xóa
                  </Button>
                </div>
              </div>
            )}

            {/* Saved Highlights List */}
            <div className="flex-1 overflow-y-auto divide-y divide-stone-100" data-testid="sidebar-highlight-list">
              {filteredSidebarHighlights.length === 0 ? (
                <div className="p-6 text-center text-xs text-stone-500">
                  Chưa có từ vựng nào được đánh dấu trong phạm vi này. Hãy chọn một từ hoặc cụm từ
                  trên trang PDF để bắt đầu.
                </div>
              ) : (
                filteredSidebarHighlights.map((item) => {
                  const isSelected = item.occurrence.id === selectedOccurrenceId;
                  const isAnalyzing =
                    analyzingIds[item.occurrence.id] ||
                    item.sense?.generationState === 'loading';

                  return (
                    <button
                      key={item.occurrence.id}
                      type="button"
                      data-testid={`sidebar-item-${item.lexeme.normalizedKey}`}
                      onClick={() => {
                        setSelectedOccurrenceId(item.occurrence.id);
                        setActiveHighlightId(item.highlight.id);
                        if (item.highlight.pageNumber1Based !== currentPage) {
                          void handlePageChange(item.highlight.pageNumber1Based);
                        }
                      }}
                      className={`w-full text-left p-3 transition-colors hover:bg-stone-50 ${
                        isSelected ? 'bg-indigo-50/60 border-l-4 border-indigo-600' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-xs text-stone-900">
                          {item.highlight.selectedText}
                        </span>
                        <span className="text-[11px] text-stone-500">
                          Tr. {item.highlight.pageNumber1Based}
                        </span>
                      </div>
                      <p className="text-xs text-stone-600 line-clamp-1 mt-0.5">
                        {isAnalyzing
                          ? 'Đang phân tích ngữ cảnh bằng AI...'
                          : item.sense?.contextualMeaningVi || 'Đã lưu đánh dấu ngữ cảnh'}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Edit Sense Modal */}
      <Modal
        isOpen={Boolean(editingSenseOcc)}
        onClose={() => setEditingSenseOcc(null)}
        title="Chỉnh sửa nghĩa từ vựng theo ngữ cảnh"
      >
        <form onSubmit={(e) => void handleSaveEditedSense(e)} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">
              Nghĩa trong ngữ cảnh này
            </label>
            <input
              type="text"
              value={editContextualMeaning}
              onChange={(e) => setEditContextualMeaning(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-stone-300 rounded"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">
              Giải thích tiếng Việt
            </label>
            <textarea
              rows={3}
              value={editContextualExplanation}
              onChange={(e) => setEditContextualExplanation(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-stone-300 rounded"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-700 mb-1">
              Nghĩa thông dụng (phân tách bằng dấu phẩy)
            </label>
            <input
              type="text"
              value={editGeneralMeanings}
              onChange={(e) => setEditGeneralMeanings(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-stone-300 rounded"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setEditingSenseOcc(null)}>
              Hủy
            </Button>
            <Button variant="primary" type="submit">
              Lưu chỉnh sửa
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
