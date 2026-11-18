import { CalendarRange } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

export function NoAcademicYears({ canCreate }: { canCreate: boolean }) {
  return (
    <EmptyState
      icon={<CalendarRange className="h-8 w-8" aria-hidden="true" />}
      title="No academic years yet"
      description={
        canCreate
          ? 'Add an academic year above to start planning default calendars.'
          : 'The platform has not set up an academic year yet. Check back soon.'
      }
    />
  );
}
