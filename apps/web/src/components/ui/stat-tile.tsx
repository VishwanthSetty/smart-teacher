import Link from 'next/link';
import type { ReactNode } from 'react';

interface StatTileProps {
  label: string;
  // null means "not measurable yet", rendered as an em dash rather than a misleading 0.
  value: number | null;
  icon: ReactNode;
  hint?: string;
  href?: string;
}

export function StatTile({ label, value, icon, hint, href }: StatTileProps) {
  const body = (
    <div className="flex h-full items-center gap-4 rounded-card border border-surface-border bg-white p-5 shadow-card transition hover:border-brand-soft">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand-blue">
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{label}</span>
      <span className="mt-1 text-[28px] font-semibold leading-none tabular-nums text-ink">
        {value === null ? '—' : value}
      </span>
      {hint && <span className="mt-2 text-xs text-ink-muted">{hint}</span>}
      </div>
    </div>
  );

  if (!href) {
    return body;
  }

  return (
    <Link href={href} className="block h-full rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue">
      {body}
    </Link>
  );
}
