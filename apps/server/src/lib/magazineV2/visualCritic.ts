// ---------------------------------------------------------------------------
// Magazine Builder v2 — the Visual Critic.
//
// The deterministic QA (layoutValidate, fitReport, pageDensity) MEASURES a page:
// overflow, slivers, dead bands, element counts. It cannot SEE one. A page can
// pass every measurement and still be badly composed — a headline floating in a
// sea of nothing, a photo cropped through its subject, white type on a pale sky.
// The critic is the pair of eyes: the composed page is rendered to a small JPEG
// proof (renderPreview.ts), a vision model ('critic' role) judges it against the
// page's type, intent and the issue's visual concept, and its findings become ONE
// concrete retry hint for the art director.
//
// Strictly additive. No Chromium, no model key, a slow render, a failed call or an
// unreadable answer all mean "no verdict" — the page then lives or dies by the
// deterministic QA exactly as before. It never throws and never blocks a page.
//
// The pure half (parseVerdict, verdictHint, attemptPasses, betterAttempt,
// combineHints) is what composeOnePageAI's attempt loop is built on, and is unit-
// tested in tests/magazineV2/visualCritic.test.ts.
// ---------------------------------------------------------------------------

import { generateText } from 'ai';
import { getMagazineModel, isAgentConfigured } from '../agent/provider.js';
import { parseJsonObject } from './parseJson.js';
import { renderPagePreview, type PreviewPage } from './renderPreview.js';

export interface CriticProblem {
  /** Where on the page, in the critic's words ("top band", "lower-right photo"). */
  area: string;
  issue: string;
  /** A layout instruction for the art director. */
  fix: string;
}

export interface CriticVerdict {
  /** 1–10. */
  score: number;
  pass: boolean;
  problems: CriticProblem[];
}

/** Below this the page is not good enough to ship without a corrected attempt. */
export const CRITIC_PASS_SCORE = 7;
const MAX_PROBLEMS = 5;

// ── pure: verdict parsing + hint ─────────────────────────────────────────────

function clip(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/**
 * Read the critic's JSON answer. Null when there is no usable score — a verdict we
 * cannot read is treated as no verdict, never as a pass or a fail.
 *
 * `pass` is never taken on the model's word alone: a score under CRITIC_PASS_SCORE
 * fails whatever `pass` says, and an explicit `pass: false` fails whatever the score
 * says (the critic saw something serious enough to say so).
 */
export function parseVerdict(text: string): CriticVerdict | null {
  const raw = parseJsonObject(text);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const scoreRaw = typeof o.score === 'number' ? o.score : typeof o.score === 'string' ? Number.parseFloat(o.score) : Number.NaN;
  if (!Number.isFinite(scoreRaw)) return null;
  const score = Math.max(1, Math.min(10, Math.round(scoreRaw * 10) / 10));

  const problems: CriticProblem[] = [];
  for (const p of Array.isArray(o.problems) ? o.problems : []) {
    if (typeof p === 'string') {
      const issue = clip(p, 300);
      if (issue) problems.push({ area: '', issue, fix: '' });
      continue;
    }
    if (!p || typeof p !== 'object') continue;
    const r = p as Record<string, unknown>;
    const issue = clip(r.issue ?? r.problem, 300);
    if (!issue) continue;
    problems.push({ area: clip(r.area ?? r.where, 120), issue, fix: clip(r.fix ?? r.remedy, 300) });
    if (problems.length >= MAX_PROBLEMS) break;
  }

  const modelPass =
    typeof o.pass === 'boolean' ? o.pass : typeof o.pass === 'string' ? o.pass.trim().toLowerCase() === 'true' : undefined;
  const pass = score >= CRITIC_PASS_SCORE && modelPass !== false;
  return { score, pass, problems };
}

/** The verdict as a retry hint for artDirectPage — concise, most important first. */
export function verdictHint(v: CriticVerdict): string {
  const head = `A VISUAL CRITIC looked at a render of your page and scored it ${v.score}/10${v.pass ? '' : ' — not good enough to print'}.`;
  if (v.problems.length === 0) {
    return v.pass
      ? head
      : `${head} It named no single fault: strengthen the hierarchy (one dominant element), balance the weight across the page and remove any dead space.`;
  }
  const lines = v.problems.map((p) => `- ${p.area ? `[${p.area}] ` : ''}${p.issue}${p.fix ? ` → fix: ${p.fix}` : ''}`);
  return [`${head} Fix these, most important first:`, ...lines, 'Keep everything that already works.'].join('\n');
}

/** Join the non-empty hint parts (QA reason, measurements, critic), capped in length. */
export function combineHints(parts: Array<string | undefined | null>, max = 3600): string {
  const text = parts
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join('\n\n');
  return text.length <= max ? text : `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

// ── pure: the attempt loop's two decisions ───────────────────────────────────

/** Whether an attempt is good enough to stop: no serious measured flaw, and the critic
 *  (when it gave a verdict) passed it. No verdict = judged on the measurements alone. */
export function attemptPasses(a: { flaws: number; verdict: CriticVerdict | null }): boolean {
  if (a.flaws > 0) return false;
  return a.verdict ? a.verdict.pass : true;
}

export interface RankedAttempt {
  attempt: number;
  /** Composed, passed layoutValidate, and dense enough for its kind. */
  legal: boolean;
  /** Serious measured flaws (fitReport.seriousFlaws). */
  flaws: number;
  /** The critic's score, when it gave one. */
  score?: number;
}

/**
 * The better of two attempts: LEGAL first, then the critic's SCORE (only when both were
 * scored — a missing score is not a zero), then FEWER measured flaws; a full tie keeps
 * the earlier attempt.
 */
export function betterAttempt<T extends RankedAttempt>(current: T | null, next: T): T {
  if (!current) return next;
  if (current.legal !== next.legal) return next.legal ? next : current;
  if (current.score !== undefined && next.score !== undefined && current.score !== next.score) {
    return next.score > current.score ? next : current;
  }
  if (current.flaws !== next.flaws) return next.flaws < current.flaws ? next : current;
  return current;
}

// ── the call ─────────────────────────────────────────────────────────────────

/** The bits of the Creative Director's IssueConcept the critic reads (structural, so
 *  this module never imports generate.ts and its database). */
export interface CriticConcept {
  name?: string;
  mood?: string;
  photoStyle?: string;
  typeVoice?: string;
  grid?: string;
  motifs?: string[];
}

export interface CritiqueInput {
  page: PreviewPage;
  pageNumber: number;
  totalPages: number;
  /** Reader-facing type label, e.g. "Interview", plus what it is for. */
  pageType: string;
  pageTypePurpose?: string;
  intent: string;
  look?: string;
  concept?: CriticConcept;
  palette?: { primary: string; secondary: string; accent: string; bg: string; text: string };
}

const CRITIC_CALL_MS = 45_000;

const CRITIC_SYSTEM = [
  'You are the Visual Critic of a premium print magazine. You are shown ONE rendered page as a',
  'low-resolution proof, and you judge its DESIGN — not its words. Output ONLY a JSON object: no prose,',
  'no markdown fences.',
  '',
  'Judge, in this order of importance:',
  '1. BALANCE & COMPOSITION — a clear structure and focal point, deliberate alignment, weight spread',
  '   sensibly across the page.',
  '2. EMPTY SPACE — intended white space is good; DEAD space is not: blank bands, holes, a box with',
  '   nothing in it, a column that stops halfway down, a photo strip squeezed into leftover space.',
  '3. HIERARCHY — one clearly dominant element; the reader can tell what to read first, second, third.',
  '4. IMAGES — sized for their role (a hero is big), no slivers or postage stamps, crops that keep the',
  '   subject, similar-sized photos only when that is the point (a grid).',
  '5. TEXT — legible size, real contrast against what is behind it (type on a photo needs a calm area',
  '   or a scrim), no clipped or cut-off lines, sensible column widths.',
  '6. OVERLAP MISTAKES — text over text, type running into a photo edge, elements colliding or touching',
  '   the page edge by accident (deliberate overlays and full-bleed photos are fine).',
  '7. CONCEPT — when an issue concept is given, does the page look like it belongs to it?',
  '',
  'Ignore: copy quality and spelling, the proof\'s low resolution, slightly soft photos, and font',
  'rendering artefacts. QR codes and small icons are drawn as simple PLACEHOLDERS — judge their size',
  'and position only, never their artwork. Running heads and page numbers are part of the page.',
  '',
  'Scoring 1-10: 9-10 publishable as is · 7-8 good, minor polish only · 5-6 problems a reader would',
  'notice · 1-4 broken. pass = true only when score >= 7 AND nothing serious is wrong.',
  '',
  'JSON shape:',
  '{"score": <1-10>, "pass": <true|false>, "problems": [{"area": "<where on the page>", "issue": "<what is',
  'wrong>", "fix": "<a concrete LAYOUT change for the art director>"}]}',
  `At most ${MAX_PROBLEMS} problems, most important first; [] when there are none. Fixes are layout`,
  'instructions in plain words (give the photo a bigger share, move the deck under the headline, add a',
  'scrim behind the cover lines, merge the two thin columns) — never pixel values, never copy edits.',
].join('\n');

function contextText(input: CritiqueInput): string {
  const c = input.concept;
  const conceptLine = c
    ? [
        c.name ? `“${c.name}”` : '',
        c.mood ?? '',
        c.photoStyle ? `Photo style: ${c.photoStyle}` : '',
        c.typeVoice ? `Type: ${c.typeVoice}` : '',
        c.grid ? `Grid: ${c.grid}` : '',
        c.motifs?.length ? `Motifs: ${c.motifs.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join(' · ')
    : '';
  const p = input.palette;
  return [
    `Page ${input.pageNumber} of ${input.totalPages}. Page type: ${input.pageType}${input.pageTypePurpose ? ` — ${input.pageTypePurpose}` : ''}.`,
    `Intent: ${input.intent}`,
    input.look ? `Art direction for this page: ${input.look}` : '',
    conceptLine ? `Issue concept: ${conceptLine}` : '',
    p ? `Palette: primary ${p.primary}, secondary ${p.secondary}, accent ${p.accent}, background ${p.bg}, text ${p.text}.` : '',
    'Return ONLY the JSON verdict.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Set MAGAZINE_V2_VISUAL_CRITIC=0 to switch the critic off (deterministic QA only). */
export function visualCriticEnabled(): boolean {
  const v = (process.env.MAGAZINE_V2_VISUAL_CRITIC ?? '').trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  return isAgentConfigured();
}

const warnedKinds = new Set<string>();
function warnOncePer(kind: string, message: string): void {
  if (warnedKinds.has(kind)) return;
  warnedKinds.add(kind);
  console.warn(`[magazineV2] ${message}`);
}

/**
 * Render the page and ask the critic. Null when there is no verdict for any reason
 * (switched off, no Chromium, render failed/late, call failed/late, answer unreadable).
 */
export async function critiquePage(input: CritiqueInput): Promise<CriticVerdict | null> {
  if (!visualCriticEnabled()) return null;
  const jpeg = await renderPagePreview(input.page);
  if (!jpeg) return null;
  try {
    const { text, finishReason } = await generateText({
      model: getMagazineModel('critic'),
      system: CRITIC_SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'file', data: jpeg, mediaType: 'image/jpeg', filename: `page-${input.pageNumber}.jpg` },
            { type: 'text', text: contextText(input) },
          ],
        },
      ],
      // Sonnet 5.5 always thinks, and thinking counts against this cap before the
      // visible JSON starts — a tight cap truncates the verdict, not the thinking.
      maxOutputTokens: 8000,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(CRITIC_CALL_MS),
    });
    const verdict = parseVerdict(text);
    if (!verdict) {
      warnOncePer('unreadable', `visual critic returned no readable verdict (finishReason: ${finishReason}, ${text.length} chars) — skipping it for that page.`);
      return null;
    }
    return verdict;
  } catch (err) {
    warnOncePer('call', `visual critic call failed (${err instanceof Error ? err.message : String(err)}) — skipping it; deterministic QA still runs.`);
    return null;
  }
}
