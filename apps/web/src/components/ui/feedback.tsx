import clsx from 'clsx';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import type { ReactNode } from 'react';

type FeedbackVariant = 'success' | 'error' | 'warning' | 'info';

const styles: Record<FeedbackVariant, { border: string; icon: string; Icon: typeof Info }> = {
  success: { border: 'border-l-status-success', icon: 'text-status-success', Icon: CheckCircle2 },
  error: { border: 'border-l-status-danger', icon: 'text-status-danger', Icon: AlertCircle },
  warning: { border: 'border-l-status-warning', icon: 'text-status-warning', Icon: AlertTriangle },
  info: { border: 'border-l-status-info', icon: 'text-status-info', Icon: Info },
};

export function FeedbackToast({
  title,
  children,
  variant,
  onDismiss,
}: {
  title: string;
  children: ReactNode;
  variant: FeedbackVariant;
  onDismiss?: () => void;
}) {
  const style = styles[variant];
  return (
    <div className={clsx('flex w-full max-w-sm gap-3 rounded-card border border-l-4 border-surface-border bg-white p-4 shadow-overlay', style.border)} role={variant === 'error' ? 'alert' : 'status'}>
      <style.Icon className={clsx('mt-0.5 h-5 w-5 shrink-0', style.icon)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <div className="mt-0.5 text-sm text-ink-muted">{children}</div>
      </div>
      {onDismiss ? (
        <button type="button" onClick={onDismiss} className="rounded-md p-1 text-ink-muted hover:bg-slate-100" aria-label="Dismiss notification">
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-card border border-red-200 border-l-4 border-l-status-danger bg-red-50 px-4 py-3 text-sm text-red-800">
      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

export function InlineFieldError({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-xs text-status-danger">{children}</p>;
}
