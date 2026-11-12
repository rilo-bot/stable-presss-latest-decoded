// ---------------------------------------------------------------------------
// Stablehand Operator — PROFILE / HORSE STUDIO pack (/studio/:id and
// /studio/horse/:id, edit mode).
//
// Called by BOTH Stable Studio chat surfaces — the right-side ProfileAgentPanel
// and, during onboarding, the OnboardingGuide popover. Exactly one is mounted at
// a time, both own a useProfileChatSession, and both carry the same
// `profile.studio-*` anchors, so these actions work whichever one is live.
//
// The Operator does not edit profile fields itself. It TALKS to the studio
// assistant the way the member would — types the prompt into the composer and
// presses Send — waits for the reply, and reports what the studio staged or
// changed. Applying staged proposals clicks the studio's own Apply buttons
// (applyProposals.ts → horseStore/peopleStore/partyStore, undo recorded), and
// asks the user first because it writes to the profile.
//
// Catalog: apps/server/src/lib/agent/operator/catalog/profile.ts — keep in step.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import type { UIMessage } from 'ai';
import { useAgentAction } from '@/agent/operator/runtime/registry';
import type { UiDriver } from '@/agent/operator/contracts';
import { useProfileAgentUi, type Proposal } from '@/stores/profileAgentUiStore';
import { humanizeKey } from '@/agent/operator/runtime/humanRef';
import { PARTY_ROLE_LABELS } from '@/types/party';
import {
  anchor,
  firstError,
  sleep,
  useLive,
  waitUntil,
  watchToasts,
} from '@/pages/production-system/operator-team/opUtils';

interface StudioOperatorInput {
  messages: UIMessage[];
  status: string;
  stop: () => void;
}

const isBusy = (status: string) => status === 'submitted' || status === 'streaming';

function proposalJson(p: Proposal) {
  return p.kind === 'field'
    ? { id: p.id, kind: 'field' as const, field: p.field, value: p.value, note: p.note ?? null }
    : {
        id: p.id,
        kind: 'connection' as const,
        role: p.role,
        person: p.partyName,
        from: p.startYear ?? null,
        to: p.present ? 'present' : p.endYear ?? null,
      };
}

/** A staged suggestion as the confirm card names it: 'dateOfBirth' → 'date of
 *  birth', 'trainer' → 'Trainer' — the words a person reads, not field keys. */
const proposalName = (p: Proposal) =>
  p.kind === 'field' ? humanizeKey(p.field) : `${PARTY_ROLE_LABELS[p.role] ?? p.role}: ${p.partyName}`;

/** Open the Stable Studio chat (drawer or onboarding popover) if it is closed. */
async function ensureStudioOpen(ui: UiDriver) {
  if (anchor('profile.studio-input')) return;
  if (anchor('profile.studio-launcher')) await ui.click('profile.studio-launcher', 'Open AI Studio');
  else useProfileAgentUi.getState().setOpen(true);
  await ui.waitFor('profile.studio-input', 5000);
}

function selectStaged(ids: string[] | undefined): Proposal[] {
  const staged = useProfileAgentUi.getState().staged;
  return ids?.length ? staged.filter((p) => ids.includes(p.id)) : staged;
}

export function useStudioOperatorActions(input: StudioOperatorInput): void {
  const live = useLive(input);

  useAgentAction({
    name: 'profile.read',
    description: 'Read the open profile/horse studio: its fields, which are empty, and any staged suggestions.',
    args: z.object({}),
    run: async () => {
      const st = useProfileAgentUi.getState();
      if (!st.context) throw new Error('No profile is open in the studio yet.');
      return {
        kind: st.context.entityKind,
        id: st.context.entityId,
        name: st.context.name,
        fields: st.context.fields,
        emptyFields: st.context.emptyFields,
        connections: st.context.roleBoxes ?? [],
        staged: st.staged.map(proposalJson),
        canUndo: st.undo.length,
      };
    },
  });

  useAgentAction<{ prompt: string }>({
    name: 'profile.askStudio',
    description:
      'Ask the Stable Studio assistant on this profile to do something (e.g. "fill the pedigree"); waits for its reply and returns it with the fields/connections it changed (the studio edits directly; profile.undo reverts).',
    args: z.object({ prompt: z.string().trim().min(1).max(2000) }),
    run: async (a, ui) => {
      if (isBusy(live.current.status)) throw new Error('The studio assistant is still answering — wait, then ask again.');
      const before = useProfileAgentUi.getState().context?.fields ?? {};
      const connBefore = new Map((useProfileAgentUi.getState().context?.roleBoxes ?? []).map((b) => [b.role, b.count]));
      const stagedBefore = new Set(useProfileAgentUi.getState().staged.map((p) => p.id));
      const sentAt = live.current.messages.length;

      ui.step('Asking the Stable Studio assistant');
      await ensureStudioOpen(ui);
      await ui.type('profile.studio-input', a.prompt, { clear: true });
      await ui.click('profile.studio-send', 'Send');

      try {
        // It starts (or at least the user message lands) …
        await waitUntil(() => isBusy(live.current.status) || live.current.messages.length > sentAt, {
          timeoutMs: 8000,
          signal: ui.signal,
        });
        // … then settles. Tool round-trips flip busy→ready→busy, so require a
        // quiet spell before calling it done.
        let quietSince = 0;
        const done = await waitUntil(
          () => {
            if (isBusy(live.current.status)) {
              quietSince = 0;
              return false;
            }
            if (!quietSince) quietSince = Date.now();
            return Date.now() - quietSince > 1500;
          },
          { timeoutMs: 180_000, intervalMs: 200, signal: ui.signal },
        );
        if (!done) throw new Error('The studio assistant is taking a long time — its reply will still appear in the panel.');
      } catch (e) {
        if ((e as Error).name === 'AbortError') live.current.stop();
        throw e;
      }
      await sleep(150, ui.signal);

      const after = useProfileAgentUi.getState();
      // One assistant message can hold several text parts (one per tool
      // round-trip) — keep them as separate paragraphs, not "now.Done".
      const reply = live.current.messages
        .slice(sentAt)
        .filter((m) => m.role === 'assistant')
        .flatMap((m) => (m.parts ?? []).map((p) => (p.type === 'text' ? p.text.trim() : '')))
        .filter(Boolean)
        .join('\n\n')
        .trim();
      const fieldsNow = after.context?.fields ?? {};
      const changed = Object.keys({ ...before, ...fieldsNow })
        .filter((k) => (before[k] ?? '') !== (fieldsNow[k] ?? ''))
        .map((k) => ({ field: k, from: before[k] ?? '', to: fieldsNow[k] ?? '' }));
      const connectionsChanged = (after.context?.roleBoxes ?? [])
        .map((b) => ({ role: b.role, from: connBefore.get(b.role) ?? 0, to: b.count }))
        .filter((c) => c.from !== c.to);
      return {
        reply: reply || (live.current.status === 'error' ? 'The studio assistant returned an error.' : '(no text reply)'),
        newSuggestions: after.staged.filter((p) => !stagedBefore.has(p.id)).map(proposalJson),
        allStaged: after.staged.length,
        changedDirectly: changed,
        connectionsChanged,
        canUndo: after.undo.length,
        note: after.staged.length
          ? 'Some suggestions are staged, not saved. Call profile.applyProposals to save them (the user is asked first).'
          : changed.length || connectionsChanged.length
            ? 'The studio applied these edits directly — they are saved. profile.undo reverts the last one.'
            : undefined,
      };
    },
  });

  const idsArg = z.object({ ids: z.array(z.string()).optional().describe('Proposal ids; omit for all staged') });
  useAgentAction<z.infer<typeof idsArg>>({
    name: 'profile.applyProposals',
    description: "Apply the studio's staged suggestions (all, or the given ids) — saves them to the profile; Undo can revert.",
    args: idsArg,
    confirm: (a) => {
      const st = useProfileAgentUi.getState();
      const pick = selectStaged(a.ids);
      if (!pick.length) return null;
      return `Save ${pick.length} suggested change(s) to ${st.context?.name || 'this profile'}: ${pick.map(proposalName).join(', ')}?`;
    },
    run: async (a, ui) => {
      const pick = selectStaged(a.ids);
      if (!pick.length) throw new Error('There are no staged suggestions to apply.');
      const ids = new Set(pick.map((p) => p.id));
      await ensureStudioOpen(ui);
      const toasts = watchToasts();
      const all = useProfileAgentUi.getState().staged;
      if (pick.length === all.length && all.length > 1 && anchor('profile.studio-apply-all')) {
        await ui.click('profile.studio-apply-all', 'Apply all');
      } else {
        for (const p of pick) {
          await ui.waitFor(`profile.proposal-apply-${p.id}`, 3000);
          await ui.click(`profile.proposal-apply-${p.id}`, `Apply ${proposalName(p)}`);
          await waitUntil(() => !useProfileAgentUi.getState().staged.some((x) => x.id === p.id), {
            timeoutMs: 20_000,
            signal: ui.signal,
          });
        }
      }
      await waitUntil(() => !useProfileAgentUi.getState().staged.some((x) => ids.has(x.id)), {
        timeoutMs: 30_000,
        signal: ui.signal,
      });
      const left = useProfileAgentUi.getState().staged.filter((x) => ids.has(x.id));
      const err = firstError(toasts.collect());
      return {
        ok: left.length === 0 && !err,
        applied: pick.filter((p) => !left.some((x) => x.id === p.id)).map(proposalJson),
        notApplied: left.map(proposalJson),
        error: err,
      };
    },
  });

  useAgentAction<z.infer<typeof idsArg>>({
    name: 'profile.discardProposals',
    description: "Discard the studio's staged suggestions (all, or the given ids). Nothing is saved.",
    args: idsArg,
    run: async (a, ui) => {
      const pick = selectStaged(a.ids);
      if (!pick.length) return { discarded: [] };
      await ensureStudioOpen(ui);
      const all = useProfileAgentUi.getState().staged;
      if (pick.length === all.length && all.length > 1 && anchor('profile.studio-discard-all')) {
        await ui.click('profile.studio-discard-all', 'Discard all');
      } else {
        for (const p of pick) await ui.click(`profile.proposal-discard-${p.id}`, `Discard ${proposalName(p)}`);
      }
      return { discarded: pick.map(proposalJson), remaining: useProfileAgentUi.getState().staged.length };
    },
  });

  useAgentAction({
    name: 'profile.undo',
    description: 'Undo the last change applied from the studio.',
    args: z.object({}),
    run: async (_a, ui) => {
      const n = useProfileAgentUi.getState().undo.length;
      if (!n) throw new Error('There is nothing to undo.');
      await ensureStudioOpen(ui);
      await ui.click('profile.studio-undo', 'Undo');
      await waitUntil(() => useProfileAgentUi.getState().undo.length < n, { timeoutMs: 15_000, signal: ui.signal });
      return { ok: useProfileAgentUi.getState().undo.length < n, remainingUndo: useProfileAgentUi.getState().undo.length };
    },
  });
}
