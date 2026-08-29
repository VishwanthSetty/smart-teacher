import Link from 'next/link';
import clsx from 'clsx';

export interface FilterTab {
  label: string;
  href: string;
  isActive: boolean;
}

export function FilterTabs({ tabs }: { tabs: FilterTab[] }) {
  return (
    <nav className="flex items-center gap-6" aria-label="Filters">
      {tabs.map((tab) => (
        <Link
          key={`${tab.href}-${tab.label}`}
          href={tab.href}
          className={clsx(
            'border-b-2 px-0.5 py-2 text-sm font-medium transition',
            tab.isActive
              ? 'border-brand-blue text-brand-blue'
              : 'border-transparent text-ink-muted hover:text-ink',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
