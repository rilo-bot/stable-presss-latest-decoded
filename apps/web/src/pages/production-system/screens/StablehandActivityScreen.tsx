/**
 * Stable Hand Activity — AI Activity's Stable Hand view
 * (/production-system/ai-activity/stable-hand; the old /stablehand-activity path
 * redirects there). AiActivityScreen renders it `embedded`, with the page's own
 * window and Mine/Everyone controls; standalone it keeps its own header + controls.
 *
 * The Stable Hand Operator's own run log, read back: what it was asked, how many
 * model steps it took, the tokens and the (estimated) cost, and the screen it
 * ended on. Every staff member sees their OWN runs; "Everyone" appears only when
 * the server says so (`canSeeAll`, which it grants on `analytics.view`).
 *
 * Reads three endpoints in routes/agentOperator (server):
 *   GET /api/agent/operator/usage?days=&scope=   per-day cost/runs/tokens + today's budget
 *   GET /api/agent/operator/runs?days=&scope=&before=   newest-first runs, paged
 *   GET /api/agent/operator/runs/:runId?userId=  one run's steps, for the drawer
 *
 * Costs are ESTIMATES from list prices (lib/agent/operator/runs.ts) — they exist
 * to cap runaway spend, and the page says so rather than implying an invoice.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Bot, Loader2, X } from 'lucide-react';

import { authFetchRetry } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Empty, Panel, SegmentedControl, StatTile } from '../emoji-analytics/parts';
import { DailyChart, Fact, TableSkeleton } from '../ai-activity/charts';
import { TIME, cacheLine, screenName, shortModel, tokens, usd, when } from '../ai-activity/format';

// ── Wire types (mirror lib/agent/operator/activity.ts) ──────────────────────

type Scope = 'mine' | 'all';
type LoadState = 'loading' | 'ready' | 'error';

interface Totals {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
}

interface RunSummary {
  runId: string;
  userId: string;
  userName: string;
  startedAt: string;
  updatedAt: string;
  model: string;
  models: string[];
  prompt: string;
  lastPath: string;
  stepCount: number;
  totals: Totals;
  costUsd: number;
}

interface RunStep extends Totals {
  at: string;
  model: string;
  finishReason: string;
  tools: { name: string; input: string }[];
}

interface RunDetail extends RunSummary {
  steps: RunStep[];
}

interface UsageDay extends Totals {
  date: string;
  costUsd: number;
  runs: number;
}

interface UsageReport {
  scope: Scope;
  canSeeAll: boolean;
  from: string;
  to: string;
  days: UsageDay[];
  totals: Totals & { costUsd: number; runs: number };
  /** budgetUsd is null when no daily cap is configured (the default). */
  today: { date: string; spentUsd: number; budgetUsd: number | null };
}

interface RunsPage {
  scope: Scope;
  canSeeAll: boolean;
  runs: RunSummary[];
  nextBefore: string | null;
}

const WINDOWS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
] as const;
export type WindowId = (typeof WINDOWS)[number]['value'];

// ── Data hooks ──────────────────────────────────────────────────────────────

function useUsage(scope: Scope, days: string) {
  const [data, setData] = useState<UsageReport | null>(null);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    let active = true;
    setState('loading');
    authFetchRetry(`/api/agent/operator/usage?scope=${scope}&days=${days}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as UsageReport;
      })
      .then((d) => {
        if (!active) return;
        setData(d);
        setState('ready');
      })
      .catch(() => active && setState('error'));
    return () => {
      active = false;
    };
  }, [scope, days]);

  return { data, state };
}

function useRuns(scope: Scope, days: string) {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [canSeeAll, setCanSeeAll] = useState(false);
  const [state, setState] = useState<LoadState>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  const generation = useRef(0);

  const fetchPage = useCallback(
    async (before: string | null) => {
      const params = new URLSearchParams({ scope, days, limit: '50' });
      if (before) params.set('before', before);
      const res = await authFetchRetry(`/api/agent/operator/runs?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as RunsPage;
    },
    [scope, days],
  );

  useEffect(() => {
    const gen = ++generation.current;
    setState('loading');
    setRuns([]);
    fetchPage(null)
      .then((page) => {
        if (gen !== generation.current) return;
        setRuns(page.runs);
        setNextBefore(page.nextBefore);
        setCanSeeAll(page.canSeeAll);
        setState('ready');
      })
      .catch(() => gen === generation.current && setState('error'));
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (!nextBefore || loadingMore) return;
    const gen = generation.current;
    setLoadingMore(true);
    fetchPage(nextBefore)
      .then((page) => {
        if (gen !== generation.current) return;
        setRuns((cur) => [...cur, ...page.runs]);
        setNextBefore(page.nextBefore);
      })
      .catch(() => undefined)
      .finally(() => setLoadingMore(false));
  }, [fetchPage, nextBefore, loadingMore]);

  return { runs, nextBefore, canSeeAll, state, loadMore, loadingMore };
}

// ── Screen ──────────────────────────────────────────────────────────────────

export default function StablehandActivityScreen({
  embedded = false,
  scope: scopeProp,
  windowId: windowProp,
}: {
  /** Inside AI Activity: no header or controls of its own — the page drives them. */
  embedded?: boolean;
  scope?: Scope;
  windowId?: WindowId;
} = {}) {
  const [ownScope, setScope] = useState<Scope>('mine');
  const [ownWindow, setWindowId] = useState<WindowId>('30');
  const scope = scopeProp ?? ownScope;
  const windowId = windowProp ?? ownWindow;
  const [open, setOpen] = useState<RunSummary | null>(null);

  const usage = useUsage(scope, windowId);
  const list = useRuns(scope, windowId);
  const canSeeAll = list.canSeeAll || !!usage.data?.canSeeAll;
  const everyone = scope === 'all';

  return (
    <div className={embedded ? 'space-y-6' : 'space-y-6 pb-4'}>
      {!embedded && (
      <>
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-[family-name:var(--font-display)] text-[19px] font-bold leading-tight text-foreground">
            Stable Hand activity
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
            Every run of The Stable Hand — what it was asked, the steps it took, the tokens it used and what that
            cost, as billed by OpenRouter.
          </p>
        </div>
        {(usage.state === 'loading' || list.state === 'loading') && (
          <span className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
            <Loader2 size={13} className="animate-spin" /> Loading
          </span>
        )}
      </div>

      {/* ── One control row ── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <SegmentedControl label="Window" options={[...WINDOWS]} value={windowId} onChange={setWindowId} />
        {canSeeAll && (
          <>
            <span aria-hidden="true" className="hidden h-4 w-px bg-border sm:block" />
            <SegmentedControl
              label="Whose runs"
              options={[
                { value: 'mine' as const, label: 'Mine' },
                { value: 'all' as const, label: 'Everyone' },
              ]}
              value={scope}
              onChange={setScope}
            />
          </>
        )}
      </div>
      </>
      )}

      {/* ── Budget + headline figures ── */}
      {usage.state === 'error' ? (
        <Panel>
          <Empty>Usage did not load. Reload the page to try again.</Empty>
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))] sm:grid-cols-2">
          <BudgetCard today={usage.data?.today} />
          <StatTile
            label={`${everyone ? 'Everyone' : 'Your'} spend · ${windowId} days`}
            value={usage.data ? usd(usage.data.totals.costUsd) : '—'}
            detail={usage.data ? `${usage.data.totals.runs} run${usage.data.totals.runs === 1 ? '' : 's'}` : ' '}
          />
          <StatTile
            label="Tokens in / out"
            value={usage.data ? `${tokens(usage.data.totals.inputTokens)} / ${tokens(usage.data.totals.outputTokens)}` : '—'}
            detail={usage.data ? cacheLine(usage.data.totals) : ' '}
          />
          <StatTile
            label="Average per run"
            value={usage.data && usage.data.totals.runs > 0 ? usd(usage.data.totals.costUsd / usage.data.totals.runs) : '—'}
            detail="Billed cost"
          />
        </div>
      )}

      {/* ── Daily spend ── */}
      {usage.state !== 'error' && (
        <Panel
          title="Daily spend"
          subtitle={`Cost per UTC day${everyone ? ', all staff' : ''}. Hover a bar for runs and tokens.`}
        >
          {usage.data ? (
            <DailyChart
              subject="The Stable Hand"
              unit="run"
              days={usage.data.days.map((d) => ({ ...d, count: d.runs }))}
            />
          ) : (
            <div className="h-[180px]" />
          )}
        </Panel>
      )}

      {/* ── Runs ── */}
      <Panel
        title="Runs"
        subtitle={everyone ? 'Everyone’s runs, newest first.' : 'Your runs, newest first. Click one to see each step.'}
      >
        <div>
          {list.state === 'error' ? (
            <Empty>The run log did not load. Reload the page to try again.</Empty>
          ) : list.state === 'loading' ? (
            <TableSkeleton />
          ) : list.runs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Bot size={22} className="text-muted-foreground" aria-hidden="true" />
              <p className="text-[13px] font-semibold text-foreground">No runs in the last {windowId} days</p>
              <p className="max-w-sm text-[12px] text-muted-foreground">
                {everyone
                  ? 'Nobody has asked The Stable Hand to do anything in this window.'
                  : 'Open The Stable Hand from the bottom-right corner and ask it to do something — each run lands here.'}
              </p>
            </div>
          ) : (
            <RunsTable runs={list.runs} showWho={everyone} onOpen={setOpen} />
          )}
          {list.state === 'ready' && list.nextBefore && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={list.loadMore}
                disabled={list.loadingMore}
                className="inline-flex items-center gap-2 rounded-sm border border-border px-4 py-1.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-60"
              >
                {list.loadingMore && <Loader2 size={12} className="animate-spin" />}
                Load older runs
              </button>
            </div>
          )}
        </div>
      </Panel>

      {open && <RunDrawer summary={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

// ── Budget ──────────────────────────────────────────────────────────────────

function BudgetCard({ today }: { today?: UsageReport['today'] }) {
  const spent = today?.spentUsd ?? 0;
  // No daily cap is configured by default — then this is just today's spend.
  if (today && today.budgetUsd === null) {
    return (
      <div className="rounded-sm border border-border/60 bg-card p-5 sm:col-span-2 lg:col-span-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[12px] text-muted-foreground">Your spend today</p>
          <p className="text-[11px] text-muted-foreground">UTC day</p>
        </div>
        <p className="mt-2 text-[32px] font-bold leading-[1.1] text-foreground">{usd(spent)}</p>
        <p className="mt-2 text-[11.5px] text-muted-foreground">No daily limit.</p>
      </div>
    );
  }
  const budget = today?.budgetUsd ?? 0;
  const ratio = budget > 0 ? spent / budget : 0;
  const pct = Math.min(100, Math.round(ratio * 100));
  const near = ratio >= 0.8;

  return (
    <div className="rounded-sm border border-border/60 bg-card p-5 sm:col-span-2 lg:col-span-1">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[12px] text-muted-foreground">Your spend today</p>
        <p className="text-[11px] text-muted-foreground">resets 00:00 UTC</p>
      </div>
      <p className="mt-2 text-[32px] font-bold leading-[1.1] text-foreground">
        {today ? usd(spent) : '—'}
        <span className="ml-1.5 text-[14px] font-semibold text-muted-foreground">
          {today ? `of ${usd(budget)}` : ''}
        </span>
      </p>
      {/* Gold FILL with an edge — gold on white alone is 2.2:1 (THEME-DIRECTION). */}
      <div
        className="mt-3 h-2.5 overflow-hidden rounded-full border border-border bg-muted"
        role="meter"
        aria-label="Today's The Stable Hand spend against your daily limit"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div
          className={cn('h-full rounded-full transition-[width]', near ? 'bg-[hsl(var(--warning))]' : 'bg-[hsl(var(--brand-accent))]')}
          style={{ width: `${today ? Math.max(pct, spent > 0 ? 2 : 0) : 0}%` }}
        />
      </div>
      <p className={cn('mt-2 flex items-center gap-1.5 text-[11.5px]', near ? 'text-[hsl(var(--warning))]' : 'text-muted-foreground')}>
        {near && <AlertTriangle size={12} aria-hidden="true" />}
        {!today
          ? ' '
          : ratio >= 1
            ? 'Daily limit reached — The Stable Hand pauses until tomorrow.'
            : near
              ? `${pct}% used — close to today's limit.`
              : `${pct}% of your daily limit used.`}
      </p>
    </div>
  );
}

// ── Table ───────────────────────────────────────────────────────────────────

function RunsTable({
  runs, showWho, onOpen,
}: {
  runs: RunSummary[];
  showWho: boolean;
  onOpen: (r: RunSummary) => void;
}) {
  const th = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground';
  return (
    <div className="-mx-5 overflow-x-auto md:-mx-6">
      <table className="w-full min-w-[820px] border-collapse text-[12.5px]">
        <thead className="bg-muted">
          <tr>
            <th className={cn(th, 'pl-5 md:pl-6')}>When</th>
            {showWho && <th className={th}>Who</th>}
            <th className={th}>What they asked</th>
            <th className={cn(th, 'text-right')}>Steps</th>
            <th className={cn(th, 'text-right')} title="Input / output / cached input tokens">Tokens in · out · cached</th>
            <th className={cn(th, 'text-right')}>Cost</th>
            <th className={cn(th, 'pr-5 md:pr-6')}>Last screen</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr
              key={`${r.userId}:${r.runId}`}
              tabIndex={0}
              onClick={() => onOpen(r)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpen(r);
                }
              }}
              className="cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
            >
              <td className="whitespace-nowrap py-2.5 pl-5 pr-3 align-top text-muted-foreground md:pl-6">{when(r.updatedAt)}</td>
              {showWho && <td className="whitespace-nowrap px-3 py-2.5 align-top font-medium text-foreground">{r.userName}</td>}
              <td className="max-w-[420px] px-3 py-2.5 align-top text-foreground">
                <span className="line-clamp-2">{r.prompt || <em className="text-muted-foreground">No text — attachments only</em>}</span>
              </td>
              <td className="px-3 py-2.5 text-right align-top tabular-nums text-foreground">{r.stepCount}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right align-top tabular-nums text-muted-foreground">
                <span className="text-foreground">{tokens(r.totals.inputTokens)}</span> · {tokens(r.totals.outputTokens)} · {tokens(r.totals.cachedInputTokens)}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right align-top font-semibold tabular-nums text-foreground">{usd(r.costUsd)}</td>
              <td className="max-w-[200px] truncate py-2.5 pl-3 pr-5 align-top text-muted-foreground md:pr-6" title={r.lastPath}>
                {screenName(r.lastPath)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Drawer ──────────────────────────────────────────────────────────────────

function RunDrawer({ summary, onClose }: { summary: RunSummary; onClose: () => void }) {
  const [run, setRun] = useState<RunDetail | null>(null);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    let active = true;
    setState('loading');
    const qs = new URLSearchParams({ userId: summary.userId });
    authFetchRetry(`/api/agent/operator/runs/${encodeURIComponent(summary.runId)}?${qs.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return ((await res.json()) as { run: RunDetail }).run;
      })
      .then((r) => {
        if (!active) return;
        setRun(r);
        setState('ready');
      })
      .catch(() => active && setState('error'));
    return () => {
      active = false;
    };
  }, [summary.runId, summary.userId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const head = run ?? summary;
  const models = useMemo(() => [...new Set((head.models.length ? head.models : [head.model]).filter(Boolean))], [head]);

  // Portalled to <body>: the layout's own stacking contexts would otherwise
  // leave the sidebar and top bar above the backdrop.
  return createPortal(
    <div className="fixed inset-0 z-[60] flex justify-end">
      <button type="button" aria-label="Close run details" className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Run details"
        className="relative flex h-full w-full max-w-xl flex-col border-l border-border bg-background shadow-2xl"
      >
        <header className="border-b border-border bg-card px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--brand-accent-ink))]">
                {head.userName} · {when(head.startedAt || head.updatedAt)}
              </p>
              <h2 className="mt-1 font-[family-name:var(--font-display)] text-[16px] font-bold leading-snug text-foreground">
                {head.prompt || 'No text — attachments only'}
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
          <dl className="mt-3 grid grid-cols-4 gap-3 border-t border-[hsl(var(--brand-accent))]/35 pt-3 text-[11.5px]">
            <Fact label="Steps" value={String(head.stepCount)} />
            <Fact label="Tokens in" value={tokens(head.totals.inputTokens)} />
            <Fact label="Out · cached" value={`${tokens(head.totals.outputTokens)} · ${tokens(head.totals.cachedInputTokens)}`} />
            <Fact label="Cost" value={usd(head.costUsd)} />
          </dl>
          <p className="mt-2 truncate text-[11px] text-muted-foreground" title={head.lastPath}>
            {models.map(shortModel).join(', ')} · ended on {screenName(head.lastPath)}
          </p>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {state === 'loading' ? (
            <p className="flex items-center gap-2 py-8 text-[12px] text-muted-foreground">
              <Loader2 size={13} className="animate-spin" /> Loading steps
            </p>
          ) : state === 'error' || !run ? (
            <Empty>The steps for this run did not load.</Empty>
          ) : run.steps.length === 0 ? (
            <Empty>No steps were recorded for this run.</Empty>
          ) : (
            <ol className="space-y-3">
              {run.steps.map((s, i) => (
                <li key={`${s.at}-${i}`} className="rounded-sm border border-border/60 bg-card p-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-[12px] font-bold text-foreground">Step {i + 1}</span>
                    <span className="text-[11px] text-muted-foreground">{s.at ? TIME.format(new Date(s.at)) : ''}</span>
                    <span className="text-[11px] text-muted-foreground">{shortModel(s.model)}</span>
                    {s.finishReason && (
                      <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10.5px] font-medium text-muted-foreground">
                        {s.finishReason}
                      </span>
                    )}
                    <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                      {tokens(s.inputTokens)} in · {tokens(s.outputTokens)} out · {tokens(s.cachedInputTokens)} cached
                    </span>
                  </div>
                  {s.tools.length === 0 ? (
                    <p className="mt-2 text-[11.5px] italic text-muted-foreground">Replied without calling a tool.</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5">
                      {s.tools.map((t, j) => (
                        <li key={j} className="rounded-sm bg-muted px-2.5 py-1.5">
                          <p className="font-mono text-[11.5px] font-semibold text-primary">{t.name}</p>
                          {t.input && t.input !== '{}' && (
                            <p className="mt-0.5 line-clamp-3 break-all font-mono text-[10.5px] leading-relaxed text-muted-foreground" title={t.input}>
                              {t.input}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
