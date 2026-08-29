import { toSafeRedirect } from '@/lib/safe-redirect';
import { LoginForm } from './_components/login-form';
import { AuthShell } from '@/components/auth/auth-shell';

// A server component so `next` arrives as a plain prop. Reading it with
// useSearchParams() in the client form would force a <Suspense> boundary here to keep
// Next's static generation working.
export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string | string[] };
}) {
  return (
    <AuthShell>
      <LoginForm redirectTo={toSafeRedirect(searchParams.next)} />
    </AuthShell>
  );
}
