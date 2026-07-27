import { SetPasswordForm } from './_components/set-password-form';

interface SetPasswordPageProps {
  searchParams: { token?: string };
}

export default function SetPasswordPage({ searchParams }: SetPasswordPageProps) {
  const token = searchParams.token;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">Set your password</h1>
        {token ? (
          <SetPasswordForm token={token} />
        ) : (
          <p className="text-sm text-red-600">This invite link is invalid.</p>
        )}
      </div>
    </main>
  );
}
