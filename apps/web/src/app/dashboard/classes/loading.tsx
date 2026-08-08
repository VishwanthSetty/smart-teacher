import { Skeleton } from '@/components/ui/skeleton';

export default function ClassesLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <Skeleton className="h-11 w-full rounded-none" />
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="grid grid-cols-4 gap-4 border-t border-gray-100 p-4">
            <Skeleton className="h-5" />
            <Skeleton className="h-5" />
            <Skeleton className="h-5" />
            <Skeleton className="h-5" />
          </div>
        ))}
      </div>
    </div>
  );
}
