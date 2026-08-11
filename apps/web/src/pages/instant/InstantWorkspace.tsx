/**
 * Instant — the module shell.
 *
 * Three states in one screen: capture → review → saved. The working state is the
 * capture step with its button spinning, not a separate screen, so the photos and
 * the voice note stay visible while the AI reads them.
 *
 * Permissions: the two modes need DIFFERENT permissions — `stories.create`
 * to file a story, `blogs.create` to file a post — so they are gated
 * independently and the toggle only offers what the user can actually save. A
 * single module-level gate would have hidden the whole screen from a blog-only
 * author, or shown them a Story mode whose save always 403s.
 */
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Lock, Zap } from 'lucide-react';

import { useCan } from '@/lib/permissions';

import { CaptureStep } from './CaptureStep';
import { ReviewStep } from './ReviewStep';
import { useInstantStore } from './instantStore';
import type { InstantMode } from './types';

/** Where a saved STORY can be opened. A saved post skips this — see below. */
function savedLinks(id: string): { to: string; label: string }[] {
  return [
    { to: `/articles/${id}`, label: 'Open the story' },
    { to: '/production-system/workflow', label: 'Workflow Board' },
  ];
}

function SavedPanel() {
  const { saved, reset } = useInstantStore();
  if (!saved) return null;

  return (
    <div className="mx-auto w-full max-w-lg rounded-sm border border-border/60 bg-card p-6 text-center">
      <CheckCircle2 size={28} className="mx-auto mb-3 text-primary" />
      <h2 className="text-[15px] font-semibold text-foreground">Saved as a draft story</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
        &ldquo;{saved.title}&rdquo; is filed as a draft. Nothing is public until it goes through the usual review
        and approval.
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {savedLinks(saved.id).map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="rounded-sm border border-border bg-background px-3.5 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-muted/60"
          >
            {link.label}
          </Link>
        ))}
        <button
          type="button"
          onClick={reset}
          className="flex items-center gap-1.5 rounded-sm bg-primary px-3.5 py-2 text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Zap size={14} /> Capture another
        </button>
      </div>
    </div>
  );
}

export function InstantWorkspace() {
  const { step, mode, saved, setMode, reset } = useInstantStore();
  const navigate = useNavigate();
  const canStory = useCan('stories.create');
  const canBlog = useCan('blogs.create');

  const allowedModes: InstantMode[] = [
    ...(canStory ? (['story'] as const) : []),
    ...(canBlog ? (['blog'] as const) : []),
  ];

  // Keep the selected mode inside what this user may save. A role change while
  // the screen is open would otherwise leave Story selected for someone who can
  // only file posts, and the save would 403 at the end of the whole flow.
  useEffect(() => {
    if (allowedModes.length > 0 && !allowedModes.includes(mode)) setMode(allowedModes[0]!);
  }, [allowedModes, mode, setMode]);

  /**
   * A saved POST hands straight off to the composer, which is where its body is
   * edited — the review step deliberately shows a preview rather than carrying a
   * second block editor. A saved STORY stays here and shows SavedPanel: its body
   * is plain text, already fully edited in review, and its next step is the
   * workflow rather than an editor.
   */
  useEffect(() => {
    if (step === 'saved' && saved?.kind === 'blog') {
      navigate(`/production-system/blogs/${saved.id}`, { replace: true });
    }
  }, [step, saved, navigate]);

  // Leaving the screen abandons the capture: the object URLs behind the
  // thumbnails have to be revoked, and a half-finished draft is not something to
  // silently resurrect three screens later.
  useEffect(() => () => reset(), [reset]);

  if (allowedModes.length === 0) {
    return (
      <div className="mx-auto w-full max-w-md rounded-sm border border-border/60 bg-card p-6 text-center">
        <Lock size={22} className="mx-auto mb-3 text-muted-foreground" />
        <h2 className="text-[14px] font-semibold text-foreground">No draft permissions</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          Instant turns a capture into a draft story or a draft blog post, and your role can create neither. Ask an
          administrator for story or blog access.
        </p>
      </div>
    );
  }

  if (step === 'saved') return <SavedPanel />;
  if (step === 'review') return <ReviewStep />;
  return <CaptureStep allowedModes={allowedModes} />;
}
