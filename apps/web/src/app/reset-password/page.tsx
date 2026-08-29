import { ResetPasswordForm } from './_components/reset-password-form';
import { AuthShell } from '@/components/auth/auth-shell';

interface ResetPasswordPageProps {
  searchParams: { token?: string };
}

export default function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const token = searchParams.token;

  return (
    <AuthShell>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Choose a new password</h1>
          <p className="mt-1 text-sm text-ink-muted">Use a strong password you haven’t used before.</p>
        </div>
        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-status-danger">This reset link is invalid.</p>
        )}
      </div>
    </AuthShell>
  );
}
