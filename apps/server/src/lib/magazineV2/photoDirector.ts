// ---------------------------------------------------------------------------
// Magazine Builder v2 — the Photo Director.
//
// Before this, every photo slot took the FIRST Pexels hit for its search terms,
// unseen: the right noun in the wrong light, a watermark, a subject the slot's crop
// would cut in half, three pages in three different colour grades. The Photo
// Director LOOKS before anything is stored:
//
//   1. for every image slot on a page (after the user's own photos — that rule lives
//      in curateFills and is untouched), search ~6 stock candidates, NOT stored;
//   2. ONE vision call per page ('photo' role) sees every slot's previews at once,
//      with each slot's frame shape, the page's intent and the issue's photoStyle,
//      and picks the best candidate per slot — or rejects them all and writes a
//      brief to shoot instead;
//   3. the caller (curateFills) stores only the picks, and GENERATES a frame for a
//      rejected slot (imagegen.ts, at the slot's aspect ratio, in the issue style).
//
// One call per page, not per slot, for speed — and because a director choosing the
// photos of a page together is how they come out looking like one page.
//
// Never throws. No key, no candidates, a slow or failed call, an unreadable answer:
// the decisions fall back to today's ladder (first stock result → generation →
// colour block), slot by slot.
//
// Also here, because they belong to the same "do not source the same photo twice"
// concern: the per-page PHOTO MEMO (a retry that asks for the same brief in the same
// frame gets the stored image back instead of a new search or a new generation),
// and the issue-wide LEDGER of stock photos already placed (so two pages do not
// print the same picture).
//
// Database-free (stores nothing itself) so its pure parts are unit-testable.
// ---------------------------------------------------------------------------

import { generateText } from 'ai';
import { getMagazineModel, isAgentConfigured } from '../agent/provider.js';
import { searchStockPhotos, type StockCandidate, type StockOrientation } from '../stock.js';
import { parseJsonObject } from './parseJson.js';
import { sniffImageType } from './imageBytes.js';

/** What an image element needs from a stored photo. */
export interface StoredImage {
  url: string;
  assetId: string;
  alt: string;
}

// ── the per-page photo memo ──────────────────────────────────────────────────

/** Normalised memo key: same words in the same frame shape, nth request of its kind. */
export function photoMemoKey(brief: string, orientation: string, occurrence = 0): string {
  const words = brief.trim().toLowerCase().replace(/\s+/g, ' ');
  return `${words}|${orientation}#${occurrence}`;
}

/**
 * Memo keys for a page's image requests, IN SLOT ORDER. The nth request with the same
 * brief + orientation gets `#n`, so two slots asking for the same thing on one page
 * never share a photo, while a retry asking for the same things in the same order
 * (remapDraftByRole keeps image briefs in order) gets the same photos back.
 */
export function memoKeysFor(requests: ReadonlyArray<{ brief: string; orientation: string }>): string[] {
  const seen = new Map<string, number>();
  return requests.map((r) => {
    const base = photoMemoKey(r.brief, r.orientation);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : photoMemoKey(r.brief, r.orientation, n);
  });
}

/** Stored photos for one page, across its layout attempts. Only successes are kept:
 *  a slot that found nothing is asked again on the next attempt. */
export class PhotoMemo {
  private readonly map = new Map<string, StoredImage>();
  get(key: string): StoredImage | undefined {
    return this.map.get(key);
  }
  set(key: string, image: StoredImage | null | undefined): void {
    if (image && image.url) this.map.set(key, image);
  }
  get size(): number {
    return this.map.size;
  }
}

// ── the issue-wide ledger of placed stock photos ─────────────────────────────

const LEDGER_ISSUES = 64;
const ledgers = new Map<string, Set<string>>();

/**
 * The Pexels ids already placed in this issue. Per magazine, never global. Bounded
 * LRU over issues so a long-lived worker does not grow without limit. The set only
 * knows what THIS process placed until it is seeded from the issue's stored media
 * (seedStockLedger, at every job start) — that is what stops a later "add pages"
 * run, or a run on another worker, from repeating an older photo.
 */
export function issueStockLedger(magazineId: string): Set<string> {
  let set = ledgers.get(magazineId);
  if (set) {
    ledgers.delete(magazineId);
  } else {
    set = new Set<string>();
  }
  ledgers.set(magazineId, set);
  while (ledgers.size > LEDGER_ISSUES) ledgers.delete(ledgers.keys().next().value as string);
  return set;
}

/**
 * A fallback identity for a stock photo when its provider id is unknown: the
 * photographer's profile URL + the provider's description of the photo. Media rows
 * stored before `stockId` was recorded carry exactly these two (attribution.url,
 * alt), and no source URL of the photo itself — so this is the closest URL match
 * available for them. null when either half is missing (too weak to match on).
 */
export function stockFingerprint(photo: { alt?: string; attribution?: { url?: string } | null }): string | null {
  const by = (photo.attribution?.url ?? '').trim().toLowerCase().replace(/\/+$/, '');
  const alt = (photo.alt ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return by && alt ? `fp:${by}|${alt}` : null;
}

/** Is this candidate already placed in the issue — by id, or (older rows) by fingerprint? */
export function isStockTaken(ledger: ReadonlySet<string>, c: StockCandidate): boolean {
  if (ledger.has(c.id)) return true;
  const fp = stockFingerprint(c);
  return fp !== null && ledger.has(fp);
}

/** The fields of a media row the ledger seed reads (all optional: raw Mongo rows). */
export interface LedgerMediaRow {
  source?: string;
  stockId?: unknown;
  alt?: string;
  attribution?: { url?: string } | null;
}

/**
 * Seed an issue's ledger from its stored media rows (the magazine's own rows only —
 * the caller queries by magazineId). A stock row with `stockId` adds that exact id;
 * an older stock row without one adds its fingerprint (stockFingerprint). Non-stock
 * rows (uploads, generated frames, extracted photos) are ignored. Idempotent.
 * Returns how many rows were recognised as placed stock photos.
 */
export function seedStockLedger(ledger: Set<string>, rows: ReadonlyArray<LedgerMediaRow>): number {
  let n = 0;
  for (const row of rows) {
    if (!row || row.source !== 'stock') continue;
    const id = typeof row.stockId === 'number' ? String(row.stockId) : typeof row.stockId === 'string' ? row.stockId.trim() : '';
    if (id) {
      ledger.add(id);
      n += 1;
      continue;
    }
    const fp = stockFingerprint(row);
    if (fp) {
      ledger.add(fp);
      n += 1;
    }
  }
  return n;
}

// ── the director: inputs, decisions, parsing ─────────────────────────────────

/** One image slot to source, as curateFills sees it. */
export interface PhotoRequest {
  slotId: string;
  brief: string;
  orientation: StockOrientation;
  /** The slot's box in canonical page px. */
  boxW: number;
  boxH: number;
  /** Box area as a fraction of the page (0–1): tells a hero from an inset. */
  pageShare: number;
}

/** The page + issue the photos are for. Everything optional is simply omitted. */
export interface PhotoContext {
  magazineTitle: string;
  pageNumber: number;
  pageType: string;
  intent: string;
  look?: string;
  /** The issue's ONE photographic style (IssueConcept.photoStyle). */
  photoStyle?: string;
  mood?: string;
}

export interface LabelledCandidate extends StockCandidate {
  /** Short, model-facing handle ("1a", "2c") — the model never sees or returns a provider id. */
  label: string;
}

export interface DirectorSlot extends PhotoRequest {
  candidates: LabelledCandidate[];
}

export type DirectorChoice = { pick: string } | { reject: true; shoot?: string };

export type SlotDecision =
  /** Store this stock photo. `by` says whether the director chose it or the fallback did. */
  | { kind: 'stock'; candidate: StockCandidate; by: 'director' | 'fallback' }
  /** Generate a frame from `prompt`. `backup` (fallback path only) is stored if generation fails. */
  | { kind: 'generate'; prompt: string; backup?: StockCandidate };

const LETTERS = 'abcdefghij';

/** Give each slot's candidates their short labels ("1a".."1f", "2a"…). */
export function labelCandidates(perSlot: StockCandidate[][]): LabelledCandidate[][] {
  return perSlot.map((list, i) => list.slice(0, LETTERS.length).map((c, j) => ({ ...c, label: `${i + 1}${LETTERS[j]}` })));
}

/**
 * Read the director's JSON. Only labels that belong to THAT slot's candidates are
 * accepted (case-insensitive); anything else is treated as no answer for the slot.
 */
export function parseDirectorChoices(
  text: string,
  slots: ReadonlyArray<{ slotId: string; candidates: ReadonlyArray<{ label: string }> }>,
): Map<string, DirectorChoice> {
  const out = new Map<string, DirectorChoice>();
  const raw = parseJsonObject(text);
  if (!raw || typeof raw !== 'object') return out;
  const list = Array.isArray(raw) ? raw : (raw as Record<string, unknown>).choices;
  if (!Array.isArray(list)) return out;
  const bySlot = new Map(slots.map((s, i) => [s.slotId, { index: i, labels: new Set(s.candidates.map((c) => c.label.toLowerCase())) }]));
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    // The slot by id, or by its 1-based position as a fallback ("slot": 2).
    const slotKey =
      typeof o.slot === 'string' && bySlot.has(o.slot)
        ? o.slot
        : typeof o.slot === 'number'
          ? slots[o.slot - 1]?.slotId
          : typeof o.slotId === 'string' && bySlot.has(o.slotId)
            ? o.slotId
            : undefined;
    if (!slotKey || out.has(slotKey)) continue;
    const entry = bySlot.get(slotKey)!;
    const pick = typeof o.pick === 'string' ? o.pick.trim().toLowerCase() : '';
    if (pick && pick !== 'none' && pick !== 'null') {
      if (entry.labels.has(pick)) out.set(slotKey, { pick });
      continue; // an unknown label is no answer, not a rejection
    }
    if (o.pick === null || pick === 'none' || pick === 'null' || o.reject === true) {
      const shoot = typeof o.shoot === 'string' ? o.shoot.replace(/\s+/g, ' ').trim().slice(0, 400) : '';
      out.set(slotKey, shoot ? { reject: true, shoot } : { reject: true });
    }
  }
  return out;
}

/**
 * Turn the director's choices (or null when it did not run) into one decision per
 * slot. `taken` holds provider ids (and, for older seeded rows, fingerprints — see
 * isStockTaken) already placed — in this issue (the ledger) and, as this runs, on
 * this page — and is UPDATED with every stock decision, so no photo is placed twice.
 * Pure apart from that set.
 *
 *  • director picked an untaken candidate → store it
 *  • director rejected the slot           → generate (its `shoot` brief, else the slot's brief); no stock backup
 *  • no usable answer for the slot        → first untaken candidate (fallback), else generate
 *  • no candidates at all                 → generate
 */
export function decideSlots(
  slots: ReadonlyArray<DirectorSlot>,
  choices: Map<string, DirectorChoice> | null,
  taken: Set<string>,
): Map<string, SlotDecision> {
  const out = new Map<string, SlotDecision>();
  const firstFree = (s: DirectorSlot) => s.candidates.find((c) => !isStockTaken(taken, c));
  for (const s of slots) {
    const choice = choices?.get(s.slotId);
    if (choice && 'pick' in choice) {
      const picked = s.candidates.find((c) => c.label.toLowerCase() === choice.pick);
      if (picked && !isStockTaken(taken, picked)) {
        taken.add(picked.id);
        out.set(s.slotId, { kind: 'stock', candidate: stripLabel(picked), by: 'director' });
        continue;
      }
    } else if (choice && 'reject' in choice) {
      out.set(s.slotId, { kind: 'generate', prompt: choice.shoot || s.brief });
      continue;
    }
    const fallback = firstFree(s);
    if (fallback) {
      taken.add(fallback.id);
      out.set(s.slotId, { kind: 'stock', candidate: stripLabel(fallback), by: 'fallback' });
    } else {
      out.set(s.slotId, { kind: 'generate', prompt: s.brief });
    }
  }
  return out;
}

function stripLabel(c: LabelledCandidate): StockCandidate {
  const { label: _label, ...rest } = c;
  return rest;
}

function shapeWord(w: number, h: number): string {
  const r = w / Math.max(1, h);
  return r > 1.2 ? 'wide' : r < 0.85 ? 'tall' : 'square-ish';
}

const DIRECTOR_SYSTEM = [
  'You are the Photo Director of a premium print magazine. For each photo slot on ONE page you are',
  'shown a few stock-photo candidates. Pick the best candidate for every slot, or reject them all for',
  'that slot. Output ONLY a JSON object — no prose, no markdown fences.',
  '',
  'How to choose:',
  '- SUBJECT first: the photo must show what the slot brief and the page intent are about. A beautiful',
  '  photo of the wrong thing is wrong.',
  '- THE FRAME: each photo is cropped to its slot\'s shape (cover, centred). Prefer a candidate whose',
  '  subject survives that crop — a tall slot needs a subject that works tall.',
  '- ONE LOOK: the issue has one photographic style. Prefer candidates that match it (light, colour',
  '  grade, lens, framing) and that sit well together on this page.',
  '- QUALITY: sharp, well lit, editorial. Not a staged stock cliché, not a collage, not an illustration',
  '  or 3D render unless the brief asks for one.',
  '- REJECT any candidate showing text, captions, watermarks, logos, brand names or an identifiable',
  '  famous person.',
  '- Never pick the same candidate for two slots.',
  '- If NO candidate truly fits a slot, set "pick" to null and write "shoot": one sentence briefing a',
  '  photographer to shoot it instead — concrete subject, setting and light, no text in the image.',
  '',
  'JSON: {"choices":[{"slot":"<slot id>","pick":"<candidate label, e.g. 1c>" | null,"shoot":"<only when',
  'pick is null>","why":"<a few words>"}]}',
  'One entry per slot, in the order given.',
].join('\n');

type DirectorPart = { type: 'text'; text: string } | { type: 'file'; data: Buffer; mediaType: string };

/** The user message: page context, then each slot followed by its labelled previews. */
export function directorContent(
  slots: ReadonlyArray<DirectorSlot>,
  context: PhotoContext,
  previews: ReadonlyMap<string, { bytes: Buffer; contentType: string }>,
): DirectorPart[] {
  const parts: DirectorPart[] = [
    {
      type: 'text',
      text: [
        `Magazine: “${context.magazineTitle}”. Page ${context.pageNumber} — ${context.pageType}.`,
        `Page intent: ${context.intent}`,
        context.look ? `Art direction: ${context.look}` : '',
        context.photoStyle ? `THE ISSUE'S PHOTOGRAPHIC STYLE (every photo should look like this): ${context.photoStyle}` : '',
        context.mood ? `Mood: ${context.mood}` : '',
        `${slots.length} slot(s) to fill:`,
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ];
  slots.forEach((s, i) => {
    const shown = s.candidates.filter((c) => previews.has(c.label));
    parts.push({
      type: 'text',
      text:
        `\nSLOT ${i + 1} — id "${s.slotId}": ${Math.round(s.pageShare * 100)}% of the page, frame ` +
        `${(s.boxW / Math.max(1, s.boxH)).toFixed(2)}:1 (${shapeWord(s.boxW, s.boxH)}). Brief: "${s.brief}".` +
        (shown.length ? ` Candidates:` : ' No candidates were found — set pick to null and write a shoot brief.'),
    });
    for (const c of shown) {
      const p = previews.get(c.label)!;
      const dims = c.width && c.height ? `${c.width}×${c.height} (${shapeWord(c.width, c.height)})` : 'size unknown';
      const by = c.attribution.author ? `, by ${c.attribution.author}` : '';
      parts.push({ type: 'text', text: `${c.label} — ${dims}${by}: “${c.alt.slice(0, 140)}”` });
      parts.push({ type: 'file', data: p.bytes, mediaType: p.contentType });
    }
  });
  parts.push({ type: 'text', text: '\nReturn ONLY the JSON.' });
  return parts;
}

// ── the impure half: search, previews, the call ──────────────────────────────

const CANDIDATES_PER_SLOT = 6;
const SEARCH_COUNT = 8; // a little over, so ledger-filtered results still leave ~6
const PREVIEW_FETCH_MS = 6_000;
const PREVIEW_MAX_BYTES = 2 * 1024 * 1024;
const MAX_PREVIEWS = 36;
const DIRECTOR_CALL_MS = 40_000;

async function fetchPreview(url: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(PREVIEW_FETCH_MS) });
    if (!res.ok) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > PREVIEW_MAX_BYTES) return null;
    const contentType = sniffImageType(bytes);
    return contentType ? { bytes, contentType } : null;
  } catch {
    return null;
  }
}

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}

const warned = new Set<string>();
function warnOnce(kind: string, message: string): void {
  if (warned.has(kind)) return;
  warned.add(kind);
  console.warn(`[magazineV2] ${message}`);
}

/** Set MAGAZINE_V2_PHOTO_DIRECTOR=0 to fall back to first-result stock sourcing. */
export function photoDirectorEnabled(): boolean {
  const v = (process.env.MAGAZINE_V2_PHOTO_DIRECTOR ?? '').trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  return isAgentConfigured();
}

/**
 * Decide how to fill a page's image slots: search candidates for every slot, let the
 * director look at all of them in one call, and return one decision per slot. When the
 * director is off, fails or times out, the decisions are the fallback ladder (first
 * untaken stock result, else generate). `ledger` is the issue's placed-photo set (see
 * issueStockLedger) and is updated with every stock decision. Never throws.
 */
export async function directPagePhotos(
  requests: ReadonlyArray<PhotoRequest>,
  context: PhotoContext,
  ledger: Set<string>,
): Promise<{ decisions: Map<string, SlotDecision>; directed: boolean }> {
  // 1) Candidates per slot, in parallel. Photos this issue already placed are dropped
  //    before anyone looks at them.
  const found = await Promise.all(
    requests.map(async (r) => {
      try {
        // Cached per (brief, orientation) and rate-limit aware (lib/stock.ts): during a
        // Pexels cooldown an uncached search is [] and the slot is generated instead.
        const list = await searchStockPhotos(r.brief, { orientation: r.orientation, count: SEARCH_COUNT });
        return list.filter((c) => !isStockTaken(ledger, c)).slice(0, CANDIDATES_PER_SLOT);
      } catch {
        return [] as StockCandidate[];
      }
    }),
  );
  const labelled = labelCandidates(found);
  const slots: DirectorSlot[] = requests.map((r, i) => ({ ...r, candidates: labelled[i] ?? [] }));

  if (!photoDirectorEnabled()) return { decisions: decideSlots(slots, null, ledger), directed: false };

  // 2) Previews — fetched here so one dead thumbnail drops one candidate, not the call.
  const all = slots.flatMap((s) => s.candidates).slice(0, MAX_PREVIEWS);
  const fetched = await mapLimit(all, 8, (c) => fetchPreview(c.thumbUrl));
  const previews = new Map<string, { bytes: Buffer; contentType: string }>();
  all.forEach((c, i) => {
    const p = fetched[i];
    if (p) previews.set(c.label, p);
  });
  // Only what the director could actually see is choosable.
  const seen: DirectorSlot[] = slots.map((s) => ({ ...s, candidates: s.candidates.filter((c) => previews.has(c.label)) }));
  // Nothing to look at (no stock results, or no preview loaded): a call would only
  // be asked to say "generate" for every slot, which the fallback already does.
  if (previews.size === 0) return { decisions: decideSlots(slots, null, ledger), directed: false };

  // 3) One call for the whole page.
  try {
    const { text } = await generateText({
      model: getMagazineModel('photo'),
      system: DIRECTOR_SYSTEM,
      messages: [{ role: 'user', content: directorContent(seen, context, previews) }],
      // Sonnet 5.5 thinks before it answers; the thinking counts against this cap.
      maxOutputTokens: 8000,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(DIRECTOR_CALL_MS),
    });
    const choices = parseDirectorChoices(text, seen);
    if (choices.size === 0) {
      warnOnce('unreadable', `photo director gave no usable choices (${text.length} chars) — using the first stock result per slot.`);
      return { decisions: decideSlots(slots, null, ledger), directed: false };
    }
    // The director's answers claim their photos first (they are deliberate); a slot it
    // did not answer then falls back over its FULL candidate list.
    const decisions = decideSlots(
      seen.filter((s) => choices.has(s.slotId)),
      choices,
      ledger,
    );
    for (const [slotId, d] of decideSlots(
      slots.filter((s) => !choices.has(s.slotId)),
      null,
      ledger,
    )) {
      decisions.set(slotId, d);
    }
    return { decisions, directed: true };
  } catch (err) {
    warnOnce('call', `photo director call failed (${err instanceof Error ? err.message : String(err)}) — using the first stock result per slot.`);
    return { decisions: decideSlots(slots, null, ledger), directed: false };
  }
}
