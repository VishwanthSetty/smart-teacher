import { redirect } from 'next/navigation';
import { getRefreshToken } from '@/lib/session';

// Keyed off the refresh token, matching middleware: the access token expires every ~15m
// and its absence says nothing about whether the session is still alive.
export default function RootPage() {
  redirect(getRefreshToken() ? '/dashboard' : '/login');
}
