// ---------------------------------------------------------------------------
// Magazine Builder v2 — chat threads.
//
// A thread is one conversation with the studio assistant, belonging to the person
// who started it. The shape is the one every AI chat app uses: a list on the side,
// "New thread", click an old one to carry on.
//
// ACCESS, IN ONE PLACE — every route asks these two functions, so they cannot
// drift apart:
//
//   read   — the creator, OR the magazine owner
//   write  — the creator ONLY (send a turn, rename, delete)
//
// The owner reading someone else's thread is deliberate: approving a page, it is
// useful to see what the contributor was trying to do. The owner may NOT write
// into it, because the assistant is a 1:1 conversation — a second voice would land
// in the creator's next prompt, and proposals are applied by whoever is looking at
// them under their own page permissions. Reading is context; instructions belong in
// the review note.
//
// Anything else is a 404, never a 403 — the repo convention is that a refusal must
// not reveal that a thread exists.
// ---------------------------------------------------------------------------

export interface ThreadDoc {
  _id?: string;
  magazineId?: unknown;
  userId?: unknown;
  userName?: unknown;
  title?: unknown;
  startedOnPageId?: unknown;
  startedOnPageIndex?: unknown;
  lastMessageAt?: unknown;
  messageCount?: unknown;
  deletedAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

/** The id every legacy (pre-threads) message is addressed by. Not a real document:
 *  those rows have no `threadId`, and this is the handle the API gives them. */
export const LEGACY_THREAD_ID = 'legacy';

export const MAX_TITLE = 120;
/** Enough for a long thought, short enough that a title stays one line in the list. */
export const TITLE_FROM_MESSAGE = 60;

/** May this user open the thread and read its messages? */
export function canReadThread(thread: ThreadDoc | null | undefined, userId: string, isMagazineOwner: boolean): boolean {
  if (!thread) return false;
  return String(thread.userId ?? '') === userId || isMagazineOwner;
}

/**
 * May this user send a turn into it, rename it, or delete it?
 *
 * Creator only — `isMagazineOwner` is deliberately not a parameter, so a future
 * caller cannot pass it in and quietly widen the rule.
 */
export function canWriteThread(thread: ThreadDoc | null | undefined, userId: string): boolean {
  return !!thread && String(thread.userId ?? '') === userId;
}

/**
 * A title from the first thing the user said.
 *
 * No model call: naming a thread is not worth a round trip, and a slow rename is
 * worse than a plain one. Collapses whitespace, strips a trailing partial word so
 * the cut doesn't land mid-word, and falls back to a fixed label for a message
 * that is all punctuation or an attachment with no text.
 */
export function titleFromMessage(text: string): string {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'New chat';
  if (clean.length <= TITLE_FROM_MESSAGE) return clean;
  const cut = clean.slice(0, TITLE_FROM_MESSAGE);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/** Trim and clamp a user-supplied title; '' means "no usable title given". */
export function cleanTitle(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE) : '';
}

/** The wire shape. `mine` saves the client comparing ids it would rather not hold. */
export function threadSummary(t: ThreadDoc, viewerId: string) {
  return {
    id: String(t._id),
    title: typeof t.title === 'string' && t.title ? t.title : 'New chat',
    userId: String(t.userId ?? ''),
    userName: typeof t.userName === 'string' ? t.userName : '',
    mine: String(t.userId ?? '') === viewerId,
    startedOnPageIndex: typeof t.startedOnPageIndex === 'number' ? t.startedOnPageIndex : null,
    messageCount: typeof t.messageCount === 'number' ? t.messageCount : 0,
    lastMessageAt: typeof t.lastMessageAt === 'string' ? t.lastMessageAt : String(t.createdAt ?? ''),
    createdAt: String(t.createdAt ?? ''),
    legacy: false,
    readOnly: String(t.userId ?? '') !== viewerId,
  };
}

/**
 * The synthesised row for messages written before threads existed.
 *
 * Those rows have no `userId` — the information was never recorded — so they
 * cannot be attributed to anyone and are shown to the OWNER only, read-only.
 * Guessing an author would be worse than admitting we don't know. No migration
 * writes anything; this row is assembled at read time.
 */
export function legacyThreadSummary(count: number, lastMessageAt: string) {
  return {
    id: LEGACY_THREAD_ID,
    title: 'Earlier conversation',
    userId: '',
    userName: '',
    mine: false,
    startedOnPageIndex: null,
    messageCount: count,
    lastMessageAt,
    createdAt: '',
    legacy: true,
    readOnly: true,
  };
}
