/**
 * One comment in a thread.
 *
 * Three states, and the middle one is the point:
 *
 *   • Normal — a monogram, a name, when, the sentiment chip, the words, and the
 *     controls the reader is actually entitled to.
 *   • Editing — the same composer that posted it, in place.
 *   • Hidden — a TOMBSTONE. An editor removed the words; the row stays. A comment
 *     that simply vanishes makes a thread other people were reading change shape
 *     with no explanation, and reads as a bug to them and as a disappearance to
 *     the person who wrote it. The tombstone keeps the conversation parseable and
 *     is honest about what happened.
 *
 * The sentiment chip is the only place the derived category appears next to a
 * comment, and it carries the emoji, the step's own label and the category word
 * together — never the colour alone, which would put the whole feature behind
 * colour vision.
 */
import { useState } from 'react';

import { cn } from '@/lib/utils';
import { relativeTime, withinEditWindow, type Comment } from '@/stores/commentStore';
import { EMOJI_SCALE, SIDE_LABEL, STEP_FILL, sideOf, type EmojiKey } from '@/types/reactions';

import { CommentComposer } from './CommentComposer';

export interface CommentRowProps {
  comment: Comment;
  /** Signed in at all — what separates "Report" from no control at all. */
  signedIn: boolean;
  /** This row has a write in flight. */
  busy: boolean;
  /** The thread's write error, shown inside the edit form when editing. */
  error: string | null;
  onEdit: (id: string, body: string, emoji: EmojiKey) => Promise<boolean>;
  onDelete: (id: string) => void;
  onReport: (id: string) => void;
}

/**
 * Initials for the monogram. Two at most.
 *
 * There is no avatar field anywhere on a user in this platform, so a monogram is
 * the honest option — an <img> with a placeholder service behind it would be a
 * fabricated identity, and a generic silhouette on every row is visual noise that
 * says nothing.
 */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

export function CommentRow({ comment, signedIn, busy, error, onEdit, onDelete, onReport }: CommentRowProps) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const step = EMOJI_SCALE.find((s) => s.key === comment.emoji);
  const side = sideOf(comment.emoji);
  const fill = STEP_FILL[comment.emoji];
  const when = relativeTime(comment.createdAt);
  const exact = comment.createdAt ? new Date(comment.createdAt).toLocaleString() : '';

  if (comment.hidden) {
    return (
      <li className="py-5">
        <p className="text-[12.5px] italic leading-relaxed text-muted-foreground">
          A comment by <span className="font-semibold not-italic text-foreground/70">{comment.authorName}</span> was
          removed by an editor.
        </p>
      </li>
    );
  }

  if (editing) {
    return (
      <li className="py-5">
        <CommentComposer
          idPrefix={`comment-${comment.id}-edit`}
          initialEmoji={comment.emoji}
          initialBody={comment.body}
          busy={busy}
          submitLabel="Save changes"
          busyLabel="Saving…"
          scaleNote="Changing it here changes your reaction too."
          error={error}
          autoFocus
          onCancel={() => setEditing(false)}
          onSubmit={(body, emoji) => {
            void onEdit(comment.id, body, emoji).then((ok) => {
              if (ok) setEditing(false);
            });
          }}
        />
      </li>
    );
  }

  // Edit is offered ONLY inside the window the server also enforces. An "Edit"
  // button that answers "the edit window has closed" is a control that lies about
  // what it does, which is the same defect the reaction bar had on draft pages.
  const canEdit = comment.mine && withinEditWindow(comment);

  return (
    <li className={cn('py-5 transition-opacity', busy && 'opacity-50')}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold tracking-wide text-foreground/70"
        >
          {initialsOf(comment.authorName)}
        </span>

        <div className="min-w-0 flex-1">
          {/* ── Byline ── */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[13px] font-semibold text-foreground">{comment.authorName}</span>
            {comment.mine && (
              <span className="rounded-[3px] bg-muted px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                You
              </span>
            )}
            <span className="text-[11.5px] text-muted-foreground" title={exact}>
              {when}
            </span>
            {comment.editedAt && (
              <span className="text-[11.5px] text-muted-foreground/70" title={new Date(comment.editedAt).toLocaleString()}>
                · edited
              </span>
            )}

            {/* The derived category. Emoji + step label + category word, so it
                reads without colour and reads the same as the scale above. */}
            <span
              className="ml-auto inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5"
              style={{
                borderColor: `color-mix(in oklab, ${fill} 35%, transparent)`,
                background: `color-mix(in oklab, ${fill} 8%, transparent)`,
              }}
              title={step ? `${step.label} — filed as ${SIDE_LABEL[side]}` : SIDE_LABEL[side]}
            >
              <span aria-hidden="true" className="text-[13px] leading-none">
                {step?.emoji}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-foreground/80">
                {SIDE_LABEL[side]}
              </span>
              <span className="sr-only">— {step?.label}</span>
            </span>
          </div>

          {/* ── The words ──
              `whitespace-pre-line` so the paragraph breaks the reader typed
              survive. The body is rendered as TEXT, never as markup: React
              escapes it, which is what keeps a comment field from being an
              injection point on a public page. */}
          <p className="mt-2 whitespace-pre-line break-words text-[14px] leading-relaxed text-foreground/90">
            {comment.body}
          </p>

          {/* ── Controls — only what this reader may actually do ── */}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px]">
            {canEdit && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditing(true)}
                className="font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
              >
                Edit
              </button>
            )}

            {comment.mine &&
              (confirmingDelete ? (
                // A comment is somebody's words and deleting is not undoable from
                // the UI, so it takes two taps. Inline rather than a modal: a
                // dialog for one row of text is heavier than the decision.
                <span className="inline-flex items-center gap-2">
                  <span className="text-muted-foreground">Delete this?</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setConfirmingDelete(false);
                      onDelete(comment.id);
                    }}
                    className="font-semibold text-destructive underline underline-offset-2 hover:opacity-80 disabled:opacity-50"
                  >
                    Yes, delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(false)}
                    className="font-semibold text-muted-foreground hover:text-foreground"
                  >
                    Keep it
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmingDelete(true)}
                  className="font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
                >
                  Delete
                </button>
              ))}

            {/* Reporting your own comment is not a thing, and the server says so —
                so the control is absent rather than present and refused. */}
            {!comment.mine && signedIn && (
              <button
                type="button"
                disabled={busy || comment.reportedByMe}
                onClick={() => onReport(comment.id)}
                className={cn(
                  'font-semibold underline-offset-2',
                  comment.reportedByMe
                    ? 'cursor-default text-muted-foreground/60'
                    : 'text-muted-foreground hover:text-foreground hover:underline',
                )}
                title={
                  comment.reportedByMe
                    ? 'An editor has been asked to look at this'
                    : 'Ask an editor to look at this comment'
                }
              >
                {comment.reportedByMe ? 'Reported' : 'Report'}
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
