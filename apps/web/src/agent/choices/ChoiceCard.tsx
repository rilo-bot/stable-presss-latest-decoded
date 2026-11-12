// ---------------------------------------------------------------------------
// ChoiceCard — clickable answer "pills" under a Stable Hand message.
//
// Renders an `offer_choices` call (see ./choices.ts) in both chats:
//   · one question, one answer → tapping a pill sends it at once
//   · several questions, or `multiple` → pills toggle (one per question unless
//     multiple) and Send posts one "Label: answer" line per answered question
// Typing in the composer always still works — the card is a shortcut, not a gate.
// Once the person has replied the card turns read-only and shows only what was
// picked (or disappears when they typed something else). It never re-sends.
// ---------------------------------------------------------------------------

import { useId, useState, type CSSProperties } from 'react';
import { Check, Send } from 'lucide-react';

import {
  composeAnswer,
  hasPicks,
  isInstantChoice,
  picksFromAnswer,
  toggleChoice,
  type ChoiceQuestion,
  type ChoiceSelections,
} from './choices';

/** operator = the staff panel's forest / gold styling; concierge = the public widget's. */
export type ChoiceTone = 'operator' | 'concierge';

const GOLD = 'hsl(var(--brand-accent))';

const TONES: Record<ChoiceTone, { idle: CSSProperties; picked: CSSProperties; pickedClass: string; done: CSSProperties }> = {
  operator: {
    idle: { borderColor: 'rgba(212,168,67,0.45)' },
    picked: { borderColor: 'var(--gold-mid)', background: 'rgba(212,168,67,0.18)' },
    pickedClass: 'font-medium text-foreground',
    done: { borderColor: 'rgba(212,168,67,0.35)', background: 'rgba(212,168,67,0.10)' },
  },
  concierge: {
    idle: { borderColor: 'hsl(var(--primary) / 0.25)' },
    picked: {},
    pickedClass: 'border-primary bg-primary font-medium text-primary-foreground',
    done: { borderColor: 'hsl(var(--primary) / 0.2)' },
  },
};

const PILL =
  'inline-flex min-h-[32px] max-w-full items-center gap-1.5 whitespace-normal break-words rounded-full border px-3 py-1.5 ' +
  'text-left text-xs leading-snug text-foreground transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-card';

export function ChoiceCard({
  questions,
  active,
  answer,
  disabled = false,
  onSubmit,
  tone = 'operator',
}: {
  questions: ChoiceQuestion[];
  /** false → read-only (answered, or replaced by a newer card). */
  active: boolean;
  /** The person's reply that answered this card. */
  answer?: string;
  /** The chat is busy: show the pills, but they can't be pressed yet. */
  disabled?: boolean;
  onSubmit: (text: string) => void;
  tone?: ChoiceTone;
}) {
  const [selections, setSelections] = useState<ChoiceSelections>({});
  // Set the moment a pill / Send is pressed, so the card is read-only at once
  // (before the new user message arrives) and a double tap can't send twice.
  const [sent, setSent] = useState<string | null>(null);
  const baseId = useId();
  const t = TONES[tone];
  const ring = { ['--tw-ring-color' as string]: GOLD } as CSSProperties;

  if (!questions.length) return null;

  // ── Read-only: only what was picked, or nothing at all ──
  if (!active || sent !== null) {
    const picks = picksFromAnswer(questions, sent ?? answer);
    if (!hasPicks(picks)) return null;
    return (
      <div className="w-full max-w-[92%] space-y-1.5" aria-label="Your answer">
        {questions.map((q) =>
          picks[q.id]?.length ? (
            <div key={q.id} className="flex flex-wrap items-center gap-1.5">
              {q.label && !isInstantChoice(questions) && (
                <span className="text-[11px] font-medium text-muted-foreground">{q.label}:</span>
              )}
              {picks[q.id].map((o) => (
                <span key={o} className={PILL + ' cursor-default text-foreground/80'} style={t.done}>
                  <Check className="h-3 w-3 flex-shrink-0" style={{ color: 'var(--gold-dark)' }} strokeWidth={3} aria-hidden />
                  {o}
                </span>
              ))}
            </div>
          ) : null,
        )}
      </div>
    );
  }

  const instant = isInstantChoice(questions);
  const send = (text: string) => {
    const msg = text.trim();
    if (!msg || disabled) return;
    setSent(msg);
    onSubmit(msg);
  };
  const ready = hasPicks(selections);

  return (
    <div className="w-full max-w-[92%] space-y-2.5" role="group" aria-label="Suggested answers">
      {questions.map((q, qi) => {
        const labelId = `${baseId}-q${qi}`;
        const picked = selections[q.id] ?? [];
        return (
          <div key={q.id} role="group" aria-labelledby={q.label ? labelId : undefined} className="space-y-1.5">
            {q.label && (
              <div id={labelId} className="text-[11px] font-semibold text-muted-foreground">
                {q.label}
                {q.multiple && <span className="font-normal"> · pick any</span>}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              {q.options.map((o) => {
                const on = picked.includes(o);
                return instant ? (
                  <button
                    key={o}
                    type="button"
                    disabled={disabled}
                    onClick={() => send(o)}
                    className={PILL + ' hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50'}
                    style={{ ...t.idle, ...ring }}
                  >
                    {o}
                  </button>
                ) : (
                  <button
                    key={o}
                    type="button"
                    aria-pressed={on}
                    disabled={disabled}
                    onClick={() => setSelections((s) => toggleChoice(questions, s, q.id, o))}
                    className={
                      PILL +
                      ' disabled:cursor-not-allowed disabled:opacity-50 ' +
                      (on ? t.pickedClass : 'hover:bg-muted')
                    }
                    style={{ ...(on ? t.picked : t.idle), ...ring }}
                  >
                    {on && <Check className="h-3 w-3 flex-shrink-0" strokeWidth={3} aria-hidden />}
                    {o}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      {!instant && (
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <button
            type="button"
            disabled={!ready || disabled}
            onClick={() => send(composeAnswer(questions, selections))}
            className="inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold text-primary-foreground transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: GOLD, ...ring }}
          >
            <Send className="h-3.5 w-3.5" aria-hidden /> Send
          </button>
          <span className="text-[11px] text-muted-foreground">or type your own reply below</span>
        </div>
      )}
    </div>
  );
}
