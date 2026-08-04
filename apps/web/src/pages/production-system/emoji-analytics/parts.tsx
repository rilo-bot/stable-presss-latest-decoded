/**
 * Emoji analytics — the marks the screen is drawn from.
 *
 * Small on purpose. The page is three analytics, so this is nine components,
 * not thirty; anything used once lives in the screen instead.
 *
 * The rules every piece here follows:
 *
 *   - Bars are thin, grow from one baseline, and are fully rounded at the data
 *     end. Touching fills are separated by a 2px gap in the SURFACE colour,
 *     never by a border drawn round the mark.
 *   - Text wears text tokens. Colour lives in the mark beside the label, so a
 *     reader who cannot separate two hues still has the words and the number.
 *     Nothing is encoded by colour alone, anywhere on this page.
 *   - Every value is directly labelled. That is what licenses the two fills in
 *     the scale that sit below 3:1 on the card (`split` 2.13:1, `cool` 2.89:1).
 *   - Generous padding and one clear type step per level. The density this page
 *     had first — 10px labels, 9px bars, panels packed edge to edge — is what
 *     made it read as a wall rather than a report.
 */
import { type ReactNode } from 'react';

import { cn } from '@/lib/utils';

import {
  EMOJI_KEYS, STEP_FILL, TRACK_FILL, stepFor,
  type Band, type Split,
} from './data';

/** Surface colour behind the marks — the 2px gaps are painted in this. */
const SURFACE = 'hsl(var(--card))';

// ── Containers ──────────────────────────────────────────────────────────────

export function Panel({
  title, subtitle, aside, children, className,
}: {
  title?: string;
  subtitle?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-sm border border-border/60 bg-card p-5 md:p-6', className)}>
      {(title || aside) && (
        <div className="mb-5 flex flex-wrap items-start gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            {title && (
              <h2 className="font-[family-name:var(--font-display)] text-[15px] font-bold text-foreground">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {aside && <div className="flex-shrink-0">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** A heading over a group of cards, where a panel would be a box round boxes. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="mb-4 font-[family-name:var(--font-display)] text-[15px] font-bold text-foreground">
        {title}
      </h2>
      {children}
    </div>
  );
}

/** The line that says "these numbers are invented". Never hide it. */
export function SampleDataBadge({ children = 'Sample data' }: { children?: ReactNode }) {
  return (
    <span
      className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]"
      style={{
        borderColor: 'hsl(var(--brand-accent) / 0.45)',
        background: 'hsl(var(--brand-accent) / 0.12)',
        color: 'hsl(var(--brand-accent-ink))',
      }}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: 'hsl(var(--brand-accent))' }} />
      {children}
    </span>
  );
}

/** Empty state, used wherever a filter can empty a panel. */
export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-10 text-center text-[13px] text-muted-foreground">{children}</p>;
}

// ── Figures ─────────────────────────────────────────────────────────────────

/**
 * Stat tile: label · value · detail.
 *
 * `display` is for a tile whose value is WORDS ("Readers are warm"), which takes
 * the display serif. A number never does — a display face on a figure reads as
 * decoration — and it keeps proportional digits, because tabular figures make a
 * large standalone number look loose.
 */
export function StatTile({
  label, value, detail, display = false,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  display?: boolean;
}) {
  return (
    <div className="rounded-sm border border-border/60 bg-card p-5">
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-2 font-bold leading-[1.1] text-foreground',
          display ? 'font-[family-name:var(--font-display)] text-[24px]' : 'text-[32px]',
        )}
      >
        {value}
      </p>
      {detail && <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">{detail}</p>}
    </div>
  );
}

// ── Bars ────────────────────────────────────────────────────────────────────

export interface MeterPart {
  key: string;
  pct: number;
  fill: string;
  label: string;
}

/**
 * The headline bar: for / middle / against, full width, with the three values
 * set beneath it at the left, centre and right.
 *
 * Labels UNDER the bar rather than inside it — an in-bar label is the first
 * thing to get clipped when a segment is small, and a clipped number is worse
 * than no number.
 */
export function ThreeWayBar({ parts, compact: dense = false }: { parts: MeterPart[]; compact?: boolean }) {
  const shown = parts.filter((p) => p.pct > 0);
  return (
    <div>
      <div
        className="flex w-full overflow-hidden rounded-full"
        style={{ height: dense ? 12 : 18, background: TRACK_FILL }}
        role="img"
        aria-label={shown.map((p) => `${p.label} ${p.pct}%`).join(', ')}
      >
        {shown.map((p, i) => (
          <span
            key={p.key}
            style={{
              width: `${p.pct}%`,
              background: p.fill,
              borderLeft: i === 0 ? undefined : `2px solid ${SURFACE}`,
            }}
          />
        ))}
      </div>
      <div className={cn('mt-2 flex items-center justify-between', dense ? 'text-[11px]' : 'text-[12px]')}>
        {parts.map((p) => (
          <span key={p.key} className="flex items-center gap-1.5 text-muted-foreground">
            <span aria-hidden="true" className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: p.fill }} />
            <span className="text-foreground">{p.label}</span>
            <span className="tabular-nums">{p.pct}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** A magnitude bar on a track: grows from the left baseline, rounded data end. */
export function Bar({ pct, fill, height = 10 }: { pct: number; fill: string; height?: number }) {
  return (
    <div className="w-full overflow-hidden rounded-full" style={{ height, background: TRACK_FILL }}>
      <div
        style={{
          width: `${Math.max(pct, 0)}%`,
          height: '100%',
          background: fill,
          borderRadius: 999,
        }}
      />
    </div>
  );
}

/**
 * The seven-step scale as a diverging bar, centred on the neutral step.
 *
 * Used compactly, one per leaderboard row, so the shape of a piece's reception
 * is legible at a glance without reading the numbers.
 *
 * Geometry: each arm is EXACTLY half the track and pinned on both edges, so a
 * child's percentage resolves against 100 points rather than a shrink-to-fit
 * box. `undecided` straddles the centre, half either side, so the line is the
 * true midpoint of the neutral block rather than an edge of it.
 */
export function DivergingBar({ split, height = 10 }: { split: Split; height?: number }) {
  const total = split.reactions;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  const against = [2, 1, 0]; // outward from the centre
  const forArm = [4, 5, 6];
  const neutralHalf = pct(split.counts[3] ?? 0) / 2;

  const label = EMOJI_KEYS
    .map((k, i) => `${stepFor(k).label} ${Math.round(pct(split.counts[i] ?? 0))}%`)
    .join(', ');

  return (
    <div
      className="relative w-full overflow-hidden rounded-full"
      style={{ height, background: TRACK_FILL }}
      role="img"
      aria-label={total === 0 ? 'No reactions' : label}
    >
      <div className="absolute inset-y-0 left-0 right-1/2 flex flex-row-reverse">
        <span style={{ width: `${neutralHalf}%`, background: STEP_FILL.undecided }} />
        {against.map((i, n) => (
          <span
            key={i}
            style={{
              width: `${pct(split.counts[i] ?? 0)}%`,
              background: STEP_FILL[EMOJI_KEYS[i]!],
              borderRight: n === 0 ? undefined : `2px solid ${SURFACE}`,
            }}
          />
        ))}
      </div>
      <div className="absolute inset-y-0 left-1/2 right-0 flex">
        <span style={{ width: `${neutralHalf}%`, background: STEP_FILL.undecided }} />
        {forArm.map((i, n) => (
          <span
            key={i}
            style={{
              width: `${pct(split.counts[i] ?? 0)}%`,
              background: STEP_FILL[EMOJI_KEYS[i]!],
              borderLeft: n === 0 ? undefined : `2px solid ${SURFACE}`,
            }}
          />
        ))}
      </div>
      {/* The reference the mark is measured against, so it has to be seen.
          --border measures 1.45:1 on this track and is invisible at 1px;
          --input is the token for a boundary that must read. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2"
        style={{ background: 'hsl(var(--input))' }}
      />
    </div>
  );
}

// ── Bands ───────────────────────────────────────────────────────────────────

/**
 * Swatch + band name. The ONLY way a band fill is drawn next to text.
 *
 * Cool and Rejected measure ΔE 14.4 apart under normal vision — below the 15
 * floor — so the label is not decoration, it is what separates them. There is
 * deliberately no variant of this without one.
 */
export function BandChip({ band, className }: { band: Band; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-background px-2.5 py-1 text-[10.5px] font-semibold text-foreground',
        className,
      )}
    >
      <span aria-hidden="true" className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: band.fill }} />
      {band.label}
    </span>
  );
}

// ── Split helpers ───────────────────────────────────────────────────────────

export function splitParts(split: Split, fills: { for: string; middle: string; against: string }): MeterPart[] {
  return [
    { key: 'for', pct: split.forPct, fill: fills.for, label: 'For you' },
    { key: 'middle', pct: split.middlePct, fill: fills.middle, label: 'In the middle' },
    { key: 'against', pct: split.againstPct, fill: fills.against, label: 'Against' },
  ];
}

// ── Controls ────────────────────────────────────────────────────────────────

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Screen-reader text when `label` is a glyph. */
  title?: string;
}

/**
 * A one-of-many control. `radiogroup` rather than a row of toggle buttons: the
 * options are mutually exclusive, so a keyboard user arrows along them instead
 * of tabbing through every one.
 */
export function SegmentedControl<T extends string>({
  options, value, onChange, label, className,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  const move = (delta: number) => {
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + delta + options.length) % options.length];
    if (next) onChange(next.value);
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex flex-wrap gap-1 rounded-sm border border-border/60 bg-background p-1', className)}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            title={o.title}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
                : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
              if (!d) return;
              e.preventDefault();
              move(d);
            }}
            className={cn(
              'rounded-[3px] px-3 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'bg-primary/10 font-semibold text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A many-of-many chip row. Same look as the segmented control, different job. */
export function ChipToggles<T extends string>({
  options, values, onToggle, label, allLabel = 'All', onClear,
}: {
  options: { value: T; label: string }[];
  values: T[];
  onToggle: (v: T) => void;
  label: string;
  allLabel?: string;
  onClear: () => void;
}) {
  const none = values.length === 0;
  const chip = (on: boolean) => cn(
    'rounded-full border px-3 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    on
      ? 'border-primary/30 bg-primary/10 font-semibold text-primary'
      : 'border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground',
  );

  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      <button type="button" onClick={onClear} aria-pressed={none} className={chip(none)}>
        {allLabel}
      </button>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onToggle(o.value)}
          aria-pressed={values.includes(o.value)}
          className={chip(values.includes(o.value))}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
