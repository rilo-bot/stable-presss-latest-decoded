// ---------------------------------------------------------------------------
// UI state for the "Blog Studio" assistant — a right-side drawer that writes,
// revises, publishes and deletes blog posts through a type-or-speak conversation.
//
// Mirrors storyStudioUiStore, with three additions that come from this being a
// DESK rather than a one-shot writer:
//
//   • `mode` + the open post — set by whichever launcher opened the drawer, so
//     "this post" means something when the chat starts inside the editor.
//   • `postList` — the on-screen reference list, the same affordance the Story
//     Studio gives horses: the model names things, the user reads them.
//   • `pendingConfirm` — a destructive action waiting on a human click. The tool
//     call does not resolve until it is answered, so a misheard "scrap that" can
//     never delete published writing on its own.
//
// The conversation itself lives in the panel's useChat hook and survives the
// drawer being closed; "New chat" clears it.
// ---------------------------------------------------------------------------

import { create } from 'zustand';

/** Where the drawer was opened from — decides what "it" refers to. */
export type BlogStudioMode = 'desk' | 'post';

/** A post shown in the read-only reference list during a list step. */
export interface BlogPostOption {
  id: string;
  title: string;
  status: 'draft' | 'published';
  category?: string;
}

/**
 * What the user decided.
 *
 * `retry` exists for the cover card, which has three answers rather than two —
 * keeping a photograph, wanting a different one, and wanting to choose their own
 * are three different next moves for the assistant, and collapsing the last two
 * into "cancel" would have it guess which.
 */
export type ConfirmOutcome = 'confirm' | 'retry' | 'cancel';

/**
 * An action awaiting the user's click.
 *
 * `resolve` is the tool call's own continuation: the executor parks it here and
 * awaits it, so the model is genuinely blocked until a human answers rather than
 * being told "done" and finding out later.
 */
export interface PendingConfirm {
  kind: 'delete' | 'overwrite-live' | 'cover';
  title: string;
  detail: string;
  /** Shown when the decision is about a picture — you cannot approve one unseen. */
  imageUrl?: string;
  /** Credit line for a stock photo, so the user can see whose work it is. */
  credit?: string;
  resolve: (outcome: ConfirmOutcome) => void;
}

interface BlogStudioUiState {
  open: boolean;
  mode: BlogStudioMode;
  /** The post the drawer was opened on, when mode is 'post'. */
  postId: string | null;
  postTitle: string | null;
  postStatus: 'draft' | 'published' | null;

  pendingPrompt: string | null;
  /** Cover photo the user attached via the composer — injected at file-draft time. */
  attachedImageUrl: string | null;
  /** Display-only list of posts on file — shown when the model lists them. */
  postList: BlogPostOption[] | null;
  /** Set once createBlogDraft succeeds — the panel navigates to it, then clears. */
  createdDraftId: string | null;
  /** A destructive action waiting on a click. */
  pendingConfirm: PendingConfirm | null;

  /** Open at the blog list, unscoped. */
  openDesk: () => void;
  /** Open scoped to one post, as the editor's launcher does. */
  openForPost: (post: { id: string; title: string; status: 'draft' | 'published' }) => void;
  setOpen: (open: boolean) => void;
  ask: (prompt: string) => void;
  consumePrompt: () => void;

  setAttachedImage: (url: string | null) => void;
  setPostList: (list: BlogPostOption[] | null) => void;
  setCreatedDraft: (id: string | null) => void;
  /** Park an action and hand back the promise the executor awaits. */
  requestConfirm: (req: Omit<PendingConfirm, 'resolve'>) => Promise<ConfirmOutcome>;
  /** Answer the parked action. */
  answerConfirm: (outcome: ConfirmOutcome) => void;
  /** Clear transient per-conversation state ("New chat" / after filing). */
  reset: () => void;
}

export const useBlogStudioUi = create<BlogStudioUiState>((set, get) => ({
  open: false,
  mode: 'desk',
  postId: null,
  postTitle: null,
  postStatus: null,

  pendingPrompt: null,
  attachedImageUrl: null,
  postList: null,
  createdDraftId: null,
  pendingConfirm: null,

  openDesk: () => set({ open: true, mode: 'desk', postId: null, postTitle: null, postStatus: null }),
  openForPost: (post) =>
    set({ open: true, mode: 'post', postId: post.id, postTitle: post.title, postStatus: post.status }),
  setOpen: (open) => set({ open }),
  ask: (prompt) => set({ open: true, pendingPrompt: prompt }),
  consumePrompt: () => set({ pendingPrompt: null }),

  setAttachedImage: (attachedImageUrl) => set({ attachedImageUrl }),
  setPostList: (postList) => set({ postList }),
  setCreatedDraft: (createdDraftId) => set({ createdDraftId }),

  requestConfirm: (req) =>
    new Promise<ConfirmOutcome>((resolve) => {
      // Only one at a time. A second request while one is open declines itself
      // rather than replacing the card — which would leave the first tool call
      // awaiting a promise nothing can ever resolve.
      if (get().pendingConfirm) {
        resolve('cancel');
        return;
      }
      set({ pendingConfirm: { ...req, resolve } });
    }),

  answerConfirm: (outcome) => {
    const pending = get().pendingConfirm;
    set({ pendingConfirm: null });
    pending?.resolve(outcome);
  },

  reset: () => {
    // Anything still waiting is declined, so no tool call is left hanging.
    get().pendingConfirm?.resolve('cancel');
    set({
      pendingPrompt: null,
      attachedImageUrl: null,
      postList: null,
      createdDraftId: null,
      pendingConfirm: null,
    });
  },
}));
