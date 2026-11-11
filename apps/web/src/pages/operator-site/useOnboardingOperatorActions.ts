// ---------------------------------------------------------------------------
// The Stable Hand — the member ONBOARDING guide (components/profile/
// OnboardingFocus.tsx): the centred step card a new horse or profile walks
// through in the studio (/studio/horse/:id, /studio/:id).
//
//   onboarding.read          the step on screen: title, tips, number, and the
//                            fields / controls the card holds (with values).
//   onboarding.completeStep  fills the card the way a person does: clicks each
//                            field, types (or picks) the value and commits it
//                            (the same InlineEditRow → store update → PUT the UI
//                            makes); on a connection step, types the name and
//                            presses Link. The guide moves on by itself once the
//                            step's own "done" rule is met.
//   onboarding.next          presses Skip (the step is remembered as skipped).
//   onboarding.close         closes the guided journey (anything entered is
//                            already saved; the checklist stays).
//
// The card's fields carry no anchors of their own (they are shared studio
// widgets), so tagCard() stamps data-agent-id on them inside the card only:
// onboarding.field-<label>, onboarding.input-<label>, onboarding.photo-input,
// onboarding.connection-name, onboarding.connection-link, onboarding.add-horse.
//
// Catalog: apps/server/src/lib/agent/operator/catalog/site.ts — keep in step.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { useAgentAction } from '@/agent/operator/runtime/registry';
import type { UiDriver } from '@/agent/operator/contracts';
import { AGENT_ID_ATTR, AGENT_LABEL_ATTR } from '@/agent/operator/contracts';
import { anchor, firstError, normKey, sleep, useLive, waitUntil, watchToasts } from './siteUtils';

export const ONB_CARD = 'onboarding.card';
const slug = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function setId(el: Element | null | undefined, id: string, label?: string) {
  if (!el) return;
  if (el.getAttribute(AGENT_ID_ATTR) !== id) el.setAttribute(AGENT_ID_ATTR, id);
  if (label && el.getAttribute(AGENT_LABEL_ATTR) !== label) el.setAttribute(AGENT_LABEL_ATTR, label);
}

/** Stamp anchors on the controls inside the onboarding card (idempotent). */
export function tagCard(root: HTMLElement): void {
  for (const dt of root.querySelectorAll('dt')) {
    const row = dt.parentElement;
    const label = (dt.textContent ?? '').trim();
    if (!row || !label) continue;
    const dd = row.querySelector('dd');
    const s = slug(label);
    setId(dd?.querySelector('button'), `onboarding.field-${s}`, `Edit ${label}`);
    setId(dd?.querySelector('input, select, textarea'), `onboarding.input-${s}`, label);
  }
  const nameInput = root.querySelector<HTMLInputElement>('input[list], input[placeholder$="name…"]');
  setId(nameInput, 'onboarding.connection-name', nameInput?.placeholder || 'Name');
  for (const b of root.querySelectorAll('button')) {
    const t = (b.textContent ?? '').trim();
    if (/^link$/i.test(t)) setId(b, 'onboarding.connection-link', 'Link');
    else if (/add a horse/i.test(t)) setId(b, 'onboarding.add-horse', 'Add a horse');
  }
  const file = root.querySelector('input[type="file"]');
  if (file && !nameInput) setId(file, 'onboarding.photo-input', 'Photo');
}

interface FieldInfo {
  label: string;
  value: string;
  kind: 'select' | 'date' | 'number' | 'text' | 'readonly';
  options?: string[];
}

function cardFields(): FieldInfo[] {
  const card = anchor(ONB_CARD);
  if (!card) return [];
  tagCard(card);
  const out: FieldInfo[] = [];
  for (const dt of card.querySelectorAll('dt')) {
    const label = (dt.textContent ?? '').trim();
    const dd = dt.parentElement?.querySelector('dd');
    if (!label || !dd) continue;
    const ctl = dd.querySelector<HTMLInputElement | HTMLSelectElement>('input, select');
    const btn = dd.querySelector('button');
    let value = ctl ? ctl.value : (dd.textContent ?? '').trim();
    if (!ctl && value.toLowerCase() === `add ${label.toLowerCase()}`) value = '';
    if (value === '—') value = '';
    const kind: FieldInfo['kind'] = ctl
      ? ctl instanceof HTMLSelectElement ? 'select' : ((ctl.type as FieldInfo['kind']) ?? 'text')
      : btn ? 'text' : 'readonly';
    out.push({ label, value, kind, ...(ctl instanceof HTMLSelectElement ? { options: [...ctl.options].map((o) => o.value).filter(Boolean) } : {}) });
  }
  return out;
}

const ALIASES: Record<string, string[]> = {
  foaled: ['dob', 'dateofbirth', 'foalingdate', 'foaldate', 'birthdate'],
  dateofbirth: ['dob', 'birthdate', 'born'],
  baselocation: ['base', 'location', 'basedat'],
  countryofbirth: ['country', 'birthcountry'],
  fullname: ['name'],
  sire: ['father'],
  dam: ['mother'],
};

function matchLabel(want: string, labels: string[]): string {
  const k = normKey(want);
  const exact = labels.find((l) => normKey(l) === k);
  if (exact) return exact;
  const alias = labels.find((l) => (ALIASES[normKey(l)] ?? []).includes(k));
  if (alias) return alias;
  const partial = labels.filter((l) => normKey(l).startsWith(k));
  if (partial.length === 1) return partial[0];
  throw new Error(`This step has no field "${want}". Fields here: ${labels.join(', ') || 'none'}.`);
}

function setNative(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Open one InlineEditRow, enter the value, and commit it (blur / select). */
async function fillField(ui: UiDriver, label: string, value: string, kind: FieldInfo['kind']): Promise<void> {
  const s = slug(label);
  const inputId = `onboarding.input-${s}`;
  if (!anchor(inputId)) {
    await ui.click(`onboarding.field-${s}`, `Edit ${label}`);
    const card = anchor(ONB_CARD);
    await waitUntil(() => {
      if (card) tagCard(card);
      return !!anchor(inputId);
    }, { timeoutMs: 2000, signal: ui.signal });
  }
  const ctl = anchor<HTMLInputElement | HTMLSelectElement>(inputId);
  if (!ctl) throw new Error(`Could not open the ${label} field.`);
  if (ctl instanceof HTMLSelectElement || kind === 'select') {
    await ui.select(inputId, value); // its onChange commits
  } else if (ctl.type === 'date' || ctl.type === 'number') {
    await ui.point(inputId, `${label}: ${value}`);
    ctl.focus();
    setNative(ctl, value);
    await sleep(80, ui.signal);
    ctl.blur();
  } else {
    await ui.type(inputId, value, { clear: true });
    await sleep(60, ui.signal);
    const el = anchor<HTMLInputElement>(inputId);
    if (el) {
      el.focus();
      el.blur(); // InlineEditRow saves on blur
    }
  }
  await waitUntil(() => !anchor(inputId), { timeoutMs: 3000, signal: ui.signal });
  await sleep(250, ui.signal); // let the save land and the card re-render
}

export interface OnboardingFocusState {
  open: boolean;
  stepKey: string;
  stepIndex: number;
  total: number;
  title: string;
  tips?: string[];
  skippable?: boolean;
  canClose: boolean;
}

export function useOnboardingOperatorActions(state: OnboardingFocusState): void {
  const live = useLive(state);

  const stepInfo = () => {
    const s = live.current;
    const card = anchor(ONB_CARD);
    if (card) tagCard(card);
    return {
      step: s.stepKey,
      number: s.stepIndex + 1,
      of: s.total,
      title: s.title,
      tips: s.tips ?? [],
      cardOnScreen: s.open && !!card,
      fields: cardFields(),
      photoUpload: !!anchor('onboarding.photo-input'),
      connectionName: !!anchor('onboarding.connection-name'),
      addHorseButton: !!anchor('onboarding.add-horse'),
      skippable: !!s.skippable,
    };
  };
  const requireCard = () => {
    if (!live.current.open || !anchor(ONB_CARD)) {
      throw new Error('The onboarding card is hidden while the Stable Studio chat is open — close the chat (profile.studio-close) first.');
    }
  };
  /** Wait for the guide to move past `from` (or finish). */
  const advanced = async (ui: UiDriver, from: string, timeoutMs = 4000) => {
    await waitUntil(() => live.current.stepKey !== from || !anchor(ONB_CARD), { timeoutMs, signal: ui.signal });
    await sleep(450, ui.signal); // the card swap animation
    const finished = !anchor(ONB_CARD) && !document.querySelector('[data-agent-id="onboarding.skip"]');
    return finished ? { finished: true } : { finished: false, now: stepInfo() };
  };

  useAgentAction({
    name: 'onboarding.read',
    description: 'Read the onboarding step on screen: title, tips, step number, and its fields / controls with their values.',
    args: z.object({}),
    run: async () => stepInfo(),
  });

  useAgentAction<{ fields?: Record<string, string>; name?: string }>({
    name: 'onboarding.completeStep',
    description: 'Fill the current onboarding step: fields by label (e.g. {Sex:"Mare", Foaled:"2021-09-01"}) or, on a connection step, the person to link.',
    args: z
      .object({ fields: z.record(z.string(), z.string()).optional(), name: z.string().trim().min(1).max(120).optional() })
      .refine((a) => (a.fields && Object.keys(a.fields).length > 0) || a.name, { message: 'Pass fields (label → value) or name.' }),
    run: async (a, ui) => {
      requireCard();
      const from = live.current.stepKey;
      const applied: string[] = [];
      const notApplied: string[] = [];
      const toasts = watchToasts();

      if (a.fields) {
        const labels = cardFields().filter((f) => f.kind !== 'readonly').map((f) => f.label);
        // Validate every name before touching the screen.
        const plan = Object.entries(a.fields).map(([k, v]) => ({ label: matchLabel(k, labels), value: v }));
        for (const p of plan) {
          if (live.current.stepKey !== from || !anchor(ONB_CARD)) {
            notApplied.push(p.label); // the step completed and the card moved on
            continue;
          }
          const info = cardFields().find((f) => f.label === p.label);
          if (!info) {
            notApplied.push(p.label);
            continue;
          }
          await fillField(ui, p.label, p.value, info.kind);
          applied.push(`${p.label} = ${p.value}`);
        }
      }

      if (a.name) {
        if (!anchor('onboarding.connection-name')) throw new Error('This step has no name box — it is not a connection step. Use fields, or upload / skip.');
        await ui.type('onboarding.connection-name', a.name, { clear: true });
        await ui.waitFor('onboarding.connection-link', 2000);
        await ui.click('onboarding.connection-link', `Link ${a.name}`);
        await waitUntil(() => live.current.stepKey !== from || !!firstError(toasts.collect()), { timeoutMs: 15_000, signal: ui.signal });
        applied.push(`linked ${a.name}`);
      }

      const err = firstError(toasts.collect());
      if (err) throw new Error(err);
      const next = await advanced(ui, from, 2500);
      return {
        ok: true,
        step: from,
        applied,
        ...(notApplied.length ? { notApplied, note: 'The step completed before these were entered; they belong to a later step or the profile.' } : {}),
        stepComplete: live.current.stepKey !== from || next.finished,
        ...next,
      };
    },
  });

  useAgentAction({
    name: 'onboarding.next',
    description: 'Skip the current onboarding step (press Skip) and move to the next one.',
    args: z.object({}),
    run: async (_a, ui) => {
      requireCard();
      const from = live.current.stepKey;
      await ui.click('onboarding.skip', 'Skip');
      return { skipped: from, ...(await advanced(ui, from)) };
    },
  });

  useAgentAction(
    {
      name: 'onboarding.close',
      description: 'Close the guided onboarding journey (what was entered is saved; the checklist stays).',
      args: z.object({}),
      run: async (_a, ui) => {
        requireCard();
        await ui.click('onboarding.close', 'Close the guide');
        await waitUntil(() => !anchor(ONB_CARD), { timeoutMs: 3000, signal: ui.signal });
        return { closed: !anchor(ONB_CARD) };
      },
    },
    state.canClose,
  );
}
