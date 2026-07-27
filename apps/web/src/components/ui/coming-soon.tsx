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
        title="Coming soon"
        description="This section isn't available yet. It will light up once the feature ships."
      />
    </>
  );
}
