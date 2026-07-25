import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Role } from '@smart-teacher/shared-types';
import { apiGetMe } from '@/lib/api-client';
import { getAccessToken } from '@/lib/session';
import { LogoutButton } from './logout-button';

export default async function DashboardPage() {
  const accessToken = getAccessToken();
  if (!accessToken) {
    redirect('/login');
  }

  const user = await apiGetMe(accessToken).catch(() => null);
  if (!user) {
    redirect('/login');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <LogoutButton />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-lg">
          Hello, <span className="font-medium">{user.name}</span>, role:{' '}
          <span className="font-mono text-sm">{user.role}</span>
        </p>
      </div>

      {user.role === Role.SUPER_ADMIN && (
        <Link
          href="/dashboard/schools"
          className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          Manage schools
        </Link>
      )}
    </main>
  );
}
