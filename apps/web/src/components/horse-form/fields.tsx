import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ── Collapsible section component ── */
export function Section({
  title,
  number,
  children,
  defaultOpen = true,
}: {
  title: string;
  number: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <fieldset className="border-0 p-0 m-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between pb-2 border-b border-border/40 mb-4 group"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/15 text-primary text-[9px] font-bold flex-shrink-0">
            {number}
          </span>
          <legend className="text-[10px] uppercase tracking-[0.14em] font-bold text-muted-foreground group-hover:text-foreground transition-colors">
            {title}
          </legend>
        </div>
        <ChevronDown
          size={13}
          className={cn(
            'text-muted-foreground transition-transform duration-200',
            open ? 'rotate-180' : 'rotate-0'
          )}
        />
      </button>
      {open && <div className="space-y-4">{children}</div>}
    </fieldset>
  );
}

/* ── Shared select ── */
export function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-semibold">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-input rounded-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        aria-label={label}
      >
        <option value="">{placeholder ?? `Select…`}</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}
