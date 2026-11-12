// ---------------------------------------------------------------------------
// The Stable Hand — the MEMBER DASHBOARD (/dashboard).
//
//   member.read           roles you hold, My Stable, followed horses, your
//                         organisations, and what you can do here.
//   member.claimRole      CONFIRMS, then works "Find yourself in the register":
//                         picks the role chip and presses "This is me" on the
//                         entry — partyStore.claimParty → POST
//                         /api/parties/:id/claim, as a click would. Claiming is
//                         immediate. Gated like the UI: only an account that is
//                         not staff and has no claimed entry sees that section.
//   member.registerHorse  "Add a horse": with a name it fills the Quick form
//                         (HorseForm, member mode) and presses Save; without one
//                         it starts the Guided studio (an un-named draft) and
//                         lands in /studio/horse/:id. Gated like the UI: needs a
//                         claimed entry.
//   member.createOrg      types a name into "New organisation name" → Create.
//
// Catalog: apps/server/src/lib/agent/operator/catalog/site.ts — keep in step.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { useAgentAction } from '@/agent/operator/runtime/registry';
import { actionError, quoteRef } from '@/agent/operator/runtime/humanRef';
import type { UiDriver } from '@/agent/operator/contracts';
import { useAuthStore } from '@/stores/authStore';
import { useHorseStore } from '@/stores/horseStore';
import { useFollowStore } from '@/stores/followStore';
import { PARTY_ROLE_LABELS, type PartyRole } from '@/types/party';
import type { Horse } from '@/types/horse';
import type { PartyRow } from '@/stores/authStore';
import type { OrgSummary } from '@/stores/orgStore';
import { SEX_OPTIONS, COLOUR_OPTIONS, COUNTRY_OPTIONS } from '@/components/horse-form/constants';
import { partyRole } from './useDirectoryOperatorActions';
import { anchor, firstError, normKey, resolveOne, sleep, typeField, useLive, waitUntil, watchToasts } from './siteUtils';

export const claimRoleChipId = (r: string) => `member.claim-role-${r.replace(/ /g, '-')}`;

export interface MemberDashState {
  admin: boolean;
  myPartyId: string | undefined;
  claimRole: PartyRole;
  claimable: PartyRow[];
  claims: PartyRow[];
  stableHorses: Horse[];
  orgs: OrgSummary[];
}

function pickOption(value: string | undefined, options: string[], what: string): string | undefined {
  if (!value) return undefined;
  const hit = options.find((o) => normKey(o) === normKey(value));
  if (!hit) throw new Error(`"${value}" is not a ${what}. Choose one of: ${options.join(', ')}.`);
  return hit;
}

const ensureOpen = async (ui: UiDriver, toggleId: string) => {
  if (!anchor(toggleId) || anchor(toggleId)?.getAttribute('aria-expanded') === 'true') return;
  await ui.click(toggleId, 'Open section');
  await waitUntil(() => anchor(toggleId)?.getAttribute('aria-expanded') === 'true', { timeoutMs: 1500, signal: ui.signal });
};

const registerArgs = z.object({
  name: z.string().trim().max(120).optional(),
  sex: z.string().optional(),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dob must be YYYY-MM-DD').optional(),
  colour: z.string().optional(),
  country: z.string().optional(),
  sire: z.string().max(120).optional(),
  dam: z.string().max(120).optional(),
});
type RegisterArgs = z.infer<typeof registerArgs>;

export function useMemberOperatorActions(state: MemberDashState): void {
  const live = useLive(state);
  const canClaim = !state.admin && !state.myPartyId;
  const canRegister = !!state.myPartyId;

  useAgentAction({
    name: 'member.read',
    description: 'Read the dashboard: your racing roles, My Stable, followed horses, organisations, and what you can do here.',
    args: z.object({}),
    run: async () => {
      const s = live.current;
      const user = useAuthStore.getState().currentUser;
      const horses = useHorseStore.getState().horses ?? [];
      const followed = useFollowStore.getState().followedHorseIds;
      return {
        name: user?.name ?? null,
        racingRoles: s.claims.map((c) => ({
          role: PARTY_ROLE_LABELS[c.role] ?? c.role,
          entry: c.name,
          horse: c.horseId ? horses.find((h) => h.id === c.horseId)?.name ?? c.horseId : null,
        })),
        myProfilePath: s.myPartyId ? `/studio/${s.myPartyId}` : null,
        myStable: s.stableHorses.map((h) => ({ name: h.name || 'Un-Named', studioPath: `/studio/horse/${h.id}` })),
        followedHorses: horses.filter((h) => followed.includes(h.id)).map((h) => ({ name: h.name, path: `/horses/${h.id}` })),
        organisations: s.orgs.map((o) => ({ name: o.name, myRole: o.myRole, path: `/orgs/${o.id}` })),
        canClaimRole: !s.admin && !s.myPartyId,
        claimShortlist: !s.admin && !s.myPartyId ? { role: s.claimRole, entries: s.claimable.map((p) => p.name) } : null,
        canRegisterHorse: !!s.myPartyId,
        ...(s.admin && !s.myPartyId
          ? { note: 'Staff accounts do not see "Find yourself in the register", and "Add a horse" needs a claimed entry.' }
          : {}),
      };
    },
  });

  useAgentAction<{ role: string; entry: string }>(
    {
      name: 'member.claimRole',
      description: 'Claim your entry in the register under a racing role (asks to confirm; takes effect at once).',
      args: z.object({ role: z.string().min(1).max(40), entry: z.string().min(1).max(120) }),
      confirm: (a) => {
        let role: string;
        try {
          role = PARTY_ROLE_LABELS[partyRole(a.role)];
        } catch {
          return null; // not a role: run() throws on its first line, before any click
        }
        // NOTE: the entry is not pre-checked here — run() resolves it only after
        // switching the role chip, so a "no match" here could be stale; keep the card.
        // The model may pass the entry's id: name it as the shortlist does.
        const listed = live.current.claimable.find((p) => p.id === a.entry.trim());
        const entry = listed?.name ? `“${listed.name}”` : quoteRef(a.entry, 'this register entry');
        return `Claim ${entry} as your ${role.toLowerCase()} entry? It takes effect straight away and links your account to that register entry and its horses.`;
      },
      run: async (a, ui) => {
        const role = partyRole(a.role);
        if (live.current.claimRole !== role) {
          await ui.click(claimRoleChipId(role), PARTY_ROLE_LABELS[role]);
          await waitUntil(() => live.current.claimRole === role, { timeoutMs: 1500, signal: ui.signal });
        }
        const pool = live.current.claimable;
        if (!pool.length) throw new Error(`No unclaimed ${PARTY_ROLE_LABELS[role].toLowerCase()} entries — an administrator has to add you to the register first.`);
        const hit = resolveOne(a.entry, pool, (p) => [p.id, p.name], `unclaimed ${PARTY_ROLE_LABELS[role].toLowerCase()} entry`, (p) => p.name);
        const toasts = watchToasts();
        await ui.click(`member.claim-${hit.id}`, `This is me — ${hit.name}`);
        const done = await waitUntil(
          () => window.location.pathname.startsWith('/studio/') || !!firstError(toasts.collect()),
          { timeoutMs: 15_000, signal: ui.signal },
        );
        const err = firstError(toasts.collect());
        if (err) throw new Error(err);
        if (!done) throw new Error('The claim is taking too long — check the dashboard.');
        return { ok: true, claimed: hit.name, role: PARTY_ROLE_LABELS[role], nowOn: window.location.pathname };
      },
    },
    canClaim,
  );

  useAgentAction<RegisterArgs>(
    {
      name: 'member.registerHorse',
      description: 'Register a horse in your stable: with a name it fills and saves the Quick form; without one it starts the Guided studio.',
      args: registerArgs,
      run: async (a, ui) => {
        const sex = pickOption(a.sex, SEX_OPTIONS, 'sex');
        const colour = pickOption(a.colour, COLOUR_OPTIONS, 'colour');
        const country = pickOption(a.country, COUNTRY_OPTIONS, 'country');
        const before = new Set((useHorseStore.getState().horses ?? []).map((h) => h.id));

        await ui.click('member.add-horse', 'Add a horse');
        if (!a.name) {
          await ui.waitFor('reg.add-horse-guided', 4000);
          await ui.click('reg.add-horse-guided', 'Guided studio');
          await ui.waitForRoute('/studio/horse/', 20_000);
          return {
            ok: true,
            mode: 'guided',
            studioPath: window.location.pathname,
            next: 'The onboarding guide is open — use onboarding.read / onboarding.completeStep / onboarding.next.',
          };
        }
        const dupe = (useHorseStore.getState().horses ?? []).find((h) => normKey(h.name) === normKey(a.name));
        if (dupe) {
          throw actionError(`“${dupe.name}” is already in the register — open their page instead (see detail).`, {
            horseId: dupe.id,
            path: `/horses/${dupe.id}`,
          });
        }

        await ui.waitFor('reg.add-horse-quick', 4000);
        await ui.click('reg.add-horse-quick', 'Quick form');
        await ui.waitFor('reg.horse-form', 5000);
        // A half-filled Quick-form draft (localStorage) would leak its other fields
        // into this horse, so it is discarded — and reported, so it is no surprise.
        const discardedDraft = !!anchor('reg.horse-discard-draft');
        if (discardedDraft) await ui.click('reg.horse-discard-draft', 'Discard the old draft');
        await typeField(ui, 'reg.horse-name', a.name);
        if (sex) await ui.select('reg.horse-sex', sex);
        if (a.dob) await typeField(ui, 'reg.horse-dob', a.dob);
        if (colour) await ui.select('reg.horse-colour', colour);
        if (country) await ui.select('reg.horse-country', country);
        if (a.sire || a.dam) {
          await ensureOpen(ui, 'reg.horse-section-pedigree');
          if (a.sire) await typeField(ui, 'reg.horse-sire', a.sire);
          if (a.dam) await typeField(ui, 'reg.horse-dam', a.dam);
        }
        await sleep(120, ui.signal);
        const toasts = watchToasts();
        await ui.click('reg.horse-save', 'Save');
        const closed = await waitUntil(() => !anchor('reg.horse-form') || !!firstError(toasts.collect()), { timeoutMs: 45_000, signal: ui.signal });
        const err = firstError(toasts.collect());
        if (!closed || anchor('reg.horse-form')) throw new Error(err ?? 'The horse form did not save — it is still open to check.');
        const created = (useHorseStore.getState().horses ?? []).find((h) => !before.has(h.id) && normKey(h.name) === normKey(a.name));
        await waitUntil(() => !!created && live.current.stableHorses.some((h) => h.id === created.id), { timeoutMs: 3000, signal: ui.signal });
        if (created && anchor(`member.stable-horse-${created.id}`)) ui.flash(`member.stable-horse-${created.id}`);
        return {
          ok: true,
          mode: 'quick',
          horse: created ? { id: created.id, name: created.name, studioPath: `/studio/horse/${created.id}`, publicPath: `/horses/${created.id}` } : a.name,
          inMyStable: !!created && live.current.stableHorses.some((h) => h.id === created.id),
          ...(discardedDraft ? { discardedDraft: true, note: 'An unsaved Quick-form draft was discarded to start this horse clean — tell the user.' } : {}),
        };
      },
    },
    canRegister,
  );

  useAgentAction<{ name: string }>({
    name: 'member.createOrg',
    description: 'Create an organisation (you become its owner) and open it.',
    args: z.object({ name: z.string().trim().min(1).max(120) }),
    run: async (a, ui) => {
      await ui.type('member.org-name', a.name, { clear: true });
      await ui.waitFor('member.org-create', 2000);
      const toasts = watchToasts();
      await ui.click('member.org-create', 'Create');
      const ok = await waitUntil(() => window.location.pathname.startsWith('/orgs/') || !!firstError(toasts.collect()), { timeoutMs: 15_000, signal: ui.signal });
      const err = firstError(toasts.collect());
      if (err) throw new Error(err);
      if (!ok) throw new Error('Creating the organisation is taking too long.');
      return { ok: true, organisation: a.name, path: window.location.pathname };
    },
  });
}
