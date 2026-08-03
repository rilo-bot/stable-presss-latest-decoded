/**
 * Emoji analytics — the marks the screen is drawn from.
 *
 * Every piece here follows the same rules, which is what makes the page read as
 * one system rather than eleven panels:
 *
 *   - Bars are thin (≤ 24px), grow from one baseline, and round only the data
 *     end (4px) — square where they meet the baseline.
 *   - Touching fills are separated by a 2px gap in the surface colour, never by
 *     a border drawn round the mark.
 *   - Text wears text tokens. The colour lives in the mark beside the label, so
 *     a reader who can't separate the two hues still has the words and the
 *     number. Nothing on this screen is encoded by colour alone.
 *   - Every value is directly labelled. That is also what licenses the two
 *     lightest fills in the scale, which sit below 3:1 on cream (see data.ts).
 */
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { BANDS, TRACK_FILL, signed, type Band, type Split } from './data';

/** Surface colour behind the marks — the 2px gaps are painted in this. */
const SURFACE = 'hsl(var(--card))';

// ── Panels ──────────────────────────────────────────────────────────────────

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
    <section className={cn('rounded-sm border border-border/60 bg-card p-4 md:p-5', className)}>
      {(title || aside) && (
        <div className="mb-4 flex flex-wrap items-start gap-x-3 gap-y-1">
          <div className="min-w-0 flex-1">
            {title && (
              <h2 className="font-[family-name:var(--font-display)] text-sm font-bold text-foreground">
                {title}
              </h2>
            )}
            {subtitle && <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{subtitle}</p>}
          </div>
          {aside && <div className="flex-shrink-0 text-[11px] text-muted-foreground">{aside}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** The line that says "these numbers are invented". Never hide it. */
export function SampleDataBadge({ children = 'Sample data' }: { children?: ReactNode }) {
  return (
    <span
      className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-sm border px-2 py-1 text-[10.5px] font-semibold uppercase tracking-[0.08em]"
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

/** A quiet note under a panel that would need data we don't have yet. */
export function ModelledNote({ children }: { children: ReactNode }) {
  return (
    <p
      className="mt-3 rounded-sm border px-3 py-2 text-[11px] leading-relaxed"
      style={{
        borderColor: 'hsl(var(--brand-accent) / 0.35)',
        background: 'hsl(var(--brand-accent) / 0.07)',
        color: 'hsl(var(--brand-accent-ink))',
      }}
    >
      {children}
    </p>
  );
}

// ── Figures ─────────────────────────────────────────────────────────────────

/**
 * Stat tile: label · value · detail.
 *
 * `hero` is the one number the page leads with — 48px, in the body sans (a
 * display face on a figure reads as decoration), with proportional digits.
 * Exactly one tile on the screen sets it.
 */
export function StatTile({
  label, value, detail, hero = false, display = false,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  hero?: boolean;
  /** Words rather than a number — takes the display face. */
  display?: boolean;
}) {
  return (
    <div className="rounded-sm border border-border/60 bg-card p-4">
      <p className="text-[11.5px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1.5 font-bold leading-[1.05] text-foreground',
          hero ? 'text-[44px]' : display ? 'text-[26px]' : 'text-[28px]',
          display && 'font-[family-name:var(--font-display)]',
        )}
      >
        {value}
      </p>
      {detail && <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{detail}</p>}
    </div>
  );
}

// ── Meters ──────────────────────────────────────────────────────────────────

interface MeterPart {
  key: string;
  pct: number;
  fill: string;
  label: string;
}

/**
 * One horizontal bar split into shares, with a 2px surface gap between fills.
 *
 * The gap is drawn as a border in the surface colour on the inner edges rather
 * than a margin, so the segments still sum to exactly 100% of the track.
 */
export function StackedMeter({ parts, height = 14 }: { parts: MeterPart[]; height?: number }) {
  const shown = parts.filter((p) => p.pct > 0);
  return (
    <div
      className="flex w-full overflow-hidden rounded-[4px]"
      style={{ height, background: TRACK_FILL }}
      role="img"
      aria-label={shown.map((p) => `${p.label} ${p.pct}%`).join(', ')}
    >
      {shown.map((p, i) => (
        <div
          key={p.key}
          style={{
            width: `${p.pct}%`,
            background: p.fill,
            // 2px of surface between touching fills — the separator is white
            // space, not a stroke.
            borderLeft: i === 0 ? undefined : `2px solid ${SURFACE}`,
          }}
        />
      ))}
    </div>
  );
}

/** A legend/label row under a meter: swatch · name · value. */
export function MeterKey({ parts, className }: { parts: MeterPart[]; className?: string }) {
  return (
    <div className={cn('mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5', className)}>
      {parts.map((p) => (
        <span key={p.key} className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <span aria-hidden="true" className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: p.fill }} />
          <span className="text-foreground">{p.label}</span>
          <span className="tabular-nums">{p.pct}%</span>
        </span>
      ))}
    </div>
  );
}

// ── Bars ────────────────────────────────────────────────────────────────────

/**
 * A magnitude bar on a track: grows from the left baseline, 4px rounded data
 * end, square at the baseline.
 */
export function Bar({ pct, fill, height = 9 }: { pct: number; fill: string; height?: number }) {
  return (
    // The track rounds only its right end: the left edge is the baseline, and a
    // rounded track would round the fill's baseline end with it.
    <div className="w-full overflow-hidden rounded-r-[4px]" style={{ height, background: TRACK_FILL }}>
      <div
        style={{
          width: `${Math.max(pct, 0)}%`,
          height: '100%',
          background: fill,
          borderRadius: '0 4px 4px 0',
        }}
      />
    </div>
  );
}

/**
 * A signed bar either side of a centre baseline — the shape a margin takes.
 *
 * Direction carries the sign, so the two hues are redundant rather than
 * load-bearing: a reader who can't separate green from vermilion still sees
 * which side of the line the bar sits on, and the number is printed beside it.
 */
export function NetBar({ net, fill, height = 9 }: { net: number; fill: string; height?: number }) {
  const magnitude = Math.min(Math.abs(net), 100) / 2; // half-track per arm
  return (
    <div className="relative w-full rounded-[4px]" style={{ height, background: TRACK_FILL }}>
      {/* Centre baseline — a solid hairline. --border is the decorative edge and
          measures 1.45:1 on this track, i.e. invisible at 1px; --input is the
          token for a boundary that has to be seen. It is the reference for every
          bar here, so it has to be. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2"
        style={{ background: 'hsl(var(--input))' }}
      />
      <span
        className="absolute inset-y-0"
        style={{
          width: `${magnitude}%`,
          background: fill,
          left: net >= 0 ? '50%' : undefined,
          right: net < 0 ? '50%' : undefined,
          borderRadius: net >= 0 ? '0 4px 4px 0' : '4px 0 0 4px',
        }}
      />
    </div>
  );
}

// ── Bands ───────────────────────────────────────────────────────────────────

/** Swatch + band name. The swatch is the only place the fill appears as text-adjacent colour. */
export function BandChip({ band, className }: { band: Band; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex flex-shrink-0 items-center gap-1.5 rounded-sm border border-border/60 bg-background px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.07em] text-foreground',
        className,
      )}
    >
      <span aria-hidden="true" className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: band.fill }} />
      {band.label}
    </span>
  );
}

/** The scale legend: five bands, worst to best, each with its threshold. */
export function BandLegend({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5', className)}>
      {[...BANDS].reverse().map((b) => (
        <span key={b.id} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span aria-hidden="true" className="h-2.5 w-2.5 flex-shrink-0 rounded-[2px]" style={{ background: b.fill }} />
          <span className="text-foreground">{b.label}</span>
          <span className="tabular-nums">{b.hint.replace('net ', '')}</span>
        </span>
      ))}
    </div>
  );
}

// ── Split summaries ─────────────────────────────────────────────────────────

/** for / middle / against as meter parts, in scale order. */
export function splitParts(split: Split, fills: { for: string; middle: string; against: string }): MeterPart[] {
  return [
    { key: 'for', pct: split.forPct, fill: fills.for, label: 'For you' },
    { key: 'middle', pct: split.middlePct, fill: fills.middle, label: 'In the middle' },
    { key: 'against', pct: split.againstPct, fill: fills.against, label: 'Against' },
  ];
}

/** `56% for · 11% middle · 33% against` — the three numbers, as text. */
export function SplitLine({ split }: { split: Split }) {
  return (
    <span className="tabular-nums">
      {split.forPct}% for · {split.middlePct}% middle · {split.againstPct}% against
    </span>
  );
}

/** The signed net, in ink. Sign carries the direction; colour never does. */
export function Net({ net, className }: { net: number; className?: string }) {
  return (
    <span className={cn('tabular-nums font-semibold text-foreground', className)} title="Net = % for minus % against">
      {signed(net)}
    </span>
  );
}
