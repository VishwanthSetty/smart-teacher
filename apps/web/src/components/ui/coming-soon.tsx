import type { ReactNode } from 'react';
import { EmptyState } from './empty-state';
import { PageHeader } from './page-header';

interface ComingSoonProps {
  title: string;
  description: string;
  icon: ReactNode;
}

// Placeholder body for nav sections whose backing models don't exist yet. Each feature
// ticket replaces the <ComingSoon> call with its real content; the surrounding shell,
// route, and role gate are already in place.
export function ComingSoon({ title, description, icon }: ComingSoonProps) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <EmptyState
        icon={icon}
        title={title}
        description={description}
        action={<span className="rounded-full bg-brand-tint px-3 py-1 text-xs font-semibold text-brand-navy">Coming soon</span>}
      />
    </>
  );
}
