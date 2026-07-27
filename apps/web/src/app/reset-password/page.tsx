import { ResetPasswordForm } from './_components/reset-password-form';

interface ResetPasswordPageProps {
  searchParams: { token?: string };
}

export default function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const token = searchParams.token;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Set a new password</h1>
        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <p className="text-sm text-red-600">This reset link is invalid.</p>
        )}
      </div>
    </main>
  );
}
