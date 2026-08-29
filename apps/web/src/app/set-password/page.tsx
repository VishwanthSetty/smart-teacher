import { SetPasswordForm } from './_components/set-password-form';
import { AuthShell } from '@/components/auth/auth-shell';
import { ApiError, apiPreviewInvite } from '@/lib/api-client';

interface SetPasswordPageProps {
  searchParams: { token?: string };
}

export default async function SetPasswordPage({ searchParams }: SetPasswordPageProps) {
  const token = searchParams.token;
  const preview = token ? await apiPreviewInvite(token).catch((error: unknown) => {
    if (error instanceof ApiError) return null;
    throw error;
  }) : null;

  return (
    <AuthShell>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{preview ? `Welcome, ${preview.name.split(' ')[0]}` : 'Activate your account'}</h1>
          <p className="mt-1 text-sm text-ink-muted">{preview ? `Set a password to activate your account at ${preview.schoolName}.` : 'Create a password to finish setting up your account.'}</p>
        </div>
        {token && preview ? (
          <SetPasswordForm token={token} preview={preview} />
        ) : (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-status-danger">This invite link is invalid.</p>
        )}
      </div>
    </AuthShell>
  );
}
