import { Skeleton } from '@/components/ui/skeleton';

export default function VideosLoading() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton key={index} className="h-32" />
      ))}
    </div>
  );
}
