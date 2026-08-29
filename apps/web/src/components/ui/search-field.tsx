import { Search } from 'lucide-react';

export function SearchField({
  name = 'search',
  defaultValue,
  placeholder = 'Search',
  className,
}: {
  name?: string;
  defaultValue?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`relative block ${className ?? ''}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="field pl-9"
      />
    </label>
  );
}
