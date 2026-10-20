import React, { useEffect, useId } from 'react';
import { AlertCircle, CheckCircle2, Info, Sparkles, X } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: React.ReactNode;
}

const BUTTON_VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-[#3F51B5] text-white hover:bg-[#32408F] active:bg-[#283593] border border-transparent shadow-xs',
  secondary:
    'bg-white text-[#18181B] hover:bg-[#F5F3EE] active:bg-[#EAE6DF] border border-[#E4E1DA] shadow-2xs',
  ghost:
    'bg-transparent text-[#52525B] hover:bg-[#EFECE6] hover:text-[#18181B] border border-transparent',
  danger:
    'bg-[#DC2626] text-white hover:bg-[#B91C1C] active:bg-[#991B1B] border border-transparent shadow-xs',
};

const BUTTON_SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs rounded-lg gap-1.5',
  md: 'px-3.5 py-2 text-sm rounded-lg gap-2',
  lg: 'px-5 py-2.5 text-sm font-semibold rounded-xl gap-2.5',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled,
      leftIcon,
      className = '',
      children,
      type = 'button',
      ...rest
    },
    ref
  ) => {
    const isDisabled = Boolean(disabled || loading);

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        className={`inline-flex items-center justify-center font-medium transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3F51B5] disabled:opacity-50 disabled:pointer-events-none cursor-pointer select-none ${BUTTON_VARIANT_CLASSES[variant]} ${BUTTON_SIZE_CLASSES[size]} ${className}`}
        {...rest}
      >
        {loading ? (
          <span
            aria-hidden="true"
            className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        ) : (
          leftIcon
        )}
        <span>{children}</span>
      </button>
    );
  }
);
Button.displayName = 'Button';

export type BadgeVariant = 'neutral' | 'amber' | 'indigo' | 'green' | 'danger';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  children: React.ReactNode;
}

const BADGE_VARIANT_CLASSES: Record<BadgeVariant, string> = {
  neutral: 'bg-[#F3F1EC] text-[#52525B] border-[#E4E1DA]',
  amber: 'bg-[#FEF3C7]/90 text-[#92400E] border-[#F59E0B]/35',
  indigo: 'bg-[#EEF2FF] text-[#3730A3] border-[#6366F1]/25',
  green: 'bg-[#DCFCE7]/90 text-[#166534] border-[#22C55E]/30',
  danger: 'bg-[#FEE2E2] text-[#991B1B] border-[#EF4444]/30',
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  className = '',
  children,
  ...rest
}) => {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${BADGE_VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {children}
    </span>
  );
};

export interface ModalProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  closeLabelVi?: string;
}

const MODAL_SIZE_CLASSES: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  title,
  onClose,
  children,
  footer,
  size = 'md',
  closeLabelVi = 'Đóng hộp thoại',
}) => {
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`w-full ${MODAL_SIZE_CLASSES[size]} rounded-2xl bg-white border border-[#E4E1DA] shadow-2xl overflow-hidden text-[#18181B]`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E4E1DA] bg-[#FAF9F6]">
          <h2 id={titleId} className="text-base font-semibold text-[#18181B]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabelVi}
            className="rounded-lg p-1.5 text-[#52525B] hover:bg-[#EFECE6] hover:text-[#18181B] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5 text-sm text-[#18181B] leading-relaxed">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2.5 px-6 py-3.5 bg-[#FAF9F6] border-t border-[#E4E1DA]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryAction?: React.ReactNode;
  testId?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryAction,
  testId,
}) => {
  return (
    <div
      data-testid={testId}
      className="flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-[#D6D2C8] bg-white/80 px-8 py-14 shadow-2xs"
    >
      {icon ? (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EEF2FF] text-[#3F51B5]">
          {icon}
        </div>
      ) : (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F3F1EC] text-[#52525B]">
          <Info className="w-6 h-6" />
        </div>
      )}
      <h3 className="text-base font-semibold text-[#18181B]">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm text-[#52525B] leading-relaxed">{description}</p>
      {(actionLabel && onAction) || secondaryAction ? (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {actionLabel && onAction && (
            <Button variant="primary" size="md" onClick={onAction}>
              {actionLabel}
            </Button>
          )}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
};

export interface ErrorBannerProps {
  messageVi: string;
  details?: string;
  onRetry?: () => void;
  onDismiss?: () => void;
  retryLabelVi?: string;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({
  messageVi,
  details,
  onRetry,
  onDismiss,
  retryLabelVi = 'Thử lại',
}) => {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#EF4444]/30 bg-[#FEF2F2] px-4 py-3 text-sm text-[#991B1B] shadow-2xs"
    >
      <div className="flex items-start gap-2.5 flex-1 min-w-[220px]">
        <AlertCircle className="w-4 h-4 text-[#DC2626] shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">{messageVi}</p>
          {details && <p className="mt-0.5 text-xs text-[#B91C1C]">{details}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {retryLabelVi}
          </Button>
        )}
        {onDismiss && (
          <Button variant="ghost" size="sm" onClick={onDismiss} aria-label="Đóng thông báo lỗi">
            Đóng
          </Button>
        )}
      </div>
    </div>
  );
};

export interface OnboardingBannerProps {
  onDismiss: () => void;
  onOpenSettings?: () => void;
}

export const OnboardingBanner: React.FC<OnboardingBannerProps> = ({
  onDismiss,
  onOpenSettings,
}) => {
  return (
    <section
      aria-label="Giới thiệu quyền riêng tư và hướng dẫn bắt đầu"
      data-testid="onboarding-banner"
      className="rounded-2xl border border-[#3F51B5]/20 bg-gradient-to-r from-[#EEF2FF]/70 via-white to-[#FEF3C7]/35 p-5 shadow-xs"
    >
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <Badge variant="indigo">
              <Sparkles className="w-3 h-3" />
              Ưu tiên cục bộ (Local-first)
            </Badge>
            <h2 className="text-base font-semibold text-[#18181B]">
              Chào mừng bạn đến với LexiBook AI
            </h2>
          </div>
          <p className="text-sm text-[#52525B] leading-relaxed max-w-3xl">
            Sách PDF, đánh dấu trang (highlight), từ vựng và lịch ôn tập FSRS được lưu trữ{' '}
            <strong className="text-[#18181B]">100% cục bộ trên máy tính (PC)</strong> của bạn. Chỉ
            khi bạn xác nhận tra cứu từ vựng, đoạn trích ngắn tối thiểu mới được gửi tới Google
            Gemini bằng khóa API cá nhân. Bạn có thể đọc sách và đánh dấu ngoại tuyến ngay lập tức.
          </p>
          <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-[#52525B]">
            <span className="inline-flex items-center gap-1.5 font-medium text-[#18181B]">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#15803D]" />
              1. Nhập sách PDF tiếng Anh
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium text-[#18181B]">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#3F51B5]" />
              2. Bôi đen cụm từ trên trang để dịch ngữ cảnh
            </span>
            <span className="inline-flex items-center gap-1.5 font-medium text-[#18181B]">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#D97706]" />
              3. Đưa từ quan trọng vào lịch ôn tập FSRS
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {onOpenSettings && (
            <Button variant="secondary" size="md" onClick={onOpenSettings}>
              Cấu hình khóa Gemini
            </Button>
          )}
          <Button variant="primary" size="md" onClick={onDismiss}>
            Đã hiểu &amp; Bắt đầu đọc
          </Button>
        </div>
      </div>
    </section>
  );
};
