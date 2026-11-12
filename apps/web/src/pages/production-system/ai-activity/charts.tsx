/**
 * AI Activity — the marks: daily spend bars, the card sparkline, a share bar,
 * and the small table pieces. Shared by the AI Activity screens and the Stable
 * Hand run log, so every AI surface reads the same way.
 *
 * Same rules as emoji-analytics/parts: forest marks on a recessive grid, gold on
 * hover, every value labelled in text (tooltip or column) so nothing is encoded
 * by colour alone.
 */
import { useEffect, useRef, useState } from 'react';

import { DAY_UTC, tokens, usd } from './format';

export interface ChartDay {
  date: string;
  costUsd: number;
  /** Runs (The Stable Hand) or calls (every other surface) that day. */
  count: number;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
}

const CHART_H = 160;
const AXIS_W = 44;

/** A round axis top: 1, 2 or 5 × a power of ten. */
export function niceCeil(v: number): number {
  if (v <= 0) return 0;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}

/** Plain-SVG bars, one per UTC day. Forest marks, recessive grid, hover tooltip. */
export function DailyChart({
  days, unit = 'call', subject,
}: {
  days: ChartDay[];
  unit?: 'run' | 'call';
  /** For the accessible name: "Daily <subject> spend over N days". */
  subject: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...days.map((d) => d.costUsd), 0);
  const top = niceCeil(max);
  const ticks = top > 0 ? [0, top / 2, top] : [0];
  const n = days.length || 1;
  const spent = days.some((d) => d.costUsd > 0);
  const used = days.some((d) => d.count > 0);

  // Drawn in real pixels at the measured width, so text and bar ends never
  // stretch (a preserveAspectRatio="none" viewBox would squash both).
  const wrapRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(720);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setW(Math.max(240, Math.round(el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const plotW = W - AXIS_W;
  const slot = plotW / n;
  // A 2px surface gap between neighbours; thin marks on wide screens.
  const barW = Math.max(2, Math.min(18, slot - 2));
  const maxLabels = Math.max(2, Math.floor(plotW / 56));
  const labelEvery = Math.max(1, Math.ceil(n / maxLabels));

  const hovered = hover != null ? days[hover] : null;
  const hasTokens = days.some((d) => d.inputTokens != null);

  return (
    <div className="relative" ref={wrapRef}>
      <svg
        width={W}
        height={CHART_H + 30}
        viewBox={`0 0 ${W} ${CHART_H + 30}`}
        className="block"
        role="img"
        aria-label={`Daily ${subject} spend over ${n} days, peak ${usd(max)}`}
        onMouseLeave={() => setHover(null)}
      >
        <g transform="translate(0,8)">
          {ticks.map((t) => {
            const y = CHART_H - (top > 0 ? (t / top) * CHART_H : 0);
            return (
              <g key={t}>
                <line x1={AXIS_W} x2={W} y1={y + 0.5} y2={y + 0.5} stroke="hsl(var(--border))" strokeWidth={1} strokeDasharray={t === 0 ? undefined : '2 4'} />
                <text x={AXIS_W - 6} y={y + 3} textAnchor="end" fontSize={10} fill="hsl(var(--muted-foreground))">
                  {t === 0 ? '$0' : usd(t)}
                </text>
              </g>
            );
          })}
          {days.map((d, i) => {
            const h = top > 0 ? (d.costUsd / top) * CHART_H : 0;
            const x = AXIS_W + i * slot + (slot - barW) / 2;
            return (
              <g key={d.date}>
                {/* Hit target: the whole slot, taller than the mark. */}
                <rect
                  x={AXIS_W + i * slot}
                  y={0}
                  width={slot}
                  height={CHART_H}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onTouchStart={() => setHover(i)}
                />
                {h > 0 && (
                  <rect
                    x={x}
                    y={CHART_H - Math.max(h, 1.5)}
                    width={barW}
                    height={Math.max(h, 1.5)}
                    rx={Math.min(3, barW / 2)}
                    fill={hover === i ? 'hsl(var(--brand-accent))' : 'hsl(var(--primary))'}
                    pointerEvents="none"
                  />
                )}
                {i % labelEvery === 0 && (
                  <text x={AXIS_W + i * slot + slot / 2} y={CHART_H + 15} textAnchor="middle" fontSize={10} fill="hsl(var(--muted-foreground))">
                    {DAY_UTC.format(new Date(`${d.date}T00:00:00Z`))}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      {!spent && (
        <p className="pointer-events-none absolute inset-x-0 top-16 text-center text-[12px] text-muted-foreground">
          {used ? 'No billed spend in this window.' : 'No use in this window.'}
        </p>
      )}
      {hovered && hover != null && (
        <div
          className="pointer-events-none absolute top-2 z-10 w-max max-w-[240px] rounded-sm border border-border bg-card px-3 py-2 text-[11.5px] shadow-md"
          style={{
            left: AXIS_W + (hover + 0.5) * slot,
            transform: hover > n / 2 ? 'translateX(calc(-100% - 8px))' : 'translateX(8px)',
          }}
        >
          <p className="font-semibold text-foreground">{DAY_UTC.format(new Date(`${hovered.date}T00:00:00Z`))}</p>
          <p className="text-foreground">
            {usd(hovered.costUsd)} · {hovered.count} {unit}{hovered.count === 1 ? '' : 's'}
          </p>
          {hasTokens && (
            <p className="text-muted-foreground">
              {tokens(hovered.inputTokens ?? 0)} in · {tokens(hovered.outputTokens ?? 0)} out · {tokens(hovered.cachedInputTokens ?? 0)} cached
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** The card's tiny daily-spend series: bars, no axis, labelled by the card. */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(...values, 0);
  const n = values.length || 1;
  const W = 120;
  const H = 32;
  const slot = W / n;
  const barW = Math.max(1, Math.min(4, slot - 1));
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block flex-shrink-0" role="img" aria-label={label}>
      <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="hsl(var(--border))" strokeWidth={1} />
      {max > 0 &&
        values.map((v, i) => {
          if (v <= 0) return null;
          const h = Math.max(1.5, (v / max) * (H - 2));
          return (
            <rect
              key={i}
              x={i * slot + (slot - barW) / 2}
              y={H - 1 - h}
              width={barW}
              height={h}
              rx={Math.min(1.5, barW / 2)}
              fill="hsl(var(--primary))"
            />
          );
        })}
    </svg>
  );
}

/** A thin share-of-total bar for a breakdown row (the % is printed beside it). */
export function ShareBar({ share }: { share: number }) {
  const pct = Math.max(0, Math.min(100, share * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <div className="h-full rounded-full bg-primary" style={{ width: `${pct > 0 ? Math.max(pct, 2) : 0}%` }} />
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 py-2" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-9 animate-pulse rounded-sm bg-muted" />
      ))}
    </div>
  );
}

export function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
