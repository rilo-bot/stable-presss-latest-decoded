/**
 * Comment moderation — /production-system/comments
 *
 * The desk where reported comments get answered. Three lists behind one filter:
 *
 *   Reported — visible comments a reader objected to, most-reported first. This is
 *              the working list and the screen opens on it.
 *   Removed  — what has already been hidden, so a decision can be reversed.
 *   Everything — the whole feed, newest first, for looking something up.
 *
 * ── THE THREE THINGS THIS SCREEN CAN DO, AND WHY THEY DIFFER ──
 *
 *   Remove  hides the comment and leaves a tombstone in the thread ("a comment by
 *           X was removed by an editor"). The conversation around it still parses.
 *           Reversible from the Removed list.
 *   Restore puts it back and clears the reason it was removed for.
 *   Delete  takes it out of the thread entirely. Stronger, offered separately, and
 *           two taps — it is somebody's words and there is no Restore for it.
 *
 * Removing needs a REASON, and the reason is for this screen and the audit trail
 * only. The public tombstone says an editor removed it and nothing more:
 * publishing the reason would make every removal an argument inside the thread it
 * was removed from.
 *
 * ── WHAT IT WILL NOT DO ──
 *
 * No auto-hide at N reports. A threshold that removes a comment on its own is a
 * brigade's delete button, and the count on each row is a count of PEOPLE (one
 * report per reader, enforced by a unique index) precisely so a person can weigh
 * it. Reporting asks for a decision; it does not make one.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EyeOff, Eye, Loader2, MessageSquare, Trash2 } from 'lucide-react';

import { authFetch, authFetchRetry } from '@/lib/api';
import { cn } from '@/lib/utils';
import { relativeTime } from '@/stores/commentStore';
import { EMOJI_SCALE, SIDE_LABEL, STEP_FILL, sideOf, type EmojiKey } from '@/types/reactions';

type Filter = 'reported' | 'hidden' | 'all';

interface QueueRow {
  id: string;
  body: string;
  emoji: EmojiKey;
  authorName: string;
  isStaff: boolean;
  createdAt: string;
  editedAt?: string;
  hidden: boolean;
  reportCount: number;
  hiddenReason?: string;
  targetType: string;
  targetTitle: string;
  targetHref: string;
}

interface Queue {
  items: QueueRow[];
  reportedCount: number;
  hiddenCount: number;
  truncated: number;
}

const EMPTY: Queue = { items: [], reportedCount: 0, hiddenCount: 0, truncated: 0 };

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'reported', label: 'Reported' },
  { id: 'hidden', label: 'Removed' },
  { id: 'all', label: 'Everything' },
];

const TYPE_LABEL: Record<string, string> = { story: 'Story', blog: 'Blog post', bulletin: 'Edition' };

export default function CommentModerationScreen() {
  const [filter, setFilter] = useState<Filter>('reported');
  const [queue, setQueue] = useState<Queue>(EMPTY);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  /** The row a write is in flight for, so one row spins rather than the page. */
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (next: Filter) => {
    setState('loading');
    try {
      const res = await authFetchRetry(`/api/comments/moderation?filter=${next}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Partial<Queue>;
      setQueue({ ...EMPTY, ...data, items: Array.isArray(data.items) ? data.items : [] });
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    void reload(filter);
  }, [filter, reload]);

  /**
   * One writer for all three actions. Each reloads the queue afterwards rather
   * than patching the row in place: hiding something moves it OUT of the Reported
   * list and INTO Removed, and the two header counts change with it — a local
   * patch would leave a row sitting in a list it no longer belongs to.
   */
  const act = async (row: QueueRow, action: 'hide' | 'restore' | 'delete', reason?: string) => {
    setBusyId(row.id);
    setError(null);
    try {
      const res =
        action === 'delete'
          ? await authFetch(`/api/comments/${row.id}`, { method: 'DELETE' })
          : await authFetch(`/api/comments/${row.id}/${action}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(action === 'hide' ? { reason } : {}),
            });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: unknown };
        setError(typeof body.error === 'string' ? body.error : 'That did not go through.');
        return;
      }
      await reload(filter);
    } catch {
      setError('Could not reach the server. Try again in a moment.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6 pb-4">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <h1 className="font-[family-name:var(--font-display)] text-[19px] font-bold leading-tight text-foreground">
            Comments
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
            Reader comments on stories, blog posts and editions. Each one carries where its author stands on the
            seven-point scale — the same scale as the reaction bar, so a thread reads as a set of positions.
          </p>
        </div>
        {state === 'loading' && (
          <span className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
            <Loader2 size={13} className="animate-spin" /> Loading
          </span>
        )}
      </div>

      {/* ── Filter, with the counts on the tabs that carry them ──
          The number belongs ON the tab: "Reported 3" is the reason to open this
          screen, and putting it in a stat tile above would make the tab a control
          you press to find out whether there was anything to do. */}
      <div role="tablist" aria-label="Which comments" className="flex flex-wrap gap-1 border-b border-border/60">
        {FILTERS.map((f) => {
          const count = f.id === 'reported' ? queue.reportedCount : f.id === 'hidden' ? queue.hiddenCount : null;
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => setFilter(f.id)}
              className={cn(
                '-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-[12.5px] font-semibold transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {f.label}
              {count !== null && count > 0 && (
                <span
                  className={cn(
                    'rounded-[3px] px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
                    f.id === 'reported' ? 'bg-destructive/15 text-destructive' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="rounded-sm border border-destructive/40 bg-destructive/5 px-4 py-2.5 text-[12.5px] text-destructive">
          {error}
        </p>
      )}

      {/* ── The list ── */}
      {state === 'error' ? (
        <div className="rounded-sm border border-border/60 bg-card px-4 py-8 text-center">
          <p className="text-[13px] text-muted-foreground">
            That queue did not load.{' '}
            <button
              type="button"
              onClick={() => void reload(filter)}
              className="font-semibold text-primary underline underline-offset-2 hover:opacity-80"
            >
              Try again
            </button>
          </p>
        </div>
      ) : queue.items.length === 0 && state === 'ready' ? (
        <div className="rounded-sm border border-border/60 bg-card px-4 py-10 text-center">
          <MessageSquare size={22} className="mx-auto text-muted-foreground/50" aria-hidden="true" />
          <p className="mt-3 text-[13px] font-semibold text-foreground">
            {filter === 'reported'
              ? 'Nothing has been reported.'
              : filter === 'hidden'
                ? 'Nothing has been removed.'
                : 'No comments yet.'}
          </p>
          <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-muted-foreground">
            {filter === 'reported'
              ? 'Readers can flag a comment for an editor from the thread itself. Flagged comments stay visible until someone here decides otherwise — nothing is hidden automatically.'
              : filter === 'hidden'
                ? 'Removed comments appear here so a decision can be reversed.'
                : 'Comments left on stories, blog posts and editions will appear here.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {queue.items.map((row) => (
            <QueueCard
              key={row.id}
              row={row}
              busy={busyId === row.id}
              onHide={(reason) => void act(row, 'hide', reason)}
              onRestore={() => void act(row, 'restore')}
              onDelete={() => void act(row, 'delete')}
            />
          ))}
        </ul>
      )}

      {queue.truncated > 0 && (
        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          <strong className="font-semibold text-foreground">Not everything is shown:</strong> this list is capped, and
          there are more comments than one page of it carries. Narrow the filter to work through them.
        </p>
      )}

      <p className="border-t border-border/50 pt-4 text-[11.5px] leading-relaxed text-muted-foreground">
        A report count is a count of <strong className="font-semibold text-foreground">people</strong> — one report per
        reader per comment, enforced in the database. Nothing is ever hidden automatically, at any number of reports:
        removing a comment is a decision somebody here makes, and it leaves a note in the thread saying an editor made
        it. The reason you give is recorded for this screen and is never shown to readers.
      </p>
    </div>
  );
}

function QueueCard({
  row,
  busy,
  onHide,
  onRestore,
  onDelete,
}: {
  row: QueueRow;
  busy: boolean;
  onHide: (reason: string) => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  /** 'hiding' opens the reason field; 'deleting' is the two-tap confirm. */
  const [mode, setMode] = useState<'idle' | 'hiding' | 'deleting'>('idle');
  const [reason, setReason] = useState('');

  const step = EMOJI_SCALE.find((s) => s.key === row.emoji);
  const side = sideOf(row.emoji);
  const fill = STEP_FILL[row.emoji];

  return (
    <li
      className={cn(
        'rounded-sm border bg-card p-4 transition-opacity',
        busy && 'opacity-50',
        row.hidden ? 'border-border/40 bg-muted/20' : 'border-border/60',
      )}
    >
      {/* ── What it is on, and how it landed ── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px]">
        <span className="font-bold uppercase tracking-[0.1em] text-muted-foreground">
          {TYPE_LABEL[row.targetType] ?? row.targetType}
        </span>
        {row.targetHref ? (
          <Link
            to={row.targetHref}
            className="min-w-0 max-w-[26rem] truncate font-semibold text-foreground underline-offset-2 hover:underline"
            title={row.targetTitle}
          >
            {row.targetTitle}
          </Link>
        ) : (
          // Listed rather than dropped — unlike the analytics leaderboard, which
          // drops targets it cannot resolve. A leaderboard row nobody can click is
          // noise; a reported comment nobody can action is a report that never
          // gets answered.
          <span className="italic text-muted-foreground">{row.targetTitle}</span>
        )}

        <span
          className="ml-auto inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5"
          style={{
            borderColor: `color-mix(in oklab, ${fill} 35%, transparent)`,
            background: `color-mix(in oklab, ${fill} 8%, transparent)`,
          }}
          title={step ? `${step.label} — filed as ${SIDE_LABEL[side]}` : SIDE_LABEL[side]}
        >
          <span aria-hidden="true" className="text-[13px] leading-none">{step?.emoji}</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-foreground/80">
            {SIDE_LABEL[side]}
          </span>
          <span className="sr-only">— {step?.label}</span>
        </span>
      </div>

      {/* ── The comment ── */}
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12px]">
        <span className="font-semibold text-foreground">{row.authorName}</span>
        {row.isStaff && (
          <span className="rounded-[3px] bg-primary/10 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-primary">
            Staff
          </span>
        )}
        <span className="text-muted-foreground" title={new Date(row.createdAt).toLocaleString()}>
          {relativeTime(row.createdAt)}
        </span>
        {row.editedAt && <span className="text-muted-foreground/70">· edited</span>}
        {row.reportCount > 0 && (
          <span className="font-semibold text-destructive">
            · {row.reportCount} {row.reportCount === 1 ? 'reader reported this' : 'readers reported this'}
          </span>
        )}
      </div>

      <p className="mt-2 whitespace-pre-line break-words rounded-sm bg-muted/30 px-3 py-2.5 text-[13px] leading-relaxed text-foreground/90">
        {row.body}
      </p>

      {row.hidden && (
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
          <EyeOff size={11} className="mr-1 inline align-[-1px]" aria-hidden="true" />
          <strong className="font-semibold text-foreground">Removed.</strong> Readers see a note saying an editor
          removed it, and nothing else.
          {row.hiddenReason && <> Reason recorded: “{row.hiddenReason}”</>}
        </p>
      )}

      {/* ── Actions ── */}
      {mode === 'hiding' ? (
        <div className="mt-3 rounded-sm border border-border/60 bg-background p-3">
          <label htmlFor={`reason-${row.id}`} className="block text-[11px] font-bold uppercase tracking-[0.1em] text-foreground/80">
            Why is it being removed?
          </label>
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            Recorded here, never shown to readers. Required — a removal with no stated reason is one nobody can review.
          </p>
          <input
            id={`reason-${row.id}`}
            value={reason}
            autoFocus
            maxLength={300}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Abusive, off-topic, spam…"
            className="mt-2 w-full rounded-sm border border-border/60 bg-background px-3 py-2 text-[12.5px] text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              disabled={!reason.trim() || busy}
              onClick={() => {
                onHide(reason.trim());
                setMode('idle');
                setReason('');
              }}
              className="rounded-sm bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Remove it
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('idle');
                setReason('');
              }}
              className="px-2 py-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : mode === 'deleting' ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-sm border border-destructive/40 bg-destructive/5 px-3 py-2.5">
          <p className="text-[12px] leading-relaxed text-foreground">
            <strong className="font-semibold">Delete it entirely?</strong> Unlike removing, this leaves no note in the
            thread and there is no way to put it back from this screen.
          </p>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setMode('idle');
                onDelete();
              }}
              className="rounded-sm bg-destructive px-3 py-1.5 text-[12px] font-semibold text-destructive-foreground hover:opacity-90 disabled:opacity-50"
            >
              Yes, delete
            </button>
            <button
              type="button"
              onClick={() => setMode('idle')}
              className="px-2 py-1.5 text-[12px] font-semibold text-muted-foreground hover:text-foreground"
            >
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {row.hidden ? (
            <button
              type="button"
              disabled={busy}
              onClick={onRestore}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border/60 px-3 py-1.5 text-[12px] font-semibold text-foreground hover:bg-muted/40 disabled:opacity-50"
            >
              <Eye size={13} aria-hidden="true" /> Restore
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => setMode('hiding')}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border/60 px-3 py-1.5 text-[12px] font-semibold text-foreground hover:bg-muted/40 disabled:opacity-50"
            >
              <EyeOff size={13} aria-hidden="true" /> Remove
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => setMode('deleting')}
            className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[12px] font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            <Trash2 size={13} aria-hidden="true" /> Delete
          </button>
          {busy && <Loader2 size={13} className="animate-spin text-muted-foreground" aria-hidden="true" />}
        </div>
      )}
    </li>
  );
}
