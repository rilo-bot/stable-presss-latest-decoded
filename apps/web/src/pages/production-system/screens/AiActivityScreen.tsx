/**
 * AI Activity — /production-system/ai-activity[/:surface]
 *
 * Every AI surface in Stable Press on one page: The Stable Hand, the Magazine
 * Builder, Story AI, the other studios, the site chat… One card each with its
 * calls, cost, tokens and last use for the window; click a card (deep link
 * /ai-activity/<surface>) for that surface's own view — daily spend, breakdowns,
 * and recent sessions down to each call. The Stable Hand's view is its existing
 * run log (StablehandActivityScreen, embedded), so nothing it showed is lost.
 *
 * Everyone sees their OWN usage; "Everyone" appears only when the server says so
 * (`canSeeAll`, granted on analytics.view). Window and scope live in the query
 * string (?days=30&scope=all) so a link opens on the same view.
 *
 * Data: GET /api/ai-activity/* (apps/server/src/routes/aiActivity), fed by the
 * usage meter every AI call passes through (lib/agent/aiUsage.ts).
 */
import { useCallback, useEffect, useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { PS_BASE } from '../../newsroom/constants';
import { Empty, Panel, SegmentedControl, StatTile } from '../emoji-analytics/parts';
import { useSurfaceDetail, useSurfaces, type Scope, type SurfaceRow, type SurfacesResponse } from '../ai-activity/api';
import { Sparkline } from '../ai-activity/charts';
import { ago, cacheLine, count, tokens, usd } from '../ai-activity/format';
import SurfaceDetail, { Breakdowns } from '../ai-activity/SurfaceDetail';
import { SURFACES, isSurfaceId, surfaceMeta, type SurfaceMeta } from '../ai-activity/surfaces';
import StablehandActivityScreen from './StablehandActivityScreen';

const WINDOWS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
] as const;
type WindowId = (typeof WINDOWS)[number]['value'];

const BASE = `${PS_BASE}/ai-activity`;

export default function AiActivityScreen() {
  const { surface } = useParams<{ surface?: string }>();
  const [params, setParams] = useSearchParams();
  const rawDays = params.get('days');
  const days: WindowId = rawDays === '7' || rawDays === '90' ? rawDays : '30';
  const scope: Scope = params.get('scope') === 'all' ? 'all' : 'mine';

  const setParam = useCallback(
    (key: 'days' | 'scope', value: string | null) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value == null) next.delete(key);
          else next.set(key, value);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const overview = useSurfaces(scope, days);
  const canSeeAll = !!overview.data?.canSeeAll;

  // A link that asks for Everyone without the right drops back to Mine.
  useEffect(() => {
    if (overview.state === 'forbidden') setParam('scope', null);
  }, [overview.state, setParam]);

  const query = params.toString();
  const hrefFor = (id: string) => `${BASE}/${id}${query ? `?${query}` : ''}`;
  const known = !surface || isSurfaceId(surface);
  const meta = surface ? surfaceMeta(surface) : null;

  return (
    <div className="space-y-6 pb-4">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          {meta ? (
            <>
              <Link
                to={`${BASE}${query ? `?${query}` : ''}`}
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft size={13} aria-hidden="true" /> All AI activity
              </Link>
              <h1 className="mt-2 flex items-center gap-2.5 font-[family-name:var(--font-display)] text-[19px] font-bold leading-tight text-foreground">
                <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-sm bg-muted text-primary" aria-hidden="true">
                  {meta.icon}
                </span>
                <span className="min-w-0">{meta.label}</span>
              </h1>
              {meta.blurb && (
                <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                  {meta.blurb}.
                  {surface === 'stable-hand'
                    ? ' Every run — what it was asked, the steps it took, the tokens it used and what that cost.'
                    : ' Daily spend, what it was used for, and every session down to each call.'}
                </p>
              )}
            </>
          ) : (
            <>
              <h1 className="font-[family-name:var(--font-display)] text-[19px] font-bold leading-tight text-foreground">
                AI activity
              </h1>
              <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                What every AI in Stable Press has done and what it cost — The Stable Hand, the Magazine Builder, Story AI
                and the other studios. Open one to see its usage in detail.
              </p>
            </>
          )}
        </div>
        {overview.state === 'loading' && (
          <span className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
            <Loader2 size={13} className="animate-spin" /> Loading
          </span>
        )}
      </div>

      {/* ── One control row ── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <SegmentedControl
          label="Window"
          options={[...WINDOWS]}
          value={days}
          onChange={(v) => setParam('days', v === '30' ? null : v)}
          agentIdPrefix="ai-activity.window"
        />
        {canSeeAll && (
          <>
            <span aria-hidden="true" className="hidden h-4 w-px bg-border sm:block" />
            <SegmentedControl
              label="Whose usage"
              options={[
                { value: 'mine' as const, label: 'Mine' },
                { value: 'all' as const, label: 'Everyone' },
              ]}
              value={scope}
              onChange={(v) => setParam('scope', v === 'all' ? 'all' : null)}
              agentIdPrefix="ai-activity.scope"
            />
          </>
        )}
      </div>

      {meta && known && <SurfaceSwitcher data={overview.data} active={surface!} hrefFor={hrefFor} />}

      {!known ? (
        <Panel>
          <Empty>
            There is no AI called “{surface}”.{' '}
            <Link to={BASE} className="font-semibold text-foreground underline underline-offset-2">
              See all AI activity
            </Link>
          </Empty>
        </Panel>
      ) : !surface ? (
        <Overview data={overview.data} state={overview.state} days={days} scope={scope} hrefFor={hrefFor} />
      ) : surface === 'stable-hand' ? (
        <StableHandView scope={scope} days={days} />
      ) : (
        <SurfaceDetail key={surface} surface={surface} scope={scope} days={days} />
      )}
    </div>
  );
}

/** Core surfaces always; the rest once they have been used in the window. */
function visibleSurfaces(data: SurfacesResponse | null): { meta: SurfaceMeta; row: SurfaceRow | null }[] {
  const rows = new Map((data?.surfaces ?? []).map((r) => [r.surface, r]));
  const out = SURFACES.map((meta) => ({ meta, row: rows.get(meta.id) ?? null })).filter(
    ({ meta, row }) => meta.core || (row?.calls ?? 0) > 0,
  );
  // A surface the server knows and this build does not: still listed, never lost.
  for (const row of data?.surfaces ?? []) {
    if (!isSurfaceId(row.surface) && row.calls > 0) out.push({ meta: surfaceMeta(row.surface), row });
  }
  return out;
}

// ── Overview ────────────────────────────────────────────────────────────────

function Overview({
  data, state, days, scope, hrefFor,
}: {
  data: SurfacesResponse | null;
  state: string;
  days: WindowId;
  scope: Scope;
  hrefFor: (id: string) => string;
}) {
  const everyone = scope === 'all';
  const cards = useMemo(() => visibleSurfaces(data), [data]);
  const busiest = useMemo(() => {
    const used = (data?.surfaces ?? []).filter((s) => s.calls > 0);
    return used.sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls)[0] ?? null;
  }, [data]);

  if (state === 'error') {
    return (
      <Panel>
        <Empty>AI activity did not load. Reload the page to try again.</Empty>
      </Panel>
    );
  }

  const t = data?.totals;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile
          label={`${everyone ? 'Everyone' : 'Your'} AI spend · ${days} days`}
          value={t ? usd(t.costUsd) : '—'}
          detail={t ? `${count(t.calls, 'call')} · ${count(t.sessions, 'session')}` : ' '}
        />
        <StatTile
          label="Tokens in / out"
          value={t ? `${tokens(t.inputTokens)} / ${tokens(t.outputTokens)}` : '—'}
          detail={t ? cacheLine(t) : ' '}
        />
        <StatTile
          label="Most used"
          display
          value={busiest ? surfaceMeta(busiest.surface).label : t ? 'Nothing yet' : '—'}
          detail={
            busiest && t
              ? `${usd(busiest.costUsd)} · ${t.costUsd > 0 ? Math.round((busiest.costUsd / t.costUsd) * 100) : 0}% of spend`
              : ' '
          }
        />
      </div>

      <section aria-label="AI surfaces">
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map(({ meta, row }) => (
            <li key={meta.id}>
              <SurfaceCard meta={meta} row={row} days={days} href={hrefFor(meta.id)} loading={!data} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function SurfaceCard({
  meta, row, days, href, loading,
}: {
  meta: SurfaceMeta;
  row: SurfaceRow | null;
  days: WindowId;
  href: string;
  loading: boolean;
}) {
  const used = !!row && row.calls > 0;
  return (
    <Link
      to={href}
      data-agent-id={`ai-activity.surface-${meta.id}`}
      data-agent-label={`Open ${meta.label} activity`}
      className="group flex h-full flex-col rounded-sm border border-border/60 bg-card p-5 transition-colors hover:border-primary/50 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-sm bg-muted text-primary" aria-hidden="true">
          {meta.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-[family-name:var(--font-display)] text-[15px] font-bold leading-snug text-foreground">{meta.label}</p>
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-muted-foreground">{meta.blurb}</p>
        </div>
        <ChevronRight size={16} className="mt-1 flex-shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden="true" />
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className={cn('text-[26px] font-bold leading-none tabular-nums', used ? 'text-foreground' : 'text-muted-foreground')}>
            {loading ? '—' : usd(row?.costUsd ?? 0)}
          </p>
          <p className="mt-1.5 text-[11.5px] text-muted-foreground">
            {loading ? ' ' : used ? `${count(row!.calls, 'call')} · ${count(row!.sessions, 'session')}` : `Not used in the last ${days} days`}
          </p>
        </div>
        {used && <Sparkline values={row!.days.map((d) => d.calls)} label={`${meta.label}: calls per day over ${days} days`} />}
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border/60 pt-3 text-[11.5px]">
        <div className="min-w-0">
          <dt className="text-muted-foreground">Tokens in</dt>
          <dd className="truncate font-semibold tabular-nums text-foreground">{row ? tokens(row.inputTokens) : '—'}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">Tokens out</dt>
          <dd className="truncate font-semibold tabular-nums text-foreground">{row ? tokens(row.outputTokens) : '—'}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">Last used</dt>
          <dd className="truncate font-semibold text-foreground" title={row?.lastUsedAt ?? undefined}>
            {row ? ago(row.lastUsedAt) : '—'}
          </dd>
        </div>
      </dl>
    </Link>
  );
}

// ── Detail chrome ───────────────────────────────────────────────────────────

/** Jump between surfaces without going back: a scrollable strip on phones. */
function SurfaceSwitcher({
  data, active, hrefFor,
}: {
  data: SurfacesResponse | null;
  active: string;
  hrefFor: (id: string) => string;
}) {
  const items = visibleSurfaces(data);
  if (!items.some((i) => i.meta.id === active)) items.push({ meta: surfaceMeta(active), row: null });
  return (
    <nav aria-label="AI surfaces" className="-mx-4 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
      <ul className="flex w-max gap-2">
        {items.map(({ meta, row }) => {
          const on = meta.id === active;
          return (
            <li key={meta.id}>
              <Link
                to={hrefFor(meta.id)}
                aria-current={on ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center gap-2 whitespace-nowrap rounded-sm border px-3 py-1.5 text-[12px] transition-colors',
                  on
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border/60 bg-card text-foreground hover:bg-muted',
                )}
              >
                <span className="font-semibold">{meta.label}</span>
                {row && row.calls > 0 && (
                  <span className={cn('tabular-nums', on ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                    {usd(row.costUsd)}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * The Stable Hand: its own run log, exactly as Stable Hand Activity showed it
 * (today's spend, daily cost, every run with its steps) — plus, from the usage
 * meter, which models it ran on and who used it.
 */
function StableHandView({ scope, days }: { scope: Scope; days: WindowId }) {
  const meter = useSurfaceDetail('stable-hand', scope, days);
  return (
    <div className="space-y-6">
      <StablehandActivityScreen embedded scope={scope} windowId={days} />
      {meter.data && meter.data.totals.calls > 0 && (
        <Breakdowns data={meter.data} surface="stable-hand" everyone={scope === 'all'} only={['model', 'person']} />
      )}
    </div>
  );
}
