import React, { useEffect, useId } from 'react';

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
    'bg-[#3F51B5] text-white hover:bg-[#303F9F] active:bg-[#283593] border border-transparent shadow-xs',
  secondary:
    'bg-white text-[#1E2024] hover:bg-[#F1EFEA] active:bg-[#E2DFD7] border border-[#E2DFD7]',
  ghost:
    'bg-transparent text-[#525866] hover:bg-[#F1EFEA] hover:text-[#1E2024] border border-transparent',
  danger:
    'bg-[#DC2626] text-white hover:bg-[#B91C1C] active:bg-[#991B1B] border border-transparent shadow-xs',
};

const BUTTON_SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1 text-xs rounded-md gap-1.5',
  md: 'px-3.5 py-2 text-sm rounded-md gap-2',
  lg: 'px-5 py-2.5 text-base rounded-lg gap-2.5',
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
        className={`inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3F51B5] disabled:opacity-55 disabled:pointer-events-none cursor-pointer ${BUTTON_VARIANT_CLASSES[variant]} ${BUTTON_SIZE_CLASSES[size]} ${className}`}
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
  neutral: 'bg-[#F1EFEA] text-[#525866] border-[#E2DFD7]',
  amber: 'bg-[#FEF3C7] text-[#92400E] border-[#F59E0B]/40',
  indigo: 'bg-[#E8EAF6] text-[#283593] border-[#3F51B5]/30',
  green: 'bg-[#DCFCE7] text-[#15803D] border-[#15803D]/30',
  danger: 'bg-[#FEE2E2] text-[#B91C1C] border-[#DC2626]/30',
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  className = '',
  children,
  ...rest
}) => {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${BADGE_VARIANT_CLASSES[variant]} ${className}`}
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
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
        className={`w-full ${MODAL_SIZE_CLASSES[size]} rounded-xl bg-white border border-[#E2DFD7] shadow-xl overflow-hidden text-[#1E2024]`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2DFD7]">
          <h2 id={titleId} className="text-base font-semibold text-[#1E2024]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabelVi}
            className="rounded-md p-1.5 text-[#525866] hover:bg-[#F1EFEA] hover:text-[#1E2024] focus-visible:outline-2 focus-visible:outline-[#3F51B5]"
          >
            ✕
          </button>
        </div>
        <div className="px-5 py-4 text-sm text-[#1E2024]">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 bg-[#F8F6F1] border-t border-[#E2DFD7]">
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
      className="flex flex-col items-center justify-center text-center rounded-xl border border-dashed border-[#E2DFD7] bg-white px-6 py-12"
    >
      {icon && <div className="mb-3 text-[#525866]">{icon}</div>}
      <h3 className="text-base font-semibold text-[#1E2024]">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm text-[#525866]">{description}</p>
      {(actionLabel && onAction) || secondaryAction ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          {actionLabel && onAction && (
            <Button variant="primary" onClick={onAction}>
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
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#DC2626]/30 bg-[#FEF2F2] px-4 py-3 text-sm text-[#991B1B]"
    >
      <div className="flex-1 min-w-[220px]">
        <p className="font-medium">{messageVi}</p>
        {details && <p className="mt-0.5 text-xs text-[#B91C1C]">{details}</p>}
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
      className="rounded-xl border border-[#3F51B5]/25 bg-white p-5 shadow-xs"
    >
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Badge variant="indigo">Ưu tiên cục bộ (Local-first)</Badge>
            <h2 className="text-base font-semibold text-[#1E2024]">
              Chào mừng bạn đến với LexiBook AI
            </h2>
          </div>
          <p className="text-sm text-[#525866] leading-relaxed">
            Sách PDF, đánh dấu trang (highlight), từ vựng và lịch ôn tập FSRS được lưu trữ{' '}
            <strong className="text-[#1E2024]">100% cục bộ trên máy tính (PC)</strong> của bạn. Chỉ
            khi bạn xác nhận tra cứu từ vựng, đoạn trích ngắn tối thiểu mới được gửi tới Google
            Gemini bằng khóa API cá nhân. Bạn có thể bỏ qua thiết lập khóa API để nhập sách và đọc
            ngoại tuyến ngay lập tức.
          </p>
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
