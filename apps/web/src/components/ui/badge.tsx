import clsx from 'clsx';
import type { ReactNode } from 'react';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const variants: Record<BadgeVariant, string> = {
  success: 'bg-green-100 text-green-800',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-800',
  info: 'bg-brand-tint text-brand-navy',
  neutral: 'bg-slate-100 text-slate-700',
};

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  ACTIVE: 'success',
  READY: 'success',
  PUBLISHED: 'success',
  PENDING: 'warning',
  QUEUED: 'warning',
  DRAFT: 'warning',
  PROCESSING: 'info',
  UPLOADING: 'neutral',
  DISABLED: 'danger',
  FAILED: 'danger',
  SUSPENDED: 'danger',
  ARCHIVED: 'neutral',
  RETIRED: 'neutral',
};

export function Badge({
  children,
  variant = 'neutral',
  className,
}: {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_VARIANTS[status] ?? 'neutral'}>{status}</Badge>;
}
