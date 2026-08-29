'use client';

interface UploadProgressBarProps {
  percent: number;
  label: string;
}

// Local to this route: it is the app's only progress indicator so far. Promote it to
// components/ui/ on a second use, per the folder convention.
export function UploadProgressBar({ percent, label }: UploadProgressBarProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink">{label}</span>
        <span className="tabular-nums text-ink-muted">{percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="h-2 w-full overflow-hidden rounded-full bg-brand-tint"
      >
        <div
          className="h-full rounded-full bg-brand-blue transition-all duration-200"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
