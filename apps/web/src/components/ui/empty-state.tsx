import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-gray-300 bg-white px-6 py-16 text-center">
      <span className="text-gray-400">{icon}</span>
      <h2 className="text-base font-medium text-gray-900">{title}</h2>
      <p className="max-w-sm text-sm text-gray-500">{description}</p>
      {action}
    </div>
  );
}
