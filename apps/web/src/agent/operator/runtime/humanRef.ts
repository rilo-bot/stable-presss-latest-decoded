// ---------------------------------------------------------------------------
// Human references: what The Stable Hand SHOWS a person instead of an id.
//
// The model works in ids (userId, story id, comment id, invite id …); people
// read names. Every string the Operator puts in front of the user (confirm
// cards, step lines, the short error line under a step) must name things the
// way the screen does, never by a Mongo ObjectId / UUID / opaque token.
// Reported: "Share pages 1–2 of “Spring” with 6650f1a2…?" when the model passed
// a userId for someone who was not a collaborator yet.
//
// Fallback order for a person: name → email → a neutral phrase ("this staff
// member"). Never the id.
//
// Pure: no imports, no DOM, no stores, so the server test suite can pin it
// (apps/server/tests/operatorHumanRef.test.ts). The async lookups that fill a
// name in from the staff directory live in ./people.ts.
// ---------------------------------------------------------------------------

/** What a confirm card says about a person nobody could name. */
export const NEUTRAL_PERSON = 'this staff member';

// ── id detection ─────────────────────────────────────────────────────────────

const OBJECT_ID = /^[a-f0-9]{24}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONG_HEX = /^[0-9a-f]{16,}$/i;
const LONG_DIGITS = /^\d{12,}$/;
const JWT = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/;
/** nanoid / cuid style: one unbroken run of letters and digits. Hyphenated
 *  slugs ("sub-editor-2024") are words, not tokens, so they never match. */
const OPAQUE = /^[A-Za-z0-9]{20,}$/;
/** "usr_6650f…", "invite:3f2a…" */
const PREFIXED = /^[A-Za-z]{1,16}[_:]([A-Za-z0-9-]{16,})$/;

const digitCount = (s: string) => (s.match(/\d/g) ?? []).length;

/**
 * True for a string a person should never be shown: a Mongo ObjectId, a UUID,
 * a long hex / digit run, a JWT, or an opaque generated token. Names, emails,
 * slugs, page numbers and anything with a space are never ids.
 */
export function looksLikeId(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const s = value.trim();
  if (s.length < 12 || /\s/.test(s) || s.includes('@')) return false;
  if (OBJECT_ID.test(s) || UUID.test(s) || LONG_HEX.test(s) || LONG_DIGITS.test(s) || JWT.test(s)) return true;
  if (OPAQUE.test(s) && digitCount(s) >= 4 && /[a-z]/i.test(s)) return true;
  const pre = s.match(PREFIXED);
  return !!pre && looksLikeId(pre[1]);
}

// One token, as found INSIDE free text (word-bounded).
const TOKEN_SRC = [
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}',
  '[0-9a-fA-F]{16,}',
  '\\d{12,}',
  // ≥ 20 letters/digits with at least 4 digits and a letter somewhere in it.
  '(?=[A-Za-z0-9]*[A-Za-z])(?=(?:[A-Za-z]*\\d){4})[A-Za-z0-9]{20,}',
].join('|');
const TOKEN = `(?:${TOKEN_SRC})`;

/** "(userId 6650…)", "(id: 6650…)", "(6650…)" → removed entirely. */
const PAREN_ID = new RegExp(`\\s*\\((?:[A-Za-z ]{0,16}\\s*[:#=]?\\s*)?\\b${TOKEN}\\b\\)`, 'g');
/** "id 6650…", "userId: 6650…", "user id “6650…”" → "that id". */
const ID_NOUNS = 'user|invite|party|horse|story|blog|post|comment|page|episode|member|magazine|issue';
const LABELLED_ID = new RegExp(
  `\\b(?:[a-z]+Id|(?:(?:${ID_NOUNS}) )?[Ii][Dd]s?)\\s*[:#=]?\\s*["“'‘]?\\b${TOKEN}\\b["”'’]?`,
  'g',
);
/** “6650…” / "6650…" → the phrase (the quotes go too). */
const QUOTED_ID = new RegExp(`["“'‘]${TOKEN}["”'’]`, 'g');
/** /horses/6650… → /horses/… */
const PATH_ID = new RegExp(`/${TOKEN}\\b`, 'g');
const BARE_ID = new RegExp(`\\b${TOKEN}\\b`, 'g');

/**
 * Take every id-looking token out of a sentence a person will read. The safety
 * net under every confirm card and step line (operatorStore); the primary fix
 * is always to name the thing properly at the source.
 */
export function scrubIds(text: string, phrase = 'this item'): string {
  if (!text) return text;
  const out = text
    .replace(PAREN_ID, '')
    .replace(LABELLED_ID, 'that id')
    .replace(QUOTED_ID, phrase)
    .replace(PATH_ID, '/…')
    .replace(BARE_ID, phrase);
  return out === text ? text : out.replace(/[ \t]{2,}/g, ' ');
}

/** The ids gone from a free-text string, nothing put in their place. */
function stripIdTokens(text: string): string {
  return text.replace(new RegExp(TOKEN, 'g'), ' ');
}

// ── people ───────────────────────────────────────────────────────────────────

/** Anything that describes a person: a staff-directory row, a team member, a
 *  magazine collaborator, the signed-in user. */
export interface PersonRecord {
  userId?: string | null;
  id?: string | null;
  name?: string | null;
  displayName?: string | null;
  email?: string | null;
}

const clean = (s: string | null | undefined) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');
const nameOf = (p: PersonRecord) => {
  const n = clean(p.name) || clean(p.displayName);
  return n && !looksLikeId(n) ? n : '';
};
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+$/.test(s);

/** How a confirm card names a person: name → email → `fallback`. Never an id. */
export function personDisplay(p: PersonRecord | null | undefined, fallback = NEUTRAL_PERSON): string {
  if (!p) return fallback;
  const name = nameOf(p);
  if (name) return name;
  const email = clean(p.email);
  return email && isEmail(email) ? email : fallback;
}

/** "Ahmed Khan (ahmed@stable.press)" when both are known, else personDisplay. */
export function personDisplayWithEmail(p: PersonRecord | null | undefined, fallback = NEUTRAL_PERSON): string {
  const name = p ? nameOf(p) : '';
  const email = clean(p?.email);
  if (name && email && isEmail(email) && name.toLowerCase() !== email.toLowerCase()) return `${name} (${email})`;
  return personDisplay(p, fallback);
}

const personKey = (p: PersonRecord) => clean(p.userId) || clean(p.id) || clean(p.email).toLowerCase() || nameOf(p).toLowerCase();

function uniquePeople<T extends PersonRecord>(list: T[]): T[] {
  const seen = new Map<string, T>();
  for (const p of list) {
    const k = personKey(p);
    const had = seen.get(k);
    // Keep the richest copy: one that has a name beats one that doesn't.
    if (!had || (!nameOf(had) && nameOf(p))) seen.set(k, p);
  }
  return [...seen.values()];
}

/**
 * The person a free-text reference means: an exact userId / id / email / name
 * first, then a UNIQUE partial name match. An id or an email never partially
 * matches. Undefined when nobody, or more than one person, fits.
 */
export function findPerson<T extends PersonRecord>(ref: string, pool: readonly T[]): T | undefined {
  const raw = clean(ref);
  const q = raw.toLowerCase();
  if (!q) return undefined;
  const exact = uniquePeople(
    pool.filter((p) => clean(p.userId) === raw || clean(p.id) === raw || clean(p.email).toLowerCase() === q || nameOf(p).toLowerCase() === q),
  );
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return undefined;
  if (looksLikeId(raw) || raw.includes('@')) return undefined;
  const partial = uniquePeople(pool.filter((p) => nameOf(p).toLowerCase().includes(q)));
  return partial.length === 1 ? partial[0] : undefined;
}

/**
 * How to name the person a model reference points at.
 *   found in the pool        → their name (else email)
 *   not found, an email      → the email
 *   not found, an id         → `fallback` ("this staff member")
 *   not found, free text     → the text itself (a name the user typed: "Ahmed")
 */
export function describePersonRef(
  ref: string,
  pool: readonly PersonRecord[],
  fallback = NEUTRAL_PERSON,
): { label: string; found: boolean; person?: PersonRecord } {
  const hit = findPerson(ref, pool);
  if (hit) return { label: personDisplay(hit, fallback), found: true, person: hit };
  const r = clean(ref);
  if (isEmail(r)) return { label: r, found: false };
  if (!r || looksLikeId(r)) return { label: fallback, found: false };
  return { label: r, found: false };
}

// ── other references ─────────────────────────────────────────────────────────

/**
 * A reference echoed back in an error line: “Ahmed” in quotes, or `idPhrase`
 * when it is an id. ("No team member matches that id." — the model still knows
 * exactly which id it passed.)
 */
export function quoteRef(ref: string, idPhrase = 'that id'): string {
  const r = clean(ref);
  return looksLikeId(r) ? idPhrase : `“${r}”`;
}

/** A title / name for a confirm card, or `fallback` when it is empty or an id. */
export function titleOr(title: string | null | undefined, fallback: string): string {
  const t = clean(title);
  return t && !looksLikeId(t) ? t : fallback;
}

// Words that describe the KIND of control, not what it is ("Share button").
const CONTROL_WORDS = new Set(['button', 'btn', 'input', 'field', 'link', 'tab', 'toggle', 'select', 'menu', 'item']);

/**
 * A data-agent-id → a short readable name with every id taken out, for when an
 * element has no label of its own: "team.remove-6650f1a2…" → "Remove",
 * "mag.page-3-delete" → "Page 3 delete". `fallback` when nothing is left.
 */
export function nameFromAgentId(agentId: string | null | undefined, fallback = 'this control'): string {
  // A generic ref ("ref:12") is a counter, not a name — never "Ref:12".
  if (/^\s*ref:\d+\s*$/i.test(agentId ?? '')) return fallback;
  const last = (agentId ?? '').split('.').pop() ?? '';
  const words = stripIdTokens(last)
    .split(/[-_\s]+/)
    .filter((w) => w && !looksLikeId(w));
  const kept = words.filter((w, i) => !(CONTROL_WORDS.has(w.toLowerCase()) && words.length > 1 && i === words.length - 1));
  const s = kept.join(' ').trim();
  return s ? s[0]!.toUpperCase() + s.slice(1) : fallback;
}

/** 'dateOfBirth' / 'sire_name' → 'date of birth' / 'sire name'. */
export function humanizeKey(key: string): string {
  return clean(
    key
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_\-.]+/g, ' ')
      .toLowerCase(),
  );
}

// ── async confirm questions ──────────────────────────────────────────────────

/**
 * Settle an action's confirm() result. A sync answer passes straight through
 * (null / '' = no card, exactly as before). An async one (it looked a name up)
 * is given `timeoutMs`; if it is slow or fails, the card still shows, with the
 * generic, id-free `fallback`. A sensitive action is never let through
 * unasked because a lookup was slow.
 */
export async function settleQuestion(
  q: string | null | undefined | PromiseLike<string | null | undefined>,
  timeoutMs: number,
  fallback: string,
): Promise<string | null> {
  if (!q || typeof q === 'string') return q || null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const out = await Promise.race([
      Promise.resolve(q),
      new Promise<string>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
    return out || null;
  } catch {
    return fallback;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ── errors with a model-only detail ──────────────────────────────────────────

/**
 * An error whose MESSAGE is fit for the person (names only) and whose `detail`
 * carries what the model needs to recover (candidates with their ids). The
 * runtime returns both: { ok:false, error: message, detail }. The step list
 * shows only `error`.
 */
export function actionError(message: string, detail: unknown): Error {
  return Object.assign(new Error(message), { detail });
}

/** The model-only detail an error carries, if any. */
export function errorDetail(e: unknown): unknown {
  return e && typeof e === 'object' && 'detail' in e ? (e as { detail: unknown }).detail : undefined;
}
