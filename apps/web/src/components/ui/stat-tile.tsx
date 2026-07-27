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
    <div className="flex h-full flex-col gap-3 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500">{label}</span>
        <span className="text-gray-400">{icon}</span>
      </div>
      <span className="text-3xl font-semibold tabular-nums text-gray-900">
        {value === null ? '—' : value}
      </span>
      {hint && <span className="text-xs text-gray-400">{hint}</span>}
    </div>
  );

  if (!href) {
    return body;
  }

  return (
    <Link href={href} className="block rounded-lg transition hover:opacity-80">
      {body}
    </Link>
  );
}
