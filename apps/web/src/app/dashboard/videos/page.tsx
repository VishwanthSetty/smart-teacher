import { redirect } from 'next/navigation';
import { Video } from 'lucide-react';
import { canRoleAccess } from '@/lib/nav';
import { requireUser } from '@/lib/session';
import { ComingSoon } from '@/components/ui/coming-soon';

const ROUTE = '/dashboard/videos';

export default async function VideosPage() {
  const user = await requireUser();
  if (!canRoleAccess(user.role, ROUTE)) {
    redirect('/dashboard');
  }

  return (
    <ComingSoon
      title="Videos"
      description="Upload lesson recordings and share them with classes."
      icon={<Video className="h-8 w-8" aria-hidden="true" />}
    />
  );
}
