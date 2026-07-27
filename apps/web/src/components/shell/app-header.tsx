import type { AuthUser } from '@smart-teacher/shared-types';
import { LogoutButton } from './logout-button';

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super admin',
  SCHOOL_ADMIN: 'School admin',
  TEACHER: 'Teacher',
  STUDENT: 'Student',
};

export function AppHeader({ user }: { user: AuthUser }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-gray-200 bg-white px-4 sm:px-6">
      {/* SUPER_ADMIN belongs to no tenant, so there is no school name to show. */}
      <span className="truncate text-sm font-semibold text-gray-900">
        {user.school?.name ?? 'Platform'}
      </span>

      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <div className="truncate text-sm font-medium text-gray-900">{user.name}</div>
          <div className="text-xs text-gray-500">{ROLE_LABELS[user.role] ?? user.role}</div>
        </div>
        <LogoutButton />
      </div>
    </header>
  );
}
