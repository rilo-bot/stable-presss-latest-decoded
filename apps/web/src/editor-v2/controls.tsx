/**
 * Shared inspector controls — small, dependency-light primitives used by the
 * text / image / qr panels.
 */

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, Minus, Plus, Check } from 'lucide-react';
import { FONTS_BY_CATEGORY, getFontDef, type FontCategory } from '@/lib/fonts/registry';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-3.5 py-3 border-b border-studio-hair">
      <p className="text-ui-sm uppercase tracking-[0.14em] font-bold text-studio-ink-3 mb-2">{title}</p>
      {children}
    </div>
  );
}

export function Stepper({
  value,
  min = 6,
  max = 200,
  step = 1,
  suffix,
  onChange,
}: {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v)));
  // Keep a free-typing draft so the user can clear the field / type multi-digit
  // values without each keystroke being clamped; only commit (clamped) on blur,
  // Enter, or a +/- press. Re-sync when the bound value changes (region switch).
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const n = Number(draft);
    if (draft.trim() === '' || Number.isNaN(n)) {
      setDraft(String(value)); // revert junk
      return;
    }
    const c = clamp(n);
    setDraft(String(c));
    if (c !== value) onChange(c);
  };
  const bump = (delta: number) => onChange(clamp(value + delta));

  return (
    <div className="flex items-center rounded-sm border border-studio-edge bg-studio-raise overflow-hidden">
      <button
        type="button"
        className="px-2 py-1.5 text-studio-ink-2 hover:bg-studio-raise-2"
        onClick={() => bump(-step)}
        aria-label="Decrease"
      >
        <Minus size={12} />
      </button>
      <input
        type="number"
        value={draft}
        min={min}
        max={max}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        aria-label={suffix ? `Value in ${suffix}` : 'Value'}
        className="w-full bg-transparent text-center text-ui-sm text-studio-ink tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      {suffix && <span className="pr-1 text-ui-sm text-studio-ink-3">{suffix}</span>}
      <button
        type="button"
        className="px-2 py-1.5 text-studio-ink-2 hover:bg-studio-raise-2"
        onClick={() => bump(step)}
        aria-label="Increase"
      >
        <Plus size={12} />
      </button>
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-sm border border-studio-edge bg-studio-raise overflow-hidden">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          title={opt.title}
          onClick={() => onChange(opt.value)}
          className={cn(
            'flex-1 flex items-center justify-center px-2 py-1.5 text-ui-sm transition-colors',
            value === opt.value ? 'bg-studio-gold text-studio-ink' : 'text-studio-ink-2 hover:bg-studio-raise-2'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

const SWATCHES = [
  '#0a2342', '#13315c', '#1a3322', '#2d5840', '#5a2a3a', '#7a1f2b',
  '#caa54a', '#c5972f', '#8a6b1e', '#111111', '#444444', '#ffffff',
  '#f5edda', '#b03a2e', '#1f6feb', '#0e7c5a',
];

const HEX6 = /^#[0-9a-fA-F]{6}$/;

export function ColorControl({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // Free-typing draft for the hex field: only commit when it's a complete 6-digit
  // hex, so partial values ("#", "#0a") never get persisted as the colour (which
  // would render invalid CSS and pollute the undo history). Reverts junk on blur.
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const onType = (v: string) => {
    setDraft(v);
    if (HEX6.test(v) && v.toLowerCase() !== value.toLowerCase()) onChange(v);
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-8 gap-1.5">
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={cn(
              'h-5 w-5 rounded-sm border transition-transform hover:scale-110',
              value.toLowerCase() === c.toLowerCase() ? 'border-studio-gold ring-1 ring-studio-gold' : 'border-studio-edge'
            )}
            style={{ background: c }}
            aria-label={`Set colour ${c}`}
          />
        ))}
      </div>
      <label className="flex items-center gap-2 text-ui-sm text-studio-ink-2">
        <input
          type="color"
          value={HEX6.test(value) ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="h-6 w-8 rounded-sm border border-studio-edge bg-transparent p-0"
          aria-label="Pick colour"
        />
        <input
          type="text"
          value={draft}
          onChange={(e) => onType(e.target.value)}
          onBlur={() => { if (!HEX6.test(draft)) setDraft(value); }}
          className="flex-1 rounded-sm border border-studio-edge bg-studio-raise px-2 py-1 text-ui-sm text-studio-ink outline-none"
          spellCheck={false}
          aria-label="Hex colour"
        />
      </label>
    </div>
  );
}

const CATEGORY_LABEL: Record<FontCategory, string> = {
  classic: 'Classic / Serif',
  modern: 'Modern / Sans',
  script: 'Script',
};

export function FontFamilyMenu({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = getFontDef(value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-sm border border-studio-edge bg-studio-raise px-2.5 py-2 text-left hover:bg-studio-raise-2"
      >
        <span className="text-ui text-studio-ink truncate" style={{ fontFamily: current?.stack }}>
          {current?.label ?? value}
        </span>
        <ChevronDown size={13} className="text-studio-ink-3 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-sm border border-studio-edge bg-studio-panel shadow-xl">
          {(['classic', 'modern', 'script'] as FontCategory[]).map((cat) => (
            <div key={cat}>
              <p className="sticky top-0 bg-studio-panel px-2.5 py-1 text-ui-sm uppercase tracking-[0.14em] font-bold text-studio-ink-4">
                {CATEGORY_LABEL[cat]}
              </p>
              {FONTS_BY_CATEGORY[cat].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    onChange(f.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-2.5 py-1.5 text-left hover:bg-studio-raise-2"
                >
                  <span className="text-ui text-studio-ink" style={{ fontFamily: f.stack }}>
                    {f.label}
                  </span>
                  {value === f.id && <Check size={13} className="text-studio-gold" />}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
