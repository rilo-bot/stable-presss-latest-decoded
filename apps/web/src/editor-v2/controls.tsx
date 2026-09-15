/**
 * Shared inspector controls — small, dependency-light primitives used by the
 * text / image / qr panels.
 */

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, Minus, Plus, Check } from 'lucide-react';
import { FONTS_BY_CATEGORY, findFontByStack, primaryFamily, type FontCategory } from '@/lib/fonts/registry';

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
  // The draft is also what the native picker writes to while it is being dragged —
  // see below.
  const [draft, setDraft] = useState(value);

  /**
   * THE NATIVE COLOUR PICKER FIRES CONTINUOUSLY WHILE IT IS DRAGGED.
   *
   * React maps `onChange` on `<input type="color">` to the `input` event, so hauling
   * the cursor across the gradient used to emit a change per step — and every one of
   * those was a full commit: a rev-guarded PATCH over the network, its own undo-stack
   * entry, and a rev bump that the next one then had to conflict with. One colour
   * tweak could fire dozens of writes and, at 60 entries, flush the user's entire
   * real undo history to make room for them.
   *
   * So the drag stays LOCAL (the swatch follows the pointer via `draft`) and only the
   * colour the user settles on is committed: a trailing debounce, flushed on blur and
   * on unmount so a colour picked and then dismissed is never lost. Deliberately
   * picking three colours in a row still yields three undo entries, which is right —
   * they were three decisions.
   */
  const timer = useRef<number | undefined>(undefined);
  const pending = useRef<string | null>(null);
  // Both of these are read by a flush that can run LONG after the render that
  // scheduled it — from a timer, or from the unmount effect below, which by
  // definition holds the first render's closure. The callers rebuild `onChange` every
  // render (it closes over the selected element), so calling the captured one would
  // commit against a stale snapshot; refs keep the flush pointed at the current pair.
  const latest = useRef(value);
  const notify = useRef(onChange);
  latest.current = value;
  notify.current = onChange;

  const flush = () => {
    window.clearTimeout(timer.current);
    const v = pending.current;
    pending.current = null;
    if (v && HEX6.test(v) && v.toLowerCase() !== latest.current.toLowerCase()) notify.current(v);
  };
  // Unmount can beat the timer (the inspector closes, the selection changes), and a
  // colour the user chose has to survive that.
  useEffect(() => flush, []);

  // The bound value changed under us — a different element got selected, or our own
  // commit landed. Either way an un-flushed pick is void: it was chosen for the
  // colour that was there before, and flushing it now would paint it onto whatever is
  // there instead.
  useEffect(() => {
    setDraft(value);
    pending.current = null;
    window.clearTimeout(timer.current);
  }, [value]);

  const onPick = (v: string) => {
    setDraft(v);
    pending.current = v;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 250);
  };

  const onType = (v: string) => {
    setDraft(v);
    if (HEX6.test(v) && v.toLowerCase() !== value.toLowerCase()) onChange(v);
  };

  return (
    <div className="space-y-2">
      {/* WRAP, don't grid.
          These are 24px now (the target floor, up from 20), and a fixed 8-column grid
          could not carry that: the inspector pane is user-resizable down to 240px,
          where eight columns plus gaps leave ~21px each and a fixed-width swatch
          overflows its own cell. Wrapping fits however many the current width holds —
          nine per row at the default, seven at the narrowest — and cannot overflow at
          any pane size. */}
      <div className="flex flex-wrap gap-1.5">
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            // A swatch is one deliberate choice — commit it immediately, and drop any
            // debounced picker value so a half-finished drag can't land on top of it.
            onClick={() => { pending.current = null; window.clearTimeout(timer.current); setDraft(c); onChange(c); }}
            className={cn(
              'h-6 w-6 flex-shrink-0 rounded-sm border transition-transform hover:scale-110',
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
          // Bound to the DRAFT, so the swatch tracks the pointer through a drag that
          // has not been committed yet (bound to `value` it would snap back on every
          // re-render until the debounce landed).
          value={HEX6.test(draft) ? draft : '#000000'}
          onChange={(e) => onPick(e.target.value)}
          onBlur={flush}
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

/**
 * The font picker. `value` and `onChange` both speak RAW CSS STACKS, because that
 * is what `ElementTextData.fontFamily` holds everywhere in the system — templates,
 * the DSL composer, PDF extraction and the renderers all read and write a stack.
 * The registry entry is looked up by primary family so an element authored by any
 * of those paths still shows its real face as the active option.
 */
export function FontFamilyMenu({
  value,
  onChange,
}: {
  value: string;
  onChange: (stack: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = findFontByStack(value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    // A dropdown that traps the user is worse than no dropdown: Escape closes it
    // without touching the element, same as clicking away.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-sm border border-studio-edge bg-studio-raise px-2.5 py-2 text-left hover:bg-studio-raise-2"
      >
        {/* An unknown family (an extracted PDF face we don't stock) still previews in
            its own stack and names itself, rather than showing a blank control. */}
        <span className="text-ui text-studio-ink truncate" style={{ fontFamily: current?.stack ?? value }}>
          {current?.label ?? (primaryFamily(value) || 'Custom')}
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
                    onChange(f.stack);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-2.5 py-1.5 text-left hover:bg-studio-raise-2"
                >
                  <span className="text-ui text-studio-ink" style={{ fontFamily: f.stack }}>
                    {f.label}
                  </span>
                  {current?.id === f.id && <Check size={13} className="text-studio-gold" />}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
