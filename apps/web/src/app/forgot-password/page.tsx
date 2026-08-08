import { ForgotPasswordForm } from './_components/forgot-password-form';

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
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Reset your password</h1>
        <ForgotPasswordForm initialSchoolSlug={schoolSlug} />
      </div>
    </main>
  );
}
