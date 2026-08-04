/**
 * The five blocks the Overview is made of.
 *
 * WHAT THIS REPLACED. The screen was nine stacked blocks and roughly thirty-five
 * separate bordered boxes: an AI brief panel, six "snapshot" stat cards, a
 * needs-attention card grid, an eight-row quick-actions grid (each row carrying
 * its own second button), a contributor notice, five module shortcut bands, four
 * MORE stat cards restating two of the numbers already shown above, six pipeline
 * tiles, and a zebra-striped table. Three of those blocks were navigation the
 * sidebar already owns, and five of their links pointed at screens that no longer
 * exist (see navTargets.ts).
 *
 * WHAT IT IS NOW, and why it looks like this:
 *   1. Masthead — ONE green band. Navigation and chrome are green in this app
 *      (docs/THEME-DIRECTION.md: green frames, white is the work, gold points),
 *      and the Overview is the one screen whose whole job is orientation, so it
 *      gets the app's only green content block. The brief, the four story figures
 *      and the register ledger all live inside it, which is where eleven of the
 *      old boxes went.
 *   2. Attention — one card, one divided list. A grid of identical cards forced
 *      the eye to scan in two dimensions to read a to-do list.
 *   3. Pipeline — one card: a proportional bar plus five segments on a hairline
 *      grid, not five free-floating tiles.
 *   4. Start — three tiles for the things you START from here. The registers are
 *      reachable from the ledger and the sidebar, so they are not cards.
 *   5. Recent — one card. No zebra striping.
 *
 * Colour discipline throughout: gold is a fill, a rule or a numeral on green
 * (5.19:1) — never small text on a light surface, where it reads 2.06:1. Gold as
 * text uses `--brand-accent-ink`.
 */
import type { ReactNode } from 'react';
import {
  ArrowRight, CheckCircle2, RefreshCw, Sparkles, Wand2,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/utils';
import type { StageMeta } from '@/lib/workflow';
import type { Article } from '@/types/article';

import { StatusBadge } from '../../newsroom/components/StatusBadge';

/* ── 1. Masthead ─────────────────────────────────────────────────────────── */

export interface Figure {
  label: string;
  value: number;
  /** A zero reads as "nothing there", so it is dimmed rather than gold. */
  hint?: string;
}

export interface LedgerEntry {
  label: string;
  value: number;
  /** Resolved route, or null when this role has no such screen. */
  to: string | null;
}

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Small pill-shaped control that reads correctly ON the green band. */
function BandButton({
  onClick, children, title, disabled,
}: {
  onClick: () => void;
  children: ReactNode;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        'flex items-center gap-1.5 rounded-sm border border-primary-foreground/25 bg-primary-foreground/10',
        'px-2.5 py-1.5 text-[12px] font-medium text-primary-foreground/85 transition-colors',
        'hover:bg-primary-foreground/20 hover:text-primary-foreground disabled:opacity-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/60',
      )}
    >
      {children}
    </button>
  );
}

export function OverviewMasthead({
  name, roleLabel, isContributor, brief, briefLoading, onRefreshBrief, onAskAgent,
  figures, ledger,
}: {
  name: string;
  roleLabel: string;
  isContributor: boolean;
  brief: string | null;
  briefLoading: boolean;
  onRefreshBrief: () => void;
  onAskAgent: () => void;
  figures: Figure[];
  ledger: LedgerEntry[];
}) {
  const now = new Date();
  const dateLine = now.toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
  const firstName = name.split(/\s+/)[0] || name;
  const visibleLedger = ledger.filter((l) => l.value > 0);

  return (
    <section className="overflow-hidden rounded-sm bg-primary text-primary-foreground">
      {/* ── Brief ── */}
      <div className="border-b border-primary-foreground/15 p-5 md:p-6">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary-foreground/60">
            <span>{dateLine}</span>
            <span aria-hidden="true" className="text-primary-foreground/30">/</span>
            <span className="text-[hsl(var(--brand-accent))]">{roleLabel}</span>
            {/* The contributor scope notice was a full-width tinted alert box of
                its own. It is one word here, in the line that already says who
                you are. */}
            {isContributor && (
              <span className="rounded-sm border border-primary-foreground/25 px-1.5 py-0.5 text-[10px] tracking-[0.08em] text-primary-foreground/70">
                Your stories only
              </span>
            )}
          </p>
          <div className="flex flex-shrink-0 items-center gap-2">
            <BandButton onClick={onAskAgent} title="Ask the Stablehand about your desk">
              <Wand2 size={12} /> Ask the Stablehand
            </BandButton>
            <BandButton onClick={onRefreshBrief} disabled={briefLoading} title="Regenerate the brief">
              <RefreshCw size={12} className={briefLoading ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Refresh</span>
            </BandButton>
          </div>
        </div>

        <h2 className="font-display text-2xl font-bold leading-tight text-primary-foreground md:text-[28px]">
          {greeting(now.getHours())}, {firstName}
        </h2>

        {/* Gold rule — the editorial device that separates a masthead from its
            standfirst. Gold is doing what gold is for. */}
        <span aria-hidden="true" className="mt-3 mb-3 block h-px w-10 bg-[hsl(var(--brand-accent))]" />

        <p className="flex items-start gap-2 text-sm leading-relaxed text-primary-foreground/85 md:max-w-3xl">
          <Sparkles size={14} className="mt-0.5 flex-shrink-0 text-[hsl(var(--brand-accent))]" />
          <span>
            {briefLoading && !brief
              ? <span className="italic text-primary-foreground/60">Writing your brief…</span>
              : brief ?? (
                <>
                  Your desk is set up and the numbers below are live.{' '}
                  <span className="text-primary-foreground/55">
                    The written brief is offline — set OPENROUTER_API_KEY to switch it on.
                  </span>
                </>
              )}
          </span>
        </p>
      </div>

      {/* ── Figures. gap-px over a tinted background draws hairlines that stay
             correct at 2, 3 or 4 columns; `divide-x` puts a rule down the left of
             the first cell in every wrapped row. ── */}
      <div className="grid grid-cols-2 gap-px bg-primary-foreground/15 sm:grid-cols-4">
        {figures.map((f) => (
          <div key={f.label} className="bg-primary px-5 py-4">
            <span
              className={cn(
                'block font-display text-3xl font-bold leading-none tabular-nums',
                f.value > 0 ? 'text-[hsl(var(--brand-accent))]' : 'text-primary-foreground/35',
              )}
            >
              {f.value}
            </span>
            <span className="mt-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-primary-foreground/70">
              {f.label}
            </span>
            {f.hint && (
              <span className="mt-0.5 block text-[11px] text-primary-foreground/50">{f.hint}</span>
            )}
          </div>
        ))}
      </div>

      {/* ── Register ledger. This is where the six "snapshot" stat cards went:
             one line of figures, each a real link to the register that holds
             them, and each dropped entirely when the role has no such screen.
             Zeros are omitted rather than printed. ── */}
      {visibleLedger.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-primary-foreground/15 px-5 py-3">
          {visibleLedger.map((l) => {
            const body = (
              <>
                <span className="font-semibold tabular-nums text-primary-foreground">{l.value}</span>{' '}
                <span className="text-primary-foreground/70">{l.label}</span>
              </>
            );
            return l.to ? (
              <Link
                key={l.label}
                to={l.to}
                className="text-[12.5px] transition-colors hover:text-[hsl(var(--brand-accent))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/60"
              >
                {body}
              </Link>
            ) : (
              <span key={l.label} className="text-[12.5px]">{body}</span>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ── Shared card chrome ──────────────────────────────────────────────────── */

function Panel({
  title, badge, aside, children,
}: {
  title: string;
  badge?: number;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-sm border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
        <h3 className="font-display text-[15px] font-bold text-foreground">{title}</h3>
        {badge !== undefined && badge > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-accent px-1.5 text-[12px] font-bold tabular-nums text-brand-accent-foreground">
            {badge}
          </span>
        )}
        {aside && <div className="ml-auto flex items-center gap-2">{aside}</div>}
      </header>
      {children}
    </section>
  );
}

/** A quiet secondary link, for the "→ open the full screen" affordance. */
function PanelLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
    >
      {children}
      <ArrowRight size={12} />
    </Link>
  );
}

/* ── 2. Needs your attention ─────────────────────────────────────────────── */

export interface AttentionRow {
  id: string;
  label: string;
  count: number;
  /** Already resolved — unreachable items are filtered out before we get here. */
  to: string;
}

export function AttentionPanel({
  rows, loading, error, onRetry,
}: {
  rows: AttentionRow[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  return (
    <Panel title="Needs your attention" badge={error || loading ? undefined : rows.length}>
      {loading ? (
        <p className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
          <RefreshCw size={14} className="animate-spin" /> Checking what’s waiting on you…
        </p>
      ) : error ? (
        // An unreachable queue is not the same as an empty one, and the old
        // dashboard's error state replaced the ENTIRE screen with one red strip.
        // Only this panel actually depends on the summary, so only this panel
        // reports the failure.
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-5 text-sm">
          {/* Nothing loaded, so say nothing loaded — not "you're all clear". */}
          <span className="text-muted-foreground">
            Couldn’t load your queues, so this list is empty rather than clear.
          </span>
          <button
            onClick={onRetry}
            className="rounded-sm border border-edge px-2.5 py-1 text-[12px] font-medium text-foreground transition-colors hover:bg-muted"
          >
            Try again
          </button>
        </div>
      ) : rows.length === 0 ? (
        <p className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
          <CheckCircle2 size={15} className="text-success" />
          Nothing is waiting on you right now.
        </p>
      ) : (
        <ul className="divide-y divide-border/50">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                to={row.to}
                className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:bg-muted/60"
              >
                <span className="flex h-7 min-w-7 items-center justify-center rounded-sm bg-brand-accent/15 px-1.5 text-sm font-bold tabular-nums text-brand-accent-ink">
                  {row.count}
                </span>
                <span className="flex-1 text-sm text-foreground">{row.label}</span>
                <ArrowRight
                  size={15}
                  className="flex-shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ── 3. Pipeline ─────────────────────────────────────────────────────────── */

export function PipelinePanel({
  stages, counts, boardPath, onOpenStage,
}: {
  stages: StageMeta[];
  counts: Record<string, number>;
  /** Null when this role has no Workflow Board — then the segments don't link. */
  boardPath: string | null;
  onOpenStage: (stage: StageMeta) => void;
}) {
  const total = stages.reduce((n, s) => n + (counts[s.status] ?? 0), 0);

  return (
    <Panel
      title="Story pipeline"
      aside={boardPath ? <PanelLink to={boardPath}>Open the board</PanelLink> : undefined}
    >
      {/* Proportional bar. Where each stage's colour comes from is the same table
          the board columns and the status badges use, so a colour means the same
          thing on every screen. */}
      <div className="flex h-1.5 w-full bg-muted" aria-hidden="true">
        {total > 0 &&
          stages.map((s) => {
            const n = counts[s.status] ?? 0;
            if (n === 0) return null;
            return (
              <span
                key={s.status}
                style={{ width: `${(n / total) * 100}%`, background: s.accent }}
              />
            );
          })}
      </div>

      <div
        className={cn(
          'grid gap-px bg-border/60',
          stages.length >= 5 ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5' : 'grid-cols-2 sm:grid-cols-4',
        )}
      >
        {stages.map((s) => {
          const n = counts[s.status] ?? 0;
          const content = (
            <>
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                  style={{ background: s.accent }}
                />
                <span className="truncate">{s.label}</span>
              </span>
              <span
                className={cn(
                  'mt-1.5 block font-display text-2xl font-bold leading-none tabular-nums',
                  n > 0 ? 'text-foreground' : 'text-muted-foreground/40',
                )}
              >
                {n}
              </span>
              <span className="mt-1 block truncate text-[11px] text-muted-foreground/70">
                {s.sublabel}
              </span>
            </>
          );

          return boardPath ? (
            <button
              key={s.status}
              onClick={() => onOpenStage(s)}
              className="bg-card px-4 py-3.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:bg-muted/60"
            >
              {content}
            </button>
          ) : (
            <div key={s.status} className="bg-card px-4 py-3.5">{content}</div>
          );
        })}
      </div>
    </Panel>
  );
}

/* ── 4. Start something ──────────────────────────────────────────────────── */

export interface StartTile {
  key: string;
  icon: ReactNode;
  title: string;
  meta: string;
  badge?: string;
  to: string;
}

export function StartRow({ tiles }: { tiles: StartTile[] }) {
  if (tiles.length === 0) return null;
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <h3 className="font-display text-[15px] font-bold text-foreground">Start something</h3>
        <span aria-hidden="true" className="h-px flex-1 bg-border/60" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Link
            key={t.key}
            to={t.to}
            className={cn(
              'group flex items-start gap-3 rounded-sm border border-border bg-card p-4 transition-colors',
              'hover:border-primary/40 hover:bg-muted/50',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            )}
          >
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              {t.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-semibold text-foreground">{t.title}</span>
                {t.badge && (
                  <span className="rounded-sm bg-brand-accent px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-brand-accent-foreground">
                    {t.badge}
                  </span>
                )}
              </span>
              <span className="mt-1 block text-[12.5px] leading-snug text-muted-foreground">
                {t.meta}
              </span>
            </span>
            <ArrowRight
              size={15}
              className="mt-1 flex-shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
            />
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ── 5. Recent stories ───────────────────────────────────────────────────── */

export function RecentStoriesPanel({
  title, articles, allStoriesPath, canEdit, onEdit,
}: {
  title: string;
  articles: Article[];
  allStoriesPath: string | null;
  canEdit: (article: Article) => boolean;
  onEdit: (article: Article) => void;
}) {
  return (
    <Panel
      title={title}
      aside={allStoriesPath ? <PanelLink to={allStoriesPath}>All stories</PanelLink> : undefined}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[440px] text-sm">
          <thead>
            <tr className="border-b border-border/50 bg-muted/50">
              {['Story', 'Author', 'Category', 'Stage'].map((h) => (
                <th
                  key={h}
                  className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {articles.map((article) => {
              const editable = canEdit(article);
              return (
                <tr
                  key={article.id}
                  onClick={() => editable && onEdit(article)}
                  className={cn(
                    'border-b border-border/30 transition-colors last:border-b-0',
                    editable ? 'cursor-pointer hover:bg-muted/50' : 'opacity-65',
                  )}
                >
                  <td className="max-w-[320px] px-4 py-2.5">
                    <span className="line-clamp-1 font-medium text-foreground">{article.title}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{article.author}</td>
                  <td className="px-4 py-2.5">
                    <span className="whitespace-nowrap rounded-sm border border-border/60 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      {article.category ?? 'General'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={article.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
