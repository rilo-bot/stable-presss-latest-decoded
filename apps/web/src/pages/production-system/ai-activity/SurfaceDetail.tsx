/**
 * AI Activity — one surface's usage: headline tiles, daily spend, breakdowns by
 * feature / model / person, and recent sessions with a per-call drill-down.
 * Laid out like the Stable Hand run log (StablehandActivityScreen), which is what
 * The Stable Hand's own view still shows.
 *
 * Reads GET /api/ai-activity/surfaces/:surface (+ /sessions, /sessions/:id).
 */
import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Bot, Loader2, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Empty, Panel, StatTile } from '../emoji-analytics/parts';
import { useSession, useSurfaceDetail, type BreakdownRow, type DetailResponse, type Scope, type SessionCall, type SessionSummary } from './api';
import { DailyChart, Fact, ShareBar, TableSkeleton } from './charts';
import { TIME, cacheLine, count, duration, shortModel, tokens, usd, when } from './format';
import { featureLabel, kindLabel, surfaceMeta } from './surfaces';

// ── The whole view ──────────────────────────────────────────────────────────

export default function SurfaceDetail({ surface, scope, days }: { surface: string; scope: Scope; days: string }) {
  const meta = surfaceMeta(surface);
  const detail = useSurfaceDetail(surface, scope, days);
  const [open, setOpen] = useState<SessionSummary | null>(null);
  const everyone = scope === 'all';
  const d = detail.data;

  if (detail.state === 'error') {
    return (
      <Panel>
        <Empty>{meta.label} usage did not load. Reload the page to try again.</Empty>
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      <SurfaceTiles data={d} days={days} everyone={everyone} />

      <Panel
        title="Daily spend"
        subtitle={`Cost per UTC day${everyone ? ', everyone' : ''}. Hover a bar for calls and tokens.`}
      >
        {d ? (
          <DailyChart subject={meta.label} days={d.days.map((x) => ({ ...x, count: x.calls }))} />
        ) : (
          <div className="h-[190px]" />
        )}
      </Panel>

      {/* Same order as the Stable Hand's run log: figures, daily spend, the log;
          then what the spend was made of. */}
      <Panel
        title="Recent sessions"
        subtitle={
          everyone
            ? 'Everyone’s sessions, newest first. A session is one conversation, run or job; open one to see every call.'
            : 'Your sessions, newest first. A session is one conversation, run or job; open one to see every call.'
        }
      >
        {detail.state === 'loading' ? (
          <TableSkeleton />
        ) : detail.sessions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Bot size={22} className="text-muted-foreground" aria-hidden="true" />
            <p className="text-[13px] font-semibold text-foreground">No {meta.label} use in the last {days} days</p>
            <p className="max-w-sm text-[12px] text-muted-foreground">
              {everyone ? 'Nobody has used it in this window.' : 'Each time you use it, the calls it makes land here.'}
            </p>
          </div>
        ) : (
          <SessionsList sessions={detail.sessions} surface={surface} showWho={everyone} onOpen={setOpen} />
        )}
        {detail.state === 'ready' && detail.nextBefore && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={detail.loadMore}
              disabled={detail.loadingMore}
              className="inline-flex items-center gap-2 rounded-sm border border-border px-4 py-1.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-60"
            >
              {detail.loadingMore && <Loader2 size={12} className="animate-spin" />}
              Load older sessions
            </button>
          </div>
        )}
      </Panel>

      <Breakdowns data={d} surface={surface} everyone={everyone} />

      {open && <SessionDrawer summary={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

// ── Tiles ───────────────────────────────────────────────────────────────────

function SurfaceTiles({ data, days, everyone }: { data: DetailResponse | null; days: string; everyone: boolean }) {
  const t = data?.totals;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile
        label={`${everyone ? 'Everyone' : 'Your'} spend · ${days} days`}
        value={t ? usd(t.costUsd) : '—'}
        detail={t ? estimateLine(t.calls, t.estimated) : ' '}
      />
      <StatTile
        label="Calls"
        value={t ? t.calls.toLocaleString() : '—'}
        detail={
          t ? (
            <>
              {count(t.sessions, 'session')}
              {everyone && ` · ${count(t.users, 'person', 'people')}`}
              {t.errors > 0 && (
                <span className="text-[hsl(var(--warning))]">
                  {' · '}
                  <AlertTriangle size={11} className="inline align-[-1px]" aria-hidden="true" /> {t.errors} failed
                </span>
              )}
            </>
          ) : (
            ' '
          )
        }
      />
      <StatTile
        label="Tokens in / out"
        value={t ? `${tokens(t.inputTokens)} / ${tokens(t.outputTokens)}` : '—'}
        detail={t ? cacheLine(t) : ' '}
      />
      <StatTile
        label="Average per session"
        value={t && t.sessions > 0 ? usd(t.costUsd / t.sessions) : '—'}
        detail={t && t.calls > 0 ? `${duration(t.durationMs / t.calls)} per call on average` : ' '}
      />
    </div>
  );
}

function estimateLine(calls: number, estimated: number): string {
  if (calls === 0) return 'No calls in this window';
  if (estimated === 0) return 'Billed cost from the provider';
  if (estimated === calls) return 'Estimated from list prices';
  return `${count(estimated, 'call')} estimated from list prices`;
}

// ── Breakdowns ──────────────────────────────────────────────────────────────

export function Breakdowns({
  data, surface, everyone, only,
}: {
  data: DetailResponse | null;
  surface: string;
  everyone: boolean;
  /** Which panels to show (The Stable Hand's view shows model + person only). */
  only?: ('feature' | 'model' | 'person')[];
}) {
  const show = (k: 'feature' | 'model' | 'person') => (!only || only.includes(k)) && (k !== 'person' || everyone);
  const total = data?.totals.costUsd ?? 0;
  const calls = data?.totals.calls ?? 0;
  const visible = (['feature', 'model', 'person'] as const).filter(show).length;
  // Two panels share a row; a third (people) takes a row of its own.
  const personWide = visible === 3;
  return (
    <div className={cn('grid gap-4', visible > 1 && 'lg:grid-cols-2')}>
      {show('feature') && (
        <Panel title="By feature" subtitle="Which part of it did the work.">
          <BreakdownTable
            rows={data?.byFeature ?? null}
            label={(r) => featureLabel(r.key, surface)}
            totalCost={total}
            totalCalls={calls}
          />
        </Panel>
      )}
      {show('model') && (
        <Panel title="By model" subtitle="The AI models it called.">
          <BreakdownTable rows={data?.byModel ?? null} label={(r) => shortModel(r.key) || 'Unknown'} totalCost={total} totalCalls={calls} />
        </Panel>
      )}
      {show('person') && (
        <Panel title="By person" subtitle="Who used it in this window." className={personWide ? 'lg:col-span-2' : undefined}>
          <BreakdownTable
            rows={data?.byUser ?? null}
            label={(r) => r.userName}
            totalCost={total}
            totalCalls={calls}
            showLast
          />
        </Panel>
      )}
    </div>
  );
}

function BreakdownTable<R extends BreakdownRow>({
  rows, label, totalCost, totalCalls, showLast = false,
}: {
  rows: R[] | null;
  label: (r: R) => string;
  totalCost: number;
  totalCalls: number;
  showLast?: boolean;
}) {
  if (!rows) return <TableSkeleton rows={3} />;
  if (rows.length === 0) return <Empty>Nothing in this window.</Empty>;
  // Share of spend; of calls when nothing was billed (e.g. only estimates of $0).
  const byCost = totalCost > 0;
  return (
    <ul className="divide-y divide-border/50">
      {rows.map((r) => {
        const share = byCost ? r.costUsd / totalCost : totalCalls > 0 ? r.calls / totalCalls : 0;
        return (
          <li key={r.key || '(none)'} className="py-2.5">
            <div className="flex items-baseline gap-3">
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground" title={label(r)}>
                {label(r)}
              </span>
              <span className="flex-shrink-0 text-[13px] font-semibold tabular-nums text-foreground">{usd(r.costUsd)}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <ShareBar share={share} />
              </div>
              <span className="w-10 flex-shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                {Math.round(share * 100)}%
              </span>
            </div>
            <p className="mt-1 text-[11.5px] tabular-nums text-muted-foreground">
              {count(r.calls, 'call')} · {tokens(r.inputTokens)} in · {tokens(r.outputTokens)} out
              {r.errors > 0 && <span className="text-[hsl(var(--warning))]"> · {r.errors} failed</span>}
              {showLast && r.lastUsedAt && <> · last {when(r.lastUsedAt)}</>}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

// ── Sessions ────────────────────────────────────────────────────────────────

/** What a session was: its subject (a magazine's title…) and the steps it took. */
function sessionTitle(s: SessionSummary, surface: string): string {
  if (s.entityTitle) return s.entityTitle;
  const steps = s.features.map((f) => featureLabel(f, surface));
  if (steps.length > 0) return [...new Set(steps)].slice(0, 3).join(', ') + (steps.length > 3 ? '…' : '');
  return featureLabel('', surface);
}

function sessionSubline(s: SessionSummary, surface: string): string {
  const parts: string[] = [];
  if (s.entityTitle && s.features.length > 0) {
    parts.push([...new Set(s.features.map((f) => featureLabel(f, surface)))].slice(0, 4).join(', '));
  }
  if (s.models.length > 0) parts.push(s.models.map(shortModel).join(', '));
  return parts.join(' · ');
}

function SessionsList({
  sessions, surface, showWho, onOpen,
}: {
  sessions: SessionSummary[];
  surface: string;
  showWho: boolean;
  onOpen: (s: SessionSummary) => void;
}) {
  const th = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground';
  const keyOf = (s: SessionSummary) => `${s.userId}:${s.sessionId ?? s.callId}`;
  const activate = (s: SessionSummary) => (e: ReactKeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen(s);
    }
  };
  return (
    <>
      {/* Phones: one card per session. */}
      <ul className="space-y-2 md:hidden">
        {sessions.map((s) => (
          <li key={keyOf(s)}>
            <button
              type="button"
              onClick={() => onOpen(s)}
              className="w-full rounded-sm border border-border/60 bg-background p-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[11.5px] text-muted-foreground">{when(s.lastUsedAt)}</span>
                <span className="text-[13px] font-semibold tabular-nums text-foreground">{usd(s.costUsd)}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-[13px] font-medium text-foreground">{sessionTitle(s, surface)}</p>
              <p className="mt-1 text-[11.5px] text-muted-foreground">
                {showWho && <>{s.userName} · </>}
                {count(s.calls, 'call')} · {tokens(s.inputTokens)} in · {tokens(s.outputTokens)} out
                {s.errors > 0 && <span className="text-[hsl(var(--warning))]"> · {s.errors} failed</span>}
              </p>
            </button>
          </li>
        ))}
      </ul>

      {/* Tablet and up: the run-log table. */}
      <div className="-mx-5 hidden overflow-x-auto md:-mx-6 md:block">
        <table className="w-full min-w-[760px] border-collapse text-[12.5px]">
          <thead className="bg-muted">
            <tr>
              <th className={cn(th, 'pl-5 md:pl-6')}>When</th>
              {showWho && <th className={th}>Who</th>}
              <th className={th}>What</th>
              <th className={cn(th, 'text-right')}>Calls</th>
              <th className={cn(th, 'text-right')} title="Input / output / cached input tokens">Tokens in · out · cached</th>
              <th className={cn(th, 'text-right')}>Cost</th>
              <th className={cn(th, 'pr-5 text-right md:pr-6')}>Took</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => {
              const sub = sessionSubline(s, surface);
              const took = s.startedAt && s.lastUsedAt ? Date.parse(s.lastUsedAt) - Date.parse(s.startedAt) : 0;
              return (
                <tr
                  key={keyOf(s)}
                  tabIndex={0}
                  onClick={() => onOpen(s)}
                  onKeyDown={activate(s)}
                  className="cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                >
                  <td className="whitespace-nowrap py-2.5 pl-5 pr-3 align-top text-muted-foreground md:pl-6">{when(s.lastUsedAt)}</td>
                  {showWho && <td className="whitespace-nowrap px-3 py-2.5 align-top font-medium text-foreground">{s.userName}</td>}
                  <td className="max-w-[380px] px-3 py-2.5 align-top text-foreground">
                    <span className="line-clamp-1 font-medium">{sessionTitle(s, surface)}</span>
                    {sub && <span className="line-clamp-1 text-[11.5px] text-muted-foreground">{sub}</span>}
                    {s.error && (
                      <span className="mt-0.5 flex items-center gap-1 text-[11.5px] text-[hsl(var(--warning))]">
                        <AlertTriangle size={11} aria-hidden="true" /> {count(s.errors, 'call')} failed
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right align-top tabular-nums text-foreground">{s.calls}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right align-top tabular-nums text-muted-foreground">
                    <span className="text-foreground">{tokens(s.inputTokens)}</span> · {tokens(s.outputTokens)} · {tokens(s.cachedInputTokens)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right align-top font-semibold tabular-nums text-foreground">{usd(s.costUsd)}</td>
                  <td className="whitespace-nowrap py-2.5 pl-3 pr-5 text-right align-top tabular-nums text-muted-foreground md:pr-6">
                    {duration(s.calls > 1 ? took : s.durationMs)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Drawer ──────────────────────────────────────────────────────────────────

/** A lone call (no session) is shown from its summary row — there is nothing more to fetch. */
function loneCall(s: SessionSummary): SessionCall {
  return {
    id: s.callId ?? '',
    createdAt: s.lastUsedAt ?? s.startedAt,
    surface: s.surface,
    feature: s.features[0] ?? '',
    model: s.models[0] ?? '',
    kind: s.kinds[0] ?? 'text',
    inputTokens: s.inputTokens,
    outputTokens: s.outputTokens,
    cachedInputTokens: s.cachedInputTokens,
    reasoningTokens: s.reasoningTokens,
    costUsd: s.costUsd,
    costSource: s.estimated > 0 ? 'estimate' : 'provider',
    durationMs: s.durationMs,
    ok: s.errors === 0,
    error: s.error,
  };
}

function SessionDrawer({ summary, onClose }: { summary: SessionSummary; onClose: () => void }) {
  const fetched = useSession(summary.sessionId ? summary : null);
  const calls = summary.sessionId ? fetched.session?.calls ?? null : [loneCall(summary)];
  const state = summary.sessionId ? fetched.state : 'ready';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const meta = surfaceMeta(summary.surface);
  const models = useMemo(() => [...new Set(summary.models)].map(shortModel), [summary.models]);

  // Portalled to <body>: the layout's own stacking contexts would otherwise
  // leave the sidebar and top bar above the backdrop.
  return createPortal(
    <div className="fixed inset-0 z-[60] flex justify-end">
      <button type="button" aria-label="Close session details" className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Session details"
        className="relative flex h-full w-full max-w-xl flex-col border-l border-border bg-background shadow-2xl"
      >
        <header className="border-b border-border bg-card px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--brand-accent-ink))]">
                {meta.label} · {summary.userName} · {when(summary.startedAt || summary.lastUsedAt)}
              </p>
              <h2 className="mt-1 font-[family-name:var(--font-display)] text-[16px] font-bold leading-snug text-foreground">
                {sessionTitle(summary, summary.surface)}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-[hsl(var(--brand-accent))]/35 pt-3 text-[11.5px] sm:grid-cols-4">
            <Fact label="Calls" value={String(summary.calls)} />
            <Fact label="Tokens in" value={tokens(summary.inputTokens)} />
            <Fact label="Out · cached" value={`${tokens(summary.outputTokens)} · ${tokens(summary.cachedInputTokens)}`} />
            <Fact label="Cost" value={usd(summary.costUsd)} />
          </dl>
          {models.length > 0 && <p className="mt-2 truncate text-[11px] text-muted-foreground">{models.join(', ')}</p>}
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {state === 'loading' ? (
            <p className="flex items-center gap-2 py-8 text-[12px] text-muted-foreground">
              <Loader2 size={13} className="animate-spin" /> Loading calls
            </p>
          ) : state !== 'ready' || !calls ? (
            <Empty>The calls in this session did not load.</Empty>
          ) : calls.length === 0 ? (
            <Empty>No calls were recorded for this session.</Empty>
          ) : (
            <>
              <ol className="space-y-3">
                {calls.map((c, i) => (
                  <CallCard key={c.id || i} call={c} index={i} surface={summary.surface} />
                ))}
              </ol>
              {fetched.session?.truncated && (
                <p className="mt-3 text-center text-[11.5px] text-muted-foreground">
                  Showing the first {calls.length} calls of this session.
                </p>
              )}
            </>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}

function CallCard({ call: c, index, surface }: { call: SessionCall; index: number; surface: string }) {
  return (
    <li className="rounded-sm border border-border/60 bg-card p-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[12px] font-bold text-foreground">
          {index + 1}. {featureLabel(c.feature, surface)}
        </span>
        <span className="text-[11px] text-muted-foreground">{c.createdAt ? TIME.format(new Date(c.createdAt)) : ''}</span>
        <span className="text-[11px] text-muted-foreground">{shortModel(c.model)}</span>
        {c.kind !== 'text' && (
          <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground">{kindLabel(c.kind)}</span>
        )}
        <span className="ml-auto text-[11.5px] font-semibold tabular-nums text-foreground" title={c.costSource === 'provider' ? 'Billed cost' : 'Estimated from list prices'}>
          {usd(c.costUsd)}
          {c.costSource !== 'provider' && <span className="font-normal text-muted-foreground"> est.</span>}
        </span>
      </div>
      <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
        {tokens(c.inputTokens)} in · {tokens(c.outputTokens)} out · {tokens(c.cachedInputTokens)} cached
        {c.reasoningTokens > 0 && <> · {tokens(c.reasoningTokens)} thinking</>} · {duration(c.durationMs)}
      </p>
      {!c.ok && (
        <p className="mt-2 flex items-start gap-1.5 rounded-sm bg-muted px-2.5 py-1.5 text-[11.5px] text-[hsl(var(--warning))]">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
          <span className="line-clamp-3 break-words">{c.error || 'This call failed.'}</span>
        </p>
      )}
    </li>
  );
}
