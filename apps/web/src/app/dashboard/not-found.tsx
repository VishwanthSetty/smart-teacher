import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';

export default function DashboardNotFound() {
  return (
    <section className="flex min-h-[65vh] items-center justify-center">
      <div className="max-w-lg text-center">
        <div className="text-8xl font-semibold leading-none text-brand-soft">404</div>
        <h1 className="mt-6 text-2xl font-semibold text-ink">Page not found</h1>
        <p className="mt-2 text-sm text-ink-muted">The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/dashboard">Back to dashboard</ButtonLink>
          <Link href="/dashboard" className="inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-medium text-ink-muted hover:bg-brand-tint hover:text-brand-navy">
            <ArrowLeft className="h-4 w-4" /> Go back
          </Link>
        </div>
      </div>
    </section>
  );
}
