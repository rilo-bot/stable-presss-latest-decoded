// ---------------------------------------------------------------------------
// The Stable Hand — an ORGANISATION's page (/orgs/:id).
//
//   org.read          name, your role, members, managed parties, horses.
//   org.addMember     CONFIRMS, then fills "Invite a member (by email)": types
//                     the email, picks the role, presses Add — orgStore.addMember
//                     → POST /api/organisations/:id/members, as a click would.
//                     Owners and managers only (the form is hidden otherwise);
//                     only an owner may grant manager / owner.
//   org.removeMember  CONFIRMS, then presses that member's bin. Owners only,
//                     never yourself — exactly as the page offers it.
//
// Catalog: apps/server/src/lib/agent/operator/catalog/site.ts — keep in step.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { useAgentAction } from '@/agent/operator/runtime/registry';
import { PARTY_ROLE_LABELS } from '@/types/party';
import type { Horse } from '@/types/horse';
import type { OrgDetail } from '@/stores/orgStore';
import type { OrgRole } from '@/rbac/roles';
import { useOrgStore } from '@/stores/orgStore';
import { anchor, firstError, normKey, resolveOne, sleep, useLive, waitUntil, watchToasts } from './siteUtils';

export interface OrgPageState {
  orgId: string;
  detail: OrgDetail | null;
  myRole: OrgRole | undefined;
  canManage: boolean;
  isOwner: boolean;
  myUserId: string | undefined;
  horses: Horse[];
}

const ROLES = ['member', 'manager', 'owner'] as const;

export function useOrgOperatorActions(state: OrgPageState): void {
  const live = useLive(state);
  const detailNow = () => {
    const d = useOrgStore.getState().detail;
    return d && d.org.id === live.current.orgId ? d : null;
  };
  const orgName = () => live.current.detail?.org.name ?? 'this organisation';

  useAgentAction({
    name: 'org.read',
    description: 'Read the organisation: your role, members, managed parties and horses in scope.',
    args: z.object({}),
    run: async () => {
      const s = live.current;
      const d = s.detail;
      if (!d) throw new Error('The organisation has not loaded (or you are not a member).');
      return {
        id: d.org.id,
        name: d.org.name,
        description: d.org.description ?? null,
        myRole: s.myRole ?? null,
        members: d.members.map((m) => ({ name: m.name, email: m.email, role: m.role, ...(m.userId === s.myUserId ? { you: true } : {}) })),
        managedParties: d.parties.map((p) => ({ name: p.name, role: PARTY_ROLE_LABELS[p.role] ?? p.role })),
        horses: s.horses.map((h) => h.name),
        canAddMembers: s.canManage,
        canRemoveMembers: s.isOwner,
      };
    },
  });

  useAgentAction<{ email: string; role?: OrgRole }>(
    {
      name: 'org.addMember',
      description: 'Add a member by email (they need a Stable Press account) with a role (asks to confirm).',
      args: z.object({ email: z.string().trim().email(), role: z.enum(ROLES).optional() }),
      confirm: (a) => {
        // Illegal / no-op → no card; run() throws the same reason before touching anything.
        const role = a.role ?? 'member';
        if (role !== 'member' && !live.current.isOwner) return null;
        if (detailNow()?.members.some((m) => normKey(m.email) === normKey(a.email))) return null;
        // POST /members with role 'owner' MOVES ownership (server demotes you to manager).
        if (role === 'owner') {
          return `Make ${a.email} the OWNER of ${orgName()}? This transfers ownership — you become a manager and can no longer remove members.`;
        }
        return `Add ${a.email} to ${orgName()} as ${role}? They get access to the organisation's entries and horses.`;
      },
      run: async (a, ui) => {
        const role = a.role ?? 'member';
        if (role !== 'member' && !live.current.isOwner) throw new Error('Only an owner can add managers or owners.');
        const d = detailNow();
        if (d?.members.some((m) => normKey(m.email) === normKey(a.email))) throw new Error(`${a.email} is already a member.`);
        await ui.type('member.org-member-email', a.email, { clear: true });
        // Always set the role: the select keeps whatever the user last picked, so
        // skipping it for 'member' could add a manager — or transfer ownership.
        await ui.select('member.org-member-role', role);
        const toasts = watchToasts();
        await ui.waitFor('member.org-member-add', 2000);
        await ui.click('member.org-member-add', 'Add');
        const ok = await waitUntil(
          () => !!detailNow()?.members.some((m) => normKey(m.email) === normKey(a.email)) || !!firstError(toasts.collect()),
          { timeoutMs: 15_000, signal: ui.signal },
        );
        await sleep(150, ui.signal);
        const err = firstError(toasts.collect());
        const added = detailNow()?.members.find((m) => normKey(m.email) === normKey(a.email));
        if (!added) throw new Error(err ?? (ok ? 'The member was not added.' : 'Adding the member is taking too long.'));
        if (anchor(`member.org-member-${added.userId}`)) ui.flash(`member.org-member-${added.userId}`);
        return { ok: true, added: { name: added.name, email: added.email, role: added.role }, members: detailNow()?.members.length };
      },
    },
    state.canManage,
  );

  useAgentAction<{ member: string }>(
    {
      name: 'org.removeMember',
      description: 'Remove a member (by email or name) from the organisation (asks to confirm).',
      args: z.object({ member: z.string().trim().min(1).max(160) }),
      confirm: (a) => {
        // Same source + checks as run(), which follows synchronously: anything run()
        // would refuse (not loaded / no unique match / yourself) gets no card.
        const d = detailNow();
        if (!d) return null;
        try {
          const m = resolveOne(a.member, d.members, (x) => [x.userId, x.email, x.name], 'member', (x) => x.email);
          if (m.userId === live.current.myUserId) return null;
          return `Remove ${m.name} (${m.email}) from ${orgName()}? They lose access to its entries and horses.`;
        } catch {
          return null; // run() reports the bad name
        }
      },
      run: async (a, ui) => {
        const d = detailNow();
        if (!d) throw new Error('The organisation has not loaded.');
        const m = resolveOne(a.member, d.members, (x) => [x.userId, x.email, x.name], 'member', (x) => `${x.name} <${x.email}>`);
        if (m.userId === live.current.myUserId) throw new Error('You cannot remove yourself here.');
        const toasts = watchToasts();
        await ui.click(`member.org-member-remove-${m.userId}`, `Remove ${m.name}`);
        const ok = await waitUntil(
          () => !detailNow()?.members.some((x) => x.userId === m.userId) || !!firstError(toasts.collect()),
          { timeoutMs: 15_000, signal: ui.signal },
        );
        const err = firstError(toasts.collect());
        if (detailNow()?.members.some((x) => x.userId === m.userId)) throw new Error(err ?? (ok ? 'The member was not removed.' : 'Removing is taking too long.'));
        return { ok: true, removed: { name: m.name, email: m.email }, members: detailNow()?.members.map((x) => x.email) };
      },
    },
    state.isOwner,
  );
}
