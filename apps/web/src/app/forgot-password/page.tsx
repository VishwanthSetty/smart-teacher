import { ForgotPasswordForm } from './_components/forgot-password-form';
import { AuthShell } from '@/components/auth/auth-shell';

interface ForgotPasswordPageProps {
  searchParams: { schoolSlug?: string | string[] };
}

// A server component so `schoolSlug` (carried over from the login form's "Forgot
// password?" link) arrives as a plain prop — reading it with useSearchParams() in the
// client form would force a <Suspense> boundary here, same reasoning as login/page.tsx.
export default function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const raw = searchParams.schoolSlug;
  const schoolSlug = typeof raw === 'string' ? raw : '';

  return (
    <AuthShell>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Forgot your password?</h1>
          <p className="mt-1 text-sm text-ink-muted">We’ll send you a secure reset link.</p>
        </div>
        <ForgotPasswordForm initialSchoolSlug={schoolSlug} />
      </div>
    </AuthShell>
  );
}
