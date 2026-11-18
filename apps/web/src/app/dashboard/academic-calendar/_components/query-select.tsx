'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

interface QuerySelectProps {
  label: string;
  param: string;
  value: string;
  options: { value: string; label: string }[];
  // Params that only make sense for the previous selection (e.g. the month, when the
  // year changes) are dropped so the page falls back to its own default.
  resets?: string[];
}

// A filter that lives in the URL, so the server component re-renders with the new
// selection and the view stays shareable and back-button friendly.
export function QuerySelect({ label, param, value, options, resets = [] }: QuerySelectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) {
      params.set(param, next);
    } else {
      params.delete(param);
    }
    resets.forEach((key) => params.delete(key));
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <label className="field-label min-w-48">
      {label}
      <select className="field" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
