import { Skeleton } from './skeleton';

// Shared loading shape for every list-style route, so navigating between sections shows
// consistent feedback inside the already-painted shell.
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <>
      <div className="mb-6 space-y-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="space-y-2 rounded-card border border-surface-border bg-white p-4 shadow-card">
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    </>
  );
}
