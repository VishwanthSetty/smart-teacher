import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ButtonLink } from './button';

export function Pagination({
  page,
  totalPages,
  total,
  previousHref,
  nextHref,
}: {
  page: number;
  totalPages: number;
  total: number;
  previousHref?: string;
  nextHref?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-muted">
      <span>Page {page} of {Math.max(1, totalPages)} · {total} total</span>
      <div className="flex gap-2">
        {previousHref ? (
          <ButtonLink href={previousHref} variant="secondary" className="h-9 px-3">
            <ChevronLeft className="h-4 w-4" /> Prev
          </ButtonLink>
        ) : null}
        {nextHref ? (
          <ButtonLink href={nextHref} variant="secondary" className="h-9 px-3">
            Next <ChevronRight className="h-4 w-4" />
          </ButtonLink>
        ) : null}
      </div>
    </div>
  );
}
