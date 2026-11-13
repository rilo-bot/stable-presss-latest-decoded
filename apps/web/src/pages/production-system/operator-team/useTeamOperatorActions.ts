// ---------------------------------------------------------------------------
// Stablehand Operator — TEAM pack (Production System → Team Members).
//
// Registered by TeamManagementView while it is mounted. Every write drives the
// screen's own controls with the UiDriver — the invite email box, the RoleSelect
// list, the Invite / Remove / Cancel buttons — so the user watches it happen and
// the request goes through the same staffStore / roleStore call a click would
// make (server RBAC: team.* on /api/staff, roles.assign on /api/roles).
//
// Invites, role changes, removals, cancellations and re-sent emails all define
// confirm(): the runtime asks the user before run() is called.
//
// Catalog: apps/server/src/lib/agent/operator/catalog/team.ts — keep in step.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import { useAgentAction } from '@/agent/operator/runtime/registry';
import type { UiDriver } from '@/agent/operator/contracts';
import type { StaffUser, PendingGrant } from '@/stores/staffStore';
import { useStaffStore } from '@/stores/staffStore';
import { useRoleStore, type Role } from '@/stores/roleStore';
import { findPerson, personDisplay, personDisplayWithEmail } from '@/agent/operator/runtime/humanRef';
import { knownPeople } from '@/agent/operator/runtime/people';
import { anchor, firstError, resolveOne, useLive, waitUntil, watchToasts } from './opUtils';

interface TeamOperatorInput {
  canViewTeam: boolean;
  canManageTeam: boolean;
  teamStaff: StaffUser[];
  teamPending: PendingGrant[];
  teamBusy: boolean;
  teamEmail: string;
  roles: Role[];
  myId: string | undefined;
}

const NO_MANAGE =
  'You can view the team but not change it — that needs the "Team: create/edit/delete" permission.';

// ── Resolvers (pure; read the live stores so confirm() can name people) ──────

function resolveRole(query: string, roles: Role[]): ReturnType<typeof resolveOne<Role>> {
  // Roles load on this screen a moment after it opens. "No role matches
  // “Editor”" (with no list) read as "that role does not exist".
  if (!roles.length) return { error: 'The role list has not loaded yet — try again in a moment.' };
  return resolveOne(query, roles, (r) => [r.name, r.label], 'role', (r) => `${r.label} (${r.name})`);
}

function resolveMember(query: string, staff: StaffUser[]) {
  return resolveOne(
    query,
    staff,
    (u) => [u.userId, u.email, u.name],
    'team member',
    (u) => personDisplayWithEmail(u),
  );
}

function resolvePending(query: string, pending: PendingGrant[]) {
  return resolveOne(query, pending, (p) => [p.id, p.email], 'pending invitation', (p) => p.email);
}

const memberJson = (u: StaffUser, myId?: string) => ({
  userId: u.userId,
  name: u.name || null,
  email: u.email,
  role: u.role?.name ?? null,
  roleLabel: u.role?.label ?? null,
  lastLogin: u.lastLogin,
  isYou: u.userId === myId,
});

const pendingJson = (p: PendingGrant) => ({
  inviteId: p.id,
  email: p.email,
  role: p.role,
  expired: p.expired,
  expiresAt: p.expiresAt ?? null,
  invitedBy: p.invitedByName ?? null,
});

/** Open a RoleSelect and pick `slug` — visibly, like a person would. */
async function pickRole(ui: UiDriver, selectId: string, slug: string, label: string) {
  await ui.click(selectId, 'Open the role list');
  await ui.waitFor(`${selectId}.option-${slug}`, 4000);
  await ui.click(`${selectId}.option-${slug}`, label);
}

/** Roles as the model should see them. */
export const roleJson = (r: Role) => ({
  role: r.name,
  label: r.label,
  description: r.description ?? null,
  isSystem: r.isSystem,
  locked: r.isImmutable,
  assignees: r.assigneeCount ?? null,
  permissionCount: r.permissions.length,
});

export function useTeamOperatorActions(input: TeamOperatorInput): void {
  const live = useLive(input);
  const enabled = input.canViewTeam;

  // ── Reads ──────────────────────────────────────────────────────────────────
  useAgentAction(
    {
      name: 'team.list',
      description: 'List team members (userId, name, email, role) and pending invitations.',
      args: z.object({}),
      run: async () => {
        const s = live.current;
        return {
          canManage: s.canManageTeam,
          members: [...s.teamStaff]
            .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email))
            .map((u) => memberJson(u, s.myId)),
          invitations: s.teamPending.map(pendingJson),
        };
      },
    },
    enabled,
  );

  useAgentAction(
    {
      name: 'roles.list',
      description: 'List the roles that can be given to team members (slug, label, description).',
      args: z.object({}),
      run: async () => {
        const roles = live.current.roles.length ? live.current.roles : useRoleStore.getState().roles;
        if (!roles.length) {
          return { roles: [], note: 'Roles are not loaded here (they load for people who can manage the team). Open /production-system/roles to read them.' };
        }
        return { roles: roles.map(roleJson) };
      },
    },
    enabled,
  );

  // ── Invite ─────────────────────────────────────────────────────────────────
  const inviteArgs = z.object({
    email: z.string().trim().email(),
    role: z.string().min(1).describe('Role slug or label, e.g. "editor" or "Sub-editor"'),
  });
  useAgentAction<z.infer<typeof inviteArgs>>(
    {
      name: 'team.invite',
      description: 'Invite someone by email with a role (types into the invite form and presses Invite).',
      args: inviteArgs,
      confirm: (a) => {
        const s = live.current;
        if (!s.canManageTeam) return null;
        const r = resolveRole(a.role, s.roles);
        if (!r.hit) return null;
        const existing = s.teamStaff.find((u) => u.email.toLowerCase() === a.email.toLowerCase());
        if (existing) {
          return `Give ${personDisplay(existing)} the ${r.hit.label} role (replacing ${existing.role?.label ?? 'no role'}) and email them?`;
        }
        // Someone the app already knows by name (staff directory) is named too.
        const known = findPerson(a.email, knownPeople());
        return `Invite ${personDisplayWithEmail(known ?? { email: a.email })} to the team as ${r.hit.label}? They will be emailed a join link.`;
      },
      run: async (a, ui) => {
        const s = live.current;
        if (!s.canManageTeam) throw new Error(NO_MANAGE);
        const r = resolveRole(a.role, s.roles);
        if (!r.hit) throw new Error(r.error);
        const role = r.hit;

        ui.step(`Inviting ${a.email} as ${role.label}`);
        await ui.type('team.invite-email', a.email, { clear: true });
        if (live.current.teamEmail.trim() !== a.email) {
          await waitUntil(() => live.current.teamEmail.trim() === a.email, { timeoutMs: 1500, signal: ui.signal });
        }
        await pickRole(ui, 'team.invite-role', role.name, role.label);

        const toasts = watchToasts();
        await ui.click('team.invite-submit', 'Send the invite');
        await waitUntil(() => live.current.teamBusy, { timeoutMs: 2500, signal: ui.signal });
        const settled = await waitUntil(() => !live.current.teamBusy, { timeoutMs: 45_000, signal: ui.signal });
        if (!settled) throw new Error('The invite is still sending — check the Team screen in a moment.');
        await waitUntil(() => toasts.collect().length > 0, { timeoutMs: 1500, signal: ui.signal });

        const msgs = toasts.collect();
        const email = a.email.toLowerCase();
        const st = useStaffStore.getState();
        const member = st.staff.find((u) => u.email.toLowerCase() === email);
        const pending = st.pending.find((p) => p.email.toLowerCase() === email);
        const cleared = live.current.teamEmail === '';
        // The box is cleared only on success. An ERROR toast with it still full is
        // a refusal even when an older invite for this email is on the list (the
        // server's "A pending invite for this role already exists" 409) — that old
        // row must not be reported as this invite having gone out.
        const refused = !cleared ? firstError(msgs) : undefined;
        if (refused) throw new Error(refused);
        if (!cleared && !pending && !(member && member.role?.name === role.name)) {
          throw new Error(msgs[0]?.text ?? 'The invite did not go through.');
        }
        if (member) ui.flash(`team.member-${member.userId}`);
        else if (pending) ui.flash(`team.pending-${pending.id}`);
        // Past this point the invite / role IS saved. A warning toast ("saved, but
        // the email failed / email is not configured") is a partial success —
        // reported as such, not as ok:false (which reads as "nothing happened").
        const warned = msgs.some((t) => t.type === 'warning');
        return {
          ok: true,
          saved: true,
          emailed: !warned,
          ...(warned ? { note: 'Saved, but no email went out — tell the user; team.resendEmail sends it again.' } : {}),
          email: a.email,
          role: role.name,
          status: member ? 'member — role active now' : 'invited — pending sign-in',
          member: member ? memberJson(member, live.current.myId) : undefined,
          invitation: pending ? pendingJson(pending) : undefined,
          messages: msgs.map((t) => t.text),
        };
      },
    },
    enabled,
  );

  // ── Change role ────────────────────────────────────────────────────────────
  const changeArgs = z.object({
    member: z.string().min(1).describe('userId, email or name of a current member'),
    role: z.string().min(1).describe('Role slug or label'),
  });
  useAgentAction<z.infer<typeof changeArgs>>(
    {
      name: 'team.changeRole',
      description: "Change a team member's role (opens their role pill and picks the new role).",
      args: changeArgs,
      confirm: (a) => {
        const s = live.current;
        if (!s.canManageTeam) return null;
        const m = resolveMember(a.member, s.teamStaff);
        const r = resolveRole(a.role, s.roles);
        if (!m.hit || !r.hit) return null;
        // Already holds it: run() returns { unchanged } — no card for a no-op.
        if (m.hit.role?.name === r.hit.name) return null;
        return `Change ${personDisplay(m.hit)}'s role from ${m.hit.role?.label ?? 'no role'} to ${r.hit.label}?`;
      },
      run: async (a, ui) => {
        const s = live.current;
        if (!s.canManageTeam) throw new Error(NO_MANAGE);
        const m = resolveMember(a.member, s.teamStaff);
        if (!m.hit) throw new Error(m.error);
        const r = resolveRole(a.role, s.roles);
        if (!r.hit) throw new Error(r.error);
        const user = m.hit;
        const role = r.hit;
        if (user.role?.name === role.name) {
          return { ok: true, unchanged: true, member: memberJson(user, s.myId) };
        }

        ui.step(`Changing ${personDisplay(user)} to ${role.label}`);
        const toasts = watchToasts();
        await pickRole(ui, `team.role-select-${user.userId}`, role.name, role.label);
        const done = await waitUntil(
          () =>
            useStaffStore.getState().staff.find((u) => u.userId === user.userId)?.role?.name === role.name ||
            toasts.collect().some((t) => t.type === 'error'),
          { timeoutMs: 30_000, signal: ui.signal },
        );
        const after = useStaffStore.getState().staff.find((u) => u.userId === user.userId);
        if (!done || after?.role?.name !== role.name) {
          throw new Error(firstError(toasts.collect()) ?? 'The role change did not take effect.');
        }
        ui.flash(`team.member-${user.userId}`);
        return { ok: true, member: memberJson(after, live.current.myId) };
      },
    },
    enabled,
  );

  // ── Remove from team ───────────────────────────────────────────────────────
  const memberArg = z.object({ member: z.string().min(1).describe('userId, email or name of a current member') });
  useAgentAction<z.infer<typeof memberArg>>(
    {
      name: 'team.remove',
      description: 'Remove someone from the team (revokes their role; their account and bylines stay).',
      args: memberArg,
      confirm: (a) => {
        const s = live.current;
        if (!s.canManageTeam) return null;
        const m = resolveMember(a.member, s.teamStaff);
        if (!m.hit || m.hit.userId === s.myId) return null;
        return `Remove ${personDisplay(m.hit)} from the team? They lose every newsroom permission immediately.`;
      },
      run: async (a, ui) => {
        const s = live.current;
        if (!s.canManageTeam) throw new Error(NO_MANAGE);
        const m = resolveMember(a.member, s.teamStaff);
        if (!m.hit) throw new Error(m.error);
        if (m.hit.userId === s.myId) throw new Error('You cannot remove yourself from the team.');
        const user = m.hit;

        ui.step(`Removing ${personDisplay(user)}`);
        const toasts = watchToasts();
        await ui.click(`team.remove-${user.userId}`, 'Remove');
        await ui.waitFor('team.remove-confirm', 4000);
        await ui.click('team.remove-confirm', 'Remove from team');
        const gone = await waitUntil(
          () =>
            !useStaffStore.getState().staff.some((u) => u.userId === user.userId) ||
            toasts.collect().some((t) => t.type === 'error'),
          { timeoutMs: 30_000, signal: ui.signal },
        );
        if (!gone || useStaffStore.getState().staff.some((u) => u.userId === user.userId)) {
          throw new Error(firstError(toasts.collect()) ?? 'They are still on the team.');
        }
        return { ok: true, removed: { userId: user.userId, name: user.name, email: user.email } };
      },
    },
    enabled,
  );

  // ── Pending invitations ────────────────────────────────────────────────────
  const inviteRef = z.object({ invite: z.string().min(1).describe('inviteId or the invited email') });
  useAgentAction<z.infer<typeof inviteRef>>(
    {
      name: 'team.cancelInvite',
      description: 'Cancel a pending invitation (its emailed link stops working).',
      args: inviteRef,
      confirm: (a) => {
        const s = live.current;
        if (!s.canManageTeam) return null;
        const p = resolvePending(a.invite, s.teamPending);
        return p.hit ? `Cancel the invitation to ${p.hit.email}? Their link will stop working.` : null;
      },
      run: async (a, ui) => {
        const s = live.current;
        if (!s.canManageTeam) throw new Error(NO_MANAGE);
        const p = resolvePending(a.invite, s.teamPending);
        if (!p.hit) throw new Error(p.error);
        const inv = p.hit;
        const toasts = watchToasts();
        await ui.click(`team.pending-cancel-${inv.id}`, 'Cancel invitation');
        const gone = await waitUntil(
          () =>
            !useStaffStore.getState().pending.some((x) => x.id === inv.id) ||
            toasts.collect().some((t) => t.type === 'error'),
          { timeoutMs: 20_000, signal: ui.signal },
        );
        if (!gone || useStaffStore.getState().pending.some((x) => x.id === inv.id)) {
          throw new Error(firstError(toasts.collect()) ?? 'The invitation is still pending.');
        }
        return { ok: true, cancelled: pendingJson(inv) };
      },
    },
    enabled,
  );

  const resendArgs = z.object({ who: z.string().min(1).describe('A pending invite (inviteId/email) or a member (userId/email/name)') });
  useAgentAction<z.infer<typeof resendArgs>>(
    {
      name: 'team.resendEmail',
      description:
        "Re-send an email: a pending invitation gets a fresh join link (old link stops working); a member gets their 'you have access' email again.",
      args: resendArgs,
      confirm: (a) => {
        const s = live.current;
        if (!s.canManageTeam) return null;
        const p = resolvePending(a.who, s.teamPending);
        if (p.hit) return `Email a fresh invitation link to ${p.hit.email}? The previous link stops working.`;
        const m = resolveMember(a.who, s.teamStaff);
        // No role → their Resend button is disabled and run() refuses: no card.
        return m.hit && m.hit.role ? `Email ${personDisplay(m.hit)} their access details again?` : null;
      },
      run: async (a, ui) => {
        const s = live.current;
        if (!s.canManageTeam) throw new Error(NO_MANAGE);
        const p = resolvePending(a.who, s.teamPending);
        const m = p.hit ? undefined : resolveMember(a.who, s.teamStaff);
        if (!p.hit && !m?.hit) throw new Error(m?.error ?? p.error);
        if (!p.hit && !m!.hit!.role) {
          throw new Error(`${personDisplay(m!.hit!)} holds no role, so there is no access email to send — give them a role first (team.changeRole).`);
        }
        const target = p.hit ? `team.pending-resend-${p.hit.id}` : `team.resend-${m!.hit!.userId}`;
        const btn = anchor(target);
        if (btn && (btn as HTMLButtonElement).disabled) {
          throw new Error('Resend is unavailable for them right now (a send is already in progress) — try again in a moment.');
        }
        const toasts = watchToasts();
        await ui.click(target, 'Resend email');
        await waitUntil(() => toasts.collect().length > 0, { timeoutMs: 30_000, signal: ui.signal });
        const msgs = toasts.collect();
        const err = firstError(msgs);
        if (err) throw new Error(err);
        return {
          ok: true,
          to: p.hit ? p.hit.email : m!.hit!.email,
          messages: msgs.map((t) => t.text),
        };
      },
    },
    enabled,
  );
}
