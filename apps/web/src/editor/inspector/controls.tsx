/**
 * Shared inspector controls — small, dependency-light primitives used by the
 * text / image / qr panels.
 */

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, Minus, Plus, Check } from 'lucide-react';
import { FONTS_BY_CATEGORY, getFontDef, type FontCategory } from '../fonts/registry';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-3.5 py-3 border-b border-white/10">
      <p className="text-[10px] uppercase tracking-[0.14em] font-bold text-white/45 mb-2">{title}</p>
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
  return (
    <div className="flex items-center rounded-sm border border-white/15 bg-white/5 overflow-hidden">
      <button
        type="button"
        className="px-2 py-1.5 text-white/70 hover:bg-white/10"
        onClick={() => onChange(clamp(value - step))}
        aria-label="Decrease"
      >
        <Minus size={12} />
      </button>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        className="w-full bg-transparent text-center text-xs text-white tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      {suffix && <span className="pr-1 text-[10px] text-white/40">{suffix}</span>}
      <button
        type="button"
        className="px-2 py-1.5 text-white/70 hover:bg-white/10"
        onClick={() => onChange(clamp(value + step))}
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
    <div className="flex rounded-sm border border-white/15 bg-white/5 overflow-hidden">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          title={opt.title}
          onClick={() => onChange(opt.value)}
          className={cn(
            'flex-1 flex items-center justify-center px-2 py-1.5 text-xs transition-colors',
            value === opt.value ? 'bg-sky-500 text-white' : 'text-white/65 hover:bg-white/10'
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

export function ColorControl({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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
              value.toLowerCase() === c.toLowerCase() ? 'border-sky-400 ring-1 ring-sky-400' : 'border-white/20'
            )}
            style={{ background: c }}
            aria-label={`Set colour ${c}`}
          />
        ))}
      </div>
      <label className="flex items-center gap-2 text-[11px] text-white/60">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="h-6 w-8 rounded-sm border border-white/15 bg-transparent p-0"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 rounded-sm border border-white/15 bg-white/5 px-2 py-1 text-xs text-white outline-none"
          spellCheck={false}
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
        className="flex w-full items-center justify-between rounded-sm border border-white/15 bg-white/5 px-2.5 py-2 text-left hover:bg-white/10"
      >
        <span className="text-sm text-white truncate" style={{ fontFamily: current?.stack }}>
          {current?.label ?? value}
        </span>
        <ChevronDown size={13} className="text-white/50 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-sm border border-white/15 bg-[#0d1626] shadow-xl">
          {(['classic', 'modern', 'script'] as FontCategory[]).map((cat) => (
            <div key={cat}>
              <p className="sticky top-0 bg-[#0d1626] px-2.5 py-1 text-[9px] uppercase tracking-[0.14em] font-bold text-white/35">
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
                  className="flex w-full items-center justify-between px-2.5 py-1.5 text-left hover:bg-white/10"
                >
                  <span className="text-sm text-white/90" style={{ fontFamily: f.stack }}>
                    {f.label}
                  </span>
                  {value === f.id && <Check size={13} className="text-sky-400" />}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
