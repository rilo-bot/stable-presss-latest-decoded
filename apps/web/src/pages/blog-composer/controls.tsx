/**
 * Shared form primitives for the tools rail and the create form.
 *
 * Extracted so the rail and the form look identical — when each screen rolled
 * its own label/input/segment markup they drifted within a day.
 */
import { cn } from '@/lib/utils';

export const inputCls =
  'w-full rounded-sm border border-border/60 bg-background px-2.5 py-1.5 text-sm placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none';

export function Field({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn('mb-3.5', className)}>
      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] leading-snug text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

/** Section heading inside the rail. */
export function RailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border/50 px-3.5 py-3.5 last:border-b-0">
      <p className="mb-3 font-[family-name:var(--font-display)] text-xs font-bold uppercase tracking-[0.1em] text-foreground">
        {title}
      </p>
      {children}
    </section>
  );
}

/** A row of mutually exclusive choices. Wraps rather than scrolls. */
export function Seg<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: Array<{ value: T; label: string; icon?: React.ReactNode; title?: string }>;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          title={o.title ?? o.label}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-[11px] transition-colors',
            value === o.value
              ? 'border-primary/40 bg-primary/10 font-semibold text-primary'
              : 'border-border/60 text-muted-foreground hover:border-border hover:text-foreground',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  type = 'text',
  onCommit,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel: string;
  type?: string;
  /**
   * Fired on Enter, comma, and blur. For inputs that ADD something (a tag)
   * rather than edit it — committing on blur as well means a typed value is
   * never silently lost by clicking away.
   */
  onCommit?: () => void;
}) {
  return (
    <input
      type={type}
      value={value}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={
        onCommit
          ? (e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                onCommit();
              }
            }
          : undefined
      }
      className={inputCls}
    />
  );
}

export function TextArea({
  value,
  onChange,
  placeholder,
  ariaLabel,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      rows={rows}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(inputCls, 'resize-y')}
    />
  );
}
