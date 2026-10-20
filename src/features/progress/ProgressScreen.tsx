import React, { useCallback, useEffect, useState } from 'react';
import { lexiBookClient } from '../../shared/api/client';
import type { ProgressMetrics } from '../../shared/types/contracts';
import { Badge, Button, EmptyState, ErrorBanner } from '../../shared/ui/components';

export interface ProgressScreenProps {
  onOpenBook?: (bookId: string) => void;
  onStartStudy?: () => void;
}

export const ProgressScreen: React.FC<ProgressScreenProps> = ({
  onOpenBook,
  onStartStudy,
}) => {
  const [metrics, setMetrics] = useState<ProgressMetrics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    const res = await lexiBookClient.getProgressMetrics();
    if (res.ok) {
      setMetrics(res.data);
    } else {
      setErrorMessage(res.error.messageVi);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="space-y-6 max-w-7xl mx-auto"
        data-testid="progress-loading"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((n) => (
            <div
              key={n}
              className="h-28 rounded-xl border border-[#E2DFD7] bg-white p-4 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (errorMessage || !metrics) {
    return (
      <div className="max-w-7xl mx-auto" data-testid="progress-error">
        <ErrorBanner
          messageVi={errorMessage ?? 'Không thể tải dữ liệu tiến độ.'}
          onRetry={() => void loadMetrics()}
        />
      </div>
    );
  }

  const isZeroData =
    metrics.uniqueLexemesCount === 0 &&
    metrics.totalHighlightsCount === 0 &&
    metrics.bookBreakdown.length === 0;

  const maxDailyTotal = Math.max(
    1,
    ...metrics.sevenDayActivity.map((d) => d.reviewsCount + d.quizQuestionsCount)
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto" data-testid="progress-screen">
      {/* KPI Cards */}
      <section aria-label="Chỉ số học tập tổng quan" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="rounded-xl border border-[#E2DFD7] bg-white p-4 shadow-xs">
          <p className="text-xs font-medium text-[#525866]">Từ vựng đã lưu</p>
          <p className="mt-2 text-2xl font-bold text-[#1E2024]" data-testid="kpi-unique-lexemes">
            {metrics.uniqueLexemesCount}
          </p>
          <p className="mt-1 text-xs text-[#525866]">
            {metrics.totalHighlightsCount} ngữ cảnh · {metrics.savedOnlyCount} chỉ lưu
          </p>
        </div>

        <div className="rounded-xl border border-[#E2DFD7] bg-white p-4 shadow-xs">
          <p className="text-xs font-medium text-[#525866]">Đang học (FSRS)</p>
          <p className="mt-2 text-2xl font-bold text-[#3F51B5]" data-testid="kpi-studying-cards">
            {metrics.studyingCardCount}
          </p>
          <p className="mt-1 text-xs text-[#525866]">Thẻ đang trong lịch lặp lại ngắt quãng</p>
        </div>

        <div className="rounded-xl border border-[#E2DFD7] bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between gap-1">
            <p className="text-xs font-medium text-[#525866]">Đã thành thạo</p>
            <Badge variant="green">Mastered</Badge>
          </div>
          <p className="mt-2 text-2xl font-bold text-[#15803D]" data-testid="kpi-mastered-cards">
            {metrics.masteredCardCount}
          </p>
          <p className="mt-1 text-xs text-[#525866]" data-testid="mastered-rule-description">
            {metrics.masteredRuleDescriptionVi}
          </p>
        </div>

        <div className="rounded-xl border border-[#E2DFD7] bg-white p-4 shadow-xs">
          <p className="text-xs font-medium text-[#525866]">Cần ôn hôm nay</p>
          <p className="mt-2 text-2xl font-bold text-[#1E2024]" data-testid="kpi-due-today">
            {metrics.dueTodayCount}
          </p>
          <p className="mt-1 text-xs text-[#525866]">
            Đã ôn hôm nay: <strong>{metrics.reviewedTodayCount}</strong>
          </p>
        </div>

        <div className="rounded-xl border border-[#E2DFD7] bg-white p-4 shadow-xs">
          <p className="text-xs font-medium text-[#525866]">Độ chính xác Quiz</p>
          <p className="mt-2 text-2xl font-bold text-[#1E2024]" data-testid="kpi-quiz-accuracy">
            {metrics.quizAccuracyPercent !== null
              ? `${metrics.quizAccuracyPercent}%`
              : 'Chưa có dữ liệu'}
          </p>
          <p className="mt-1 text-xs text-[#525866]">
            {metrics.quizCorrectQuestions}/{metrics.quizTotalQuestions} câu
          </p>
        </div>
      </section>

      {isZeroData ? (
        <EmptyState
          testId="progress-empty-state"
          title="Chưa có dữ liệu học tập"
          description="Khi bạn đọc sách PDF, đánh dấu từ vựng và ôn tập bằng FSRS hoặc làm bài Quiz, thống kê thực tế sẽ hiển thị tại đây."
          actionLabel={onStartStudy ? 'Bắt đầu học' : undefined}
          onAction={onStartStudy}
        />
      ) : null}

      {/* 7-Day Activity Bar Chart */}
      <section
        aria-label="Hoạt động 7 ngày gần nhất"
        className="rounded-xl border border-[#E2DFD7] bg-white p-5 shadow-xs space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-[#1E2024]">Hoạt động 7 ngày gần nhất</h2>
            <p className="text-xs text-[#525866]">
              Thống kê số lượt ôn thẻ FSRS và số câu trả lời Quiz theo ngày thực tế trên máy
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-[#525866]">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-xs bg-[#3F51B5]" />
              Lượt ôn thẻ
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-xs bg-[#F59E0B]" />
              Câu hỏi Quiz
            </span>
          </div>
        </div>

        <div
          className="grid grid-cols-7 gap-3 pt-2 items-end h-40"
          data-testid="seven-day-chart"
        >
          {metrics.sevenDayActivity.map((point) => {
            const total = point.reviewsCount + point.quizQuestionsCount;
            const heightPercent = total > 0 ? Math.max(12, Math.round((total / maxDailyTotal) * 100)) : 4;
            return (
              <div
                key={point.localDate}
                className="flex flex-col items-center justify-end h-full gap-1.5"
              >
                <span className="text-[11px] font-medium text-[#525866]">
                  {total}
                </span>
                <div className="w-full max-w-[42px] bg-[#F1EFEA] rounded-t-md h-24 flex items-end overflow-hidden">
                  <div
                    role="img"
                    aria-label={`Ngày ${point.localDate}: ${point.reviewsCount} lượt ôn, ${point.quizQuestionsCount} câu quiz`}
                    className="w-full bg-[#3F51B5] rounded-t-md transition-all"
                    style={{ height: `${heightPercent}%` }}
                  />
                </div>
                <span className="text-[11px] text-[#525866] font-mono">
                  {point.localDate.slice(5)}
                </span>
              </div>
            );
          })}
        </div>

        <div className="overflow-x-auto pt-2 border-t border-[#E2DFD7]">
          <table className="w-full text-left text-xs text-[#525866]">
            <thead>
              <tr className="border-b border-[#E2DFD7]">
                <th className="py-1.5 font-medium">Ngày</th>
                <th className="py-1.5 font-medium">Lượt ôn FSRS</th>
                <th className="py-1.5 font-medium">Câu hỏi Quiz</th>
              </tr>
            </thead>
            <tbody>
              {metrics.sevenDayActivity.map((point) => (
                <tr key={point.localDate} className="border-b border-[#F1EFEA] last:border-0">
                  <td className="py-1.5 font-mono text-[#1E2024]">{point.localDate}</td>
                  <td className="py-1.5">{point.reviewsCount} lượt ôn</td>
                  <td className="py-1.5">{point.quizQuestionsCount} câu quiz</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Per-book progress breakdown table */}
      <section
        aria-label="Tiến độ theo từng cuốn sách"
        className="rounded-xl border border-[#E2DFD7] bg-white p-5 shadow-xs space-y-4"
      >
        <div>
          <h2 className="text-base font-semibold text-[#1E2024]">Tiến độ theo từng cuốn sách</h2>
          <p className="text-xs text-[#525866]">
            Chi tiết trang đọc, số điểm đánh dấu và trạng thái thẻ ôn tập của từng sách trong thư viện
          </p>
        </div>

        {metrics.bookBreakdown.length === 0 ? (
          <p className="text-sm text-[#525866] py-4" data-testid="no-books-breakdown">
            Chưa có cuốn sách nào trong thư viện.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="book-breakdown-table">
              <thead>
                <tr className="border-b border-[#E2DFD7] text-xs text-[#525866]">
                  <th className="py-2.5 pr-4 font-medium">Tên sách</th>
                  <th className="py-2.5 px-3 font-medium">Tiến độ đọc</th>
                  <th className="py-2.5 px-3 font-medium">Đánh dấu</th>
                  <th className="py-2.5 px-3 font-medium">Đang học</th>
                  <th className="py-2.5 px-3 font-medium">Đã thành thạo</th>
                  <th className="py-2.5 px-3 font-medium">Cần ôn</th>
                  <th className="py-2.5 pl-3 font-medium text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {metrics.bookBreakdown.map((item) => (
                  <tr
                    key={item.bookId}
                    className="border-b border-[#F1EFEA] last:border-0 hover:bg-[#F8F6F1]/60"
                  >
                    <td className="py-3 pr-4 font-medium text-[#1E2024]">{item.title}</td>
                    <td className="py-3 px-3 text-xs text-[#525866]">
                      Trang {item.lastPage}/{item.pageCount} ({item.progressPercent}%)
                    </td>
                    <td className="py-3 px-3">{item.highlightCount}</td>
                    <td className="py-3 px-3">{item.studyingCardCount}</td>
                    <td className="py-3 px-3 text-[#15803D] font-medium">
                      {item.masteredCardCount}
                    </td>
                    <td className="py-3 px-3">
                      <Badge variant={item.dueCardCount > 0 ? 'indigo' : 'neutral'}>
                        {item.dueCardCount}
                      </Badge>
                    </td>
                    <td className="py-3 pl-3 text-right">
                      {onOpenBook && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onOpenBook(item.bookId)}
                        >
                          Đọc tiếp
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
