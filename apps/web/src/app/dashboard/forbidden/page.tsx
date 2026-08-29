import { LockKeyhole } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { requireUser } from '@/lib/session';

export default async function ForbiddenPage() {
  await requireUser();
  return (
    <section className="flex min-h-[65vh] items-center justify-center">
      <div className="max-w-lg text-center">
        <span className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-brand-tint text-brand-blue">
          <LockKeyhole className="h-11 w-11" aria-hidden="true" />
        </span>
        <h1 className="mt-6 text-2xl font-semibold text-ink">You don&apos;t have access to this</h1>
        <p className="mt-2 text-sm text-ink-muted">Ask your administrator if you think this is a mistake.</p>
        <div className="mt-6"><ButtonLink href="/dashboard">Back to dashboard</ButtonLink></div>
      </div>
    </section>
  );
}
