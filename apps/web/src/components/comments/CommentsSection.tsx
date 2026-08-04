/**
 * The comment section. ONE component, three surfaces (stories, blog posts,
 * bulletin editions).
 *
 * The sibling of `ReactionBar`, and it sits directly under one on every page that
 * carries it. That is the whole design: the bar asks *how did this sit with you*
 * in one tap, and this asks *why* — on the same seven-point scale, writing to the
 * same reaction row. There is one opinion per reader per piece and it appears in
 * both places, never as two answers that can disagree.
 *
 * ── WHAT THIS COMPONENT WILL NOT DO ──
 *
 * No seeded counts, no "join 400 readers", no fabricated activity. An empty thread
 * says it is empty. `docs/FAKE-DATA-REMOVED.md` records the sweep that pulled
 * invented follower counts and subscriber stats out of this app, and a plausible
 * number is a lie somebody eventually decides on.
 *
 * ── THE PAGE MUST NOT OFFER WHAT THE SERVER WILL REFUSE ──
 *
 * Commentable = reactable = readable, and the server re-derives that from the
 * target's own record. So each page renders this only when the thing is LIVE and
 * unlocked, exactly as it does for the reaction bar — the same rule, in the same
 * place, for the same reason (docs/REACTIONS-PLAN.md §7). The section does not
 * re-check it; the page owns that decision because only the page has the record.
 */
import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Loader2, MessageSquare } from 'lucide-react';

import { loginUrlFor } from '@/lib/safeRedirect';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import {
  emptyThread,
  threadKey,
  useCommentStore,
  type CommentTargetType,
} from '@/stores/commentStore';
import { emptyCounts, reactionKey, useReactionStore } from '@/stores/reactionStore';
import type { EmojiKey } from '@/types/reactions';

import { CommentComposer } from './CommentComposer';
import { CommentRow } from './CommentRow';

/** Hairline rules either side of a centred label. Matches `ReactionBar`. */
function Hairlines({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center gap-3">
      <span className="h-px w-12 bg-border sm:w-16" aria-hidden="true" />
      {children}
      <span className="h-px w-12 bg-border sm:w-16" aria-hidden="true" />
    </div>
  );
}

export interface CommentsSectionProps {
  targetType: CommentTargetType;
  targetId: string;
  /** Unique per section on the page — see the `aria-labelledby` note in ReactionBar. */
  idPrefix?: string;
  heading?: string;
  /** What the thread is about, for the empty state. "story" / "post" / "edition". */
  noun?: string;
  className?: string;
}

export function CommentsSection({
  targetType,
  targetId,
  idPrefix = 'comments',
  heading = 'The conversation',
  noun = 'piece',
  className,
}: CommentsSectionProps) {
  const key = threadKey(targetType, targetId);
  const thread = useCommentStore((s) => s.byKey[key]) ?? emptyThread();
  const error = useCommentStore((s) => s.errors[key]) ?? null;
  const posting = useCommentStore((s) => s.posting[key]) ?? false;
  const busyId = useCommentStore((s) => s.busyId[key]) ?? null;
  const load = useCommentStore((s) => s.load);
  const loadMore = useCommentStore((s) => s.loadMore);
  const post = useCommentStore((s) => s.post);
  const edit = useCommentStore((s) => s.edit);
  const remove = useCommentStore((s) => s.remove);
  const report = useCommentStore((s) => s.report);

  /**
   * The reader's own reaction, which pre-selects the composer's scale.
   *
   * Read from the REACTION store rather than kept here: the bar above owns that
   * value, and a second copy would be a second answer. `reactionKey` and
   * `threadKey` are the same shape by coincidence of design — both key on
   * `type:id` — but they address different stores, so both are used explicitly.
   */
  const myReaction =
    (useReactionStore((s) => s.byKey[reactionKey(targetType, targetId)]) ??
      emptyCounts(targetType, targetId)).mine;

  const currentUser = useAuthStore((s) => s.currentUser);
  const signedIn = Boolean(currentUser);
  const navigate = useNavigate();
  const location = useLocation();
  const headingId = `${idPrefix}-heading`;

  /**
   * Load the thread, and RELOAD it when the signed-in account changes — `mine` and
   * `reportedByMe` belong to the account rather than the browser, so a thread
   * fetched while signed out shows no Edit or Delete on comments that are yours.
   */
  useEffect(() => {
    if (targetId) void load(targetType, targetId);
  }, [targetType, targetId, currentUser?.id, load]);

  const signInHref = loginUrlFor(location.pathname, location.search, location.hash);

  return (
    <section className={cn('mt-12 border-t border-border/50 pt-10', className)} aria-labelledby={headingId}>
      <header className="text-center">
        <Hairlines>
          <p
            className="shrink-0 text-[11px] font-bold uppercase tracking-[0.14em]"
            // --brand-accent-ink is the gold darkened for TEXT; the raw accent is a
            // 2.06:1 fill colour and fails as type (docs/THEME-REVIEW.md).
            style={{ color: 'hsl(var(--brand-accent-ink))' }}
          >
            Comments
          </p>
        </Hairlines>

        <h2
          id={headingId}
          className="mx-auto mt-5 max-w-2xl font-[family-name:var(--font-display)] text-2xl font-bold leading-tight text-foreground md:text-3xl"
        >
          {heading}
        </h2>

        {/* The count is the real one, and 0 is shown as 0. Loading says loading
            rather than showing a zero it is about to replace — a number that
            changes under the reader is worse than a moment without one. */}
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
          {thread.loading && !thread.items.length ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Loading the conversation
            </span>
          ) : thread.total === 1 ? (
            'One reader has said their piece. Add yours.'
          ) : thread.total > 0 ? (
            `${thread.total.toLocaleString()} readers have said their piece.`
          ) : (
            'Nobody has commented yet.'
          )}
        </p>
      </header>

      {/* ── The composer, or the reason there isn't one ── */}
      <div className="mx-auto mt-8 max-w-3xl">
        {signedIn ? (
          <CommentComposer
            idPrefix={`${idPrefix}-new`}
            initialEmoji={myReaction}
            busy={posting}
            submitLabel="Post comment"
            busyLabel="Posting…"
            scaleNote={
              myReaction
                ? 'This is the reaction you already gave — changing it here changes it there too.'
                : 'This also records your reaction on the scale above.'
            }
            error={error}
            onSubmit={(body, emoji: EmojiKey) => {
              void post(targetType, targetId, body, emoji);
            }}
          />
        ) : (
          /* A signed-out reader gets an invitation with their place kept, not a
             disabled textarea. `loginUrlFor` builds the `?next=` the login page
             already honours, so the piece you were reading is the piece you come
             back to — the same courtesy the reaction bar extends. */
          <div className="rounded-sm border border-border/60 bg-card px-5 py-6 text-center">
            <MessageSquare size={20} className="mx-auto text-muted-foreground/60" aria-hidden="true" />
            <p className="mt-3 text-sm leading-relaxed text-foreground/90">
              <Link
                to={signInHref}
                className="font-semibold text-primary underline underline-offset-2 hover:opacity-80"
              >
                Sign in
              </Link>{' '}
              to join the conversation.
            </p>
            <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-relaxed text-muted-foreground">
              Comments are signed with your name, and each one carries where you stand on the seven-point scale — so
              a thread reads as a set of positions rather than a shouting match.
            </p>
            <button
              type="button"
              onClick={() => navigate(signInHref)}
              className="mt-4 rounded-sm bg-primary px-4 py-2 text-[12.5px] font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Sign in to comment
            </button>
          </div>
        )}
      </div>

      {/* ── The thread ── */}
      <div className="mx-auto mt-8 max-w-3xl">
        {thread.loadError ? (
          <div className="rounded-sm border border-border/60 bg-muted/20 px-4 py-5 text-center">
            <p className="text-[13px] text-muted-foreground">
              {thread.loadError}{' '}
              <button
                type="button"
                onClick={() => void load(targetType, targetId)}
                className="font-semibold text-primary underline underline-offset-2 hover:opacity-80"
              >
                Try again
              </button>
            </p>
          </div>
        ) : thread.items.length === 0 && !thread.loading ? (
          <p className="border-t border-border/50 pt-6 text-center text-[13px] leading-relaxed text-muted-foreground">
            No comments on this {noun} yet.{' '}
            {signedIn ? 'Be the first to say why.' : 'Sign in above to be the first.'}
          </p>
        ) : (
          <>
            <ul className="divide-y divide-border/50 border-t border-border/50">
              {thread.items.map((comment) => (
                <CommentRow
                  key={comment.id}
                  comment={comment}
                  signedIn={signedIn}
                  busy={busyId === comment.id}
                  error={busyId === comment.id ? error : null}
                  onEdit={(id, body, emoji) => edit(targetType, targetId, id, body, emoji)}
                  onDelete={(id) => void remove(targetType, targetId, id)}
                  onReport={(id) => void report(targetType, targetId, id)}
                />
              ))}
            </ul>

            {/* A button, not infinite scroll. A thread that grows as you scroll
                takes the page footer away from anyone trying to reach it, and on a
                long piece the reader is already several screens from where they
                started. */}
            {thread.nextCursor && (
              <div className="mt-6 text-center">
                <button
                  type="button"
                  disabled={thread.loadingMore}
                  onClick={() => void loadMore(targetType, targetId)}
                  className="inline-flex items-center gap-2 rounded-sm border border-border/60 bg-card px-4 py-2 text-[12.5px] font-semibold text-foreground hover:bg-muted/30 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {thread.loadingMore && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}
                  {thread.loadingMore ? 'Loading…' : `Show more (${thread.total - thread.items.length} left)`}
                </button>
              </div>
            )}
          </>
        )}

        {/* A write error that is not about one particular row — a failed post,
            usually — belongs here, once, under the thread it concerns. The
            composer shows its own copy; this one catches the delete and report
            failures whose row has already gone or is no longer busy. */}
        <div aria-live="polite" className="mt-4 text-center">
          {error && !posting && !busyId && <p className="text-[12.5px] text-destructive">{error}</p>}
        </div>
      </div>
    </section>
  );
}
