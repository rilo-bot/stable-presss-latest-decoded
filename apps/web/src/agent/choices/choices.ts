// ---------------------------------------------------------------------------
// Answer pills — the pure half (no React, no runtime imports).
//
// When The Stable Hand asks something with a few likely answers it calls the
// server tool `offer_choices` (apps/server/src/lib/agent/offerChoices.ts) as the
// last thing in its turn. Both chats (the staff Operator panel and the public
// concierge widget) render that call's INPUT as a choice card under the message
// (ChoiceCard.tsx); a tap sends the answer as the user's next message.
//
// Everything a card needs is derived from the thread itself, so a restored
// (persisted) conversation renders correctly with no extra state:
//   · active    — nobody has answered it yet and no newer card replaced it
//   · answered  — the first later message the PERSON wrote; the picks shown
//                 read-only are parsed back out of that message's text
//
// Tested in apps/server/tests/offerChoices.test.ts.
// ---------------------------------------------------------------------------

export const OFFER_CHOICES_TOOL = 'offer_choices';

/** Clamps for what the model sends (it is asked for 1–4 questions, 2–6 options of ≤ 60 chars). */
export const MAX_QUESTIONS = 4;
export const MAX_OPTIONS = 6;
export const MAX_OPTION_CHARS = 100;
const MAX_LABEL_CHARS = 80;

export interface ChoiceQuestion {
  id: string;
  /** Short label shown above the pills ("Title", "Next step"); may be empty for a lone question. */
  label: string;
  options: string[];
  /** Several answers may be picked. */
  multiple: boolean;
}

/** question id → picked options (in the order they were offered). */
export type ChoiceSelections = Record<string, string[]>;

// Structural stand-ins for the AI SDK's UIMessage / part types, so this module
// has no runtime dependency (and real UIMessages satisfy them).
type PartLike = { type: string; state?: string; input?: unknown; toolName?: string; text?: string };
export type MessageLike = { role: string; parts?: readonly PartLike[] | PartLike[] };

const clean = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/**
 * The tool input → display-ready questions. Never throws; drops anything
 * unusable (no options, blanks, duplicates) and clamps counts and lengths.
 * Returns [] when nothing is left to show.
 */
/** The first string-ish field of an object, in the order given. */
const pick = (o: Record<string, unknown>, keys: string[]): unknown => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
  return undefined;
};
const LABEL_KEYS = ['question', 'label', 'title', 'text', 'prompt', 'header', 'name'];
const OPTIONS_KEYS = ['options', 'choices', 'answers', 'values', 'buttons'];
const OPTION_TEXT_KEYS = ['label', 'text', 'value', 'title', 'option', 'name', 'answer'];

/** An option as a model may write it: "Go ahead" or { label: "Go ahead", value: "go" }. */
function optionText(o: unknown): string {
  if (typeof o === 'string' || typeof o === 'number') return clean(String(o));
  if (o && typeof o === 'object') return clean(pick(o as Record<string, unknown>, OPTION_TEXT_KEYS));
  return '';
}

/**
 * The question list, whatever shape the model used: { questions: [...] } (the
 * contract), { choices | items: [...] }, a bare array, or one flat question
 * { question, options }. A demo showed the card missing when the shape drifted.
 */
function rawQuestions(input: unknown): unknown[] {
  if (Array.isArray(input)) return input;
  if (!input || typeof input !== 'object') return [];
  const o = input as Record<string, unknown>;
  for (const k of ['questions', 'choices', 'items']) {
    const v = o[k];
    // `choices` may itself be the options of ONE question (an array of strings).
    if (Array.isArray(v) && v.length && v.every((x) => x && typeof x === 'object' && !Array.isArray(x) && OPTIONS_KEYS.some((ok) => ok in (x as object)))) return v;
  }
  if (OPTIONS_KEYS.some((k) => Array.isArray(o[k]))) return [o];
  const q = o.questions;
  return Array.isArray(q) ? q : [];
}

export function parseChoices(input: unknown): ChoiceQuestion[] {
  const raw = rawQuestions(input);
  if (!raw.length) return [];
  const out: ChoiceQuestion[] = [];
  const ids = new Set<string>();
  for (const q of raw) {
    if (out.length >= MAX_QUESTIONS) break;
    if (!q || typeof q !== 'object') continue;
    const o = q as Record<string, unknown>;
    const r = {
      id: o.id,
      question: pick(o, LABEL_KEYS),
      options: pick(o, OPTIONS_KEYS),
      multiple: pick(o, ['multiple', 'multi', 'multiSelect', 'allowMultiple']),
    };
    const seen = new Set<string>();
    const options: string[] = [];
    for (const opt of Array.isArray(r.options) ? r.options : []) {
      const text = clip(optionText(opt), MAX_OPTION_CHARS);
      const key = text.toLowerCase();
      if (!text || seen.has(key)) continue;
      seen.add(key);
      options.push(text);
      if (options.length >= MAX_OPTIONS) break;
    }
    if (!options.length) continue;
    let id = clean(r.id) || `q${out.length + 1}`;
    while (ids.has(id)) id = `${id}_`;
    ids.add(id);
    out.push({ id, label: clip(clean(r.question), MAX_LABEL_CHARS), options, multiple: r.multiple === true });
  }
  // Several questions need labels to tell the answers apart in the reply.
  if (out.length > 1) out.forEach((q, i) => { if (!q.label) q.label = `Question ${i + 1}`; });
  return out;
}

/** A part's tool name: "tool-<name>" for static tools, toolName for dynamic ones. */
function toolNameOfPart(p: PartLike): string {
  if (p.type === 'dynamic-tool') return p.toolName ?? '';
  return p.type.startsWith('tool-') ? p.type.slice(5) : '';
}

/** offer_choices however it is spelled (offerChoices, Offer-Choices…) — never a plain step row. */
export function isChoicesPart(p: PartLike | null | undefined): boolean {
  if (!p) return false;
  return toolNameOfPart(p).replace(/[^a-z]/gi, '').toLowerCase() === 'offerchoices';
}

/** A choices part's questions — null while its input is still streaming in (or nothing usable). */
export function choicesOfPart(p: PartLike | null | undefined): ChoiceQuestion[] | null {
  if (!p || !isChoicesPart(p) || p.state === 'input-streaming') return null;
  const qs = parseChoices(p.input);
  return qs.length ? qs : null;
}

/** Every question the message offers (normally one offer_choices call). */
export function messageChoices(m: MessageLike): ChoiceQuestion[] | null {
  const qs = (m.parts ?? []).flatMap((p) => choicesOfPart(p) ?? []);
  return qs.length ? qs : null;
}

/**
 * True when the newest message is an assistant turn whose LAST step offered
 * choices. The turn is over and waiting for the person — a chat whose
 * sendAutomaticallyWhen keys off "every tool call has a result" must NOT
 * auto-continue here (offer_choices is a server tool, so it always has one).
 */
export function lastStepOfferedChoices(messages: readonly MessageLike[]): boolean {
  const m = messages[messages.length - 1];
  if (!m || m.role !== 'assistant') return false;
  const parts = m.parts ?? [];
  let start = -1;
  parts.forEach((p, i) => {
    if (p.type === 'step-start') start = i;
  });
  return parts.slice(start + 1).some(isChoicesPart);
}

export function textOfMessage(m: MessageLike): string {
  return (m.parts ?? [])
    .filter((p) => p.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text as string)
    .join('');
}

export interface ChoiceCardState {
  /** Pills are clickable. */
  active: boolean;
  /** The person's reply that answered the card (read-only cards show the picks from it). */
  answer?: string;
}

/**
 * The state of the card on messages[index]. `isNotice` marks user-role messages
 * the APP wrote (the Operator's [job-update] notices) — they neither answer a
 * card nor close it.
 */
export function choiceCardState<M extends MessageLike>(
  messages: readonly M[],
  index: number,
  isNotice: (m: M) => boolean = () => false,
): ChoiceCardState {
  for (let i = index + 1; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === 'user' && !isNotice(m)) return { active: false, answer: textOfMessage(m) };
    if (m.role === 'assistant' && (m.parts ?? []).some(isChoicesPart)) return { active: false };
  }
  return { active: true };
}

/** One question, one answer: a tap sends it straight away (no Send button). */
export function isInstantChoice(questions: readonly ChoiceQuestion[]): boolean {
  return questions.length === 1 && !questions[0].multiple;
}

/** Pick / unpick. Single-answer questions swap; tapping the picked one clears it. */
export function toggleChoice(
  questions: readonly ChoiceQuestion[],
  selections: ChoiceSelections,
  questionId: string,
  option: string,
): ChoiceSelections {
  const q = questions.find((x) => x.id === questionId);
  if (!q || !q.options.includes(option)) return selections;
  const current = selections[questionId] ?? [];
  const next = current.includes(option)
    ? current.filter((o) => o !== option)
    : q.multiple
      ? [...current, option]
      : [option];
  return { ...selections, [questionId]: next };
}

/** "Which sections?" → "Which sections" — the label as it prefixes an answer line. */
const answerLabel = (label: string) => label.replace(/[\s?:.!]+$/, '');

/**
 * The user message a card sends. A lone single-answer question sends the bare
 * option ("Go ahead"); otherwise one "Label: answer[, answer]" line per
 * ANSWERED question, in the order asked. '' when nothing is picked.
 */
export function composeAnswer(questions: readonly ChoiceQuestion[], selections: ChoiceSelections): string {
  if (isInstantChoice(questions)) return selections[questions[0].id]?.[0] ?? '';
  const lines: string[] = [];
  for (const q of questions) {
    const picks = q.options.filter((o) => selections[q.id]?.includes(o));
    if (!picks.length) continue;
    const label = answerLabel(q.label);
    lines.push(label ? `${label}: ${picks.join(', ')}` : picks.join(', '));
  }
  return lines.join('\n');
}

/**
 * The inverse of composeAnswer, for read-only cards: which options does this
 * reply pick? Anything the person typed themselves simply matches nothing.
 */
export function picksFromAnswer(questions: readonly ChoiceQuestion[], text: string | undefined): ChoiceSelections {
  const out: ChoiceSelections = {};
  const reply = (text ?? '').trim();
  if (!reply || !questions.length) return out;
  const lower = reply.toLowerCase();
  if (isInstantChoice(questions)) {
    const q = questions[0];
    const hit = q.options.find((o) => o.toLowerCase() === lower);
    if (hit) out[q.id] = [hit];
    return out;
  }
  const lines = reply.split(/\r?\n/);
  for (const q of questions) {
    const label = answerLabel(q.label).toLowerCase();
    let rest: string | undefined;
    if (label) {
      const line = lines.find((l) => l.trim().toLowerCase().startsWith(`${label}:`));
      rest = line?.trim().slice(label.length + 1);
    } else if (questions.length === 1) {
      rest = reply;
    }
    if (rest === undefined) continue;
    const hay = `, ${rest.trim().toLowerCase()}, `;
    const picks = q.options.filter((o) => hay.includes(`, ${o.toLowerCase()}, `));
    if (picks.length) out[q.id] = q.multiple ? picks : [picks[0]];
  }
  return out;
}

export function hasPicks(selections: ChoiceSelections): boolean {
  return Object.values(selections).some((v) => v.length > 0);
}
