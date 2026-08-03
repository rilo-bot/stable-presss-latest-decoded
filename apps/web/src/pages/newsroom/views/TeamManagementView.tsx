import { useEffect, useMemo, useState } from 'react';
import { Plus, Shield, Clock, Users, Lock, X, Send, AlertTriangle, MailWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/EmptyState';
import type { StaffUser, PendingGrant } from '@/stores/staffStore';
import { useStaffStore } from '@/stores/staffStore';
import { useRoleStore } from '@/stores/roleStore';
import { useAuthStore } from '@/stores/authStore';
import { roleColor, roleIcon } from '@/lib/roleDisplay';
import { toast } from 'sonner';

/** "in 12 days" / "expired" — invites carry a hard deadline, so say so. */
function expiryLabel(iso: string | undefined, expired: boolean): string {
  if (expired) return 'link expired';
  if (!iso) return 'no expiry';
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return 'expires today';
  return `expires in ${days} day${days !== 1 ? 's' : ''}`;
}

/**
 * One roster, both states. Someone you invited yesterday IS part of the team as
 * far as the person managing it is concerned — keeping invites in a separate
 * block above meant the list headed "Current team (3)" was quietly wrong, and
 * with no members at all the page claimed "No team members yet" while three
 * invitations sat right above it.
 */
type Row =
  | { kind: 'member'; key: string; user: StaffUser }
  | { kind: 'invited'; key: string; invite: PendingGrant };

/** Initials for the avatar disc. Falls back to the email's first letter. */
function initials(nameOrEmail: string): string {
  const parts = nameOrEmail.trim().split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

type RoleRecord = ReturnType<typeof useRoleStore.getState>['roles'][number];

/** Shared avatar disc, so a member and an invitee line up on the same grid. */
function Avatar({ label, muted }: { label: string; muted?: boolean }) {
  return (
    <span
      className={
        'flex-shrink-0 w-8 h-8 rounded-full grid place-items-center text-[11px] font-bold ' +
        (muted
          ? 'bg-muted text-muted-foreground border border-dashed border-border'
          : 'bg-primary/10 text-primary')
      }
    >
      {initials(label)}
    </span>
  );
}

/** A read-only role pill. Invitations show one; the role isn't assigned yet. */
function RolePill({ role, slug }: { role: RoleRecord | undefined; slug: string }) {
  const color = roleColor(role);
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-2 py-0.5 rounded-full border"
      style={{ borderColor: `${color}55`, background: `${color}14`, color }}
    >
      {roleIcon(role?.icon, 11)}
      {role?.label ?? slug}
    </span>
  );
}

/**
 * The one role that decides what a member can do.
 *
 * Assignment replaces rather than stacks, so `staffRoles` holds a single slug in
 * anything created since. Older rows can still carry two; superadmin wins there
 * because it short-circuits every permission check anyway — showing anything
 * else as the headline role would misdescribe their access.
 */
function primaryRole(held: string[]): string | undefined {
  return held.find((s) => s === 'superadmin') ?? held[0];
}

function MemberRow({
  user, roles, bySlug, busy, isSelf, readOnly, onAssign, onResend, onRemove,
}: {
  user: StaffUser;
  roles: RoleRecord[];
  bySlug: (slug: string) => RoleRecord | undefined;
  busy: boolean;
  /** You can't remove yourself — the server refuses, so don't offer it. */
  isSelf: boolean;
  /**
   * `team.view` without `team.manage`: the roster is readable, nothing is
   * actionable. The role pill becomes a label rather than a disabled <select>,
   * because a greyed-out control reads as "temporarily unavailable" when the
   * truth is "not yours to change".
   */
  readOnly: boolean;
  onAssign: (userId: string, slug: string) => void;
  onResend: (user: StaffUser) => void;
  onRemove: (user: StaffUser) => void;
}) {
  const held = user.staffRoles ?? [];
  const current = primaryRole(held);
  const role = current ? bySlug(current) : undefined;
  const color = roleColor(role);
  // Legacy rows only — nothing can create these now. Named explicitly so the
  // admin knows a second role is in play and that picking one clears it.
  const extras = held.filter((s) => s !== current);
  const name = user.displayName || user.email;

  return (
    <li className="px-4 py-3 flex items-start gap-3">
      <Avatar label={name} />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="min-w-0">
          <span className="block text-sm font-medium text-foreground truncate">{name}</span>
          <span className="block text-[13px] text-muted-foreground truncate">{user.email}</span>
        </div>

        <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap">
          {/* The pill IS the picker — one control, so there is no way to end up
              wondering whether "add" and "remove" combined into something. */}
          <span
            className="relative inline-flex items-center gap-1.5 text-[12px] font-semibold pl-2 pr-1 py-0.5 rounded-full border"
            style={
              current
                ? { borderColor: `${color}55`, background: `${color}14`, color }
                : undefined
            }
          >
            {current ? roleIcon(role?.icon, 11) : null}
            {readOnly ? (
              <span className="pr-1" style={{ color: current ? color : undefined }}>
                {role?.label ?? (current ?? 'No role — no access')}
              </span>
            ) : (
              <select
                value={current ?? ''}
                disabled={busy}
                onChange={(e) => onAssign(user.userId, e.target.value)}
                className="bg-transparent border-0 text-[12px] font-semibold pr-0.5 cursor-pointer focus:outline-none disabled:cursor-wait"
                style={{ color: current ? color : undefined }}
                aria-label={`Role for ${name}`}
              >
                {!current && <option value="">No role — no access</option>}
                {roles.map((r) => (
                  <option key={r.slug} value={r.slug} className="text-foreground bg-background">
                    {r.label}
                  </option>
                ))}
              </select>
            )}
          </span>

          {!readOnly && (
            <>
              <button
                onClick={() => onResend(user)}
                disabled={busy || !current}
                className="text-[12px] font-semibold text-primary hover:underline flex items-center gap-1 disabled:opacity-40 disabled:no-underline"
              >
                <Send size={11} /> Resend email
              </button>
              {!isSelf && (
                <button
                  onClick={() => onRemove(user)}
                  disabled={busy}
                  className="text-[12px] font-semibold text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1 disabled:opacity-40"
                >
                  <X size={11} /> Remove
                </button>
              )}
            </>
          )}
        </div>

        {extras.length > 0 && (
          <p className="text-[12px] text-muted-foreground/70 flex items-start gap-1.5">
            <AlertTriangle size={11} className="flex-shrink-0 mt-0.5" />
            <span>
              Also holds {extras.map((s) => bySlug(s)?.label ?? s).join(', ')} from before roles
              became single{readOnly ? '.' : ' — choosing a role above clears it.'}
            </span>
          </p>
        )}
      </div>
    </li>
  );
}

function InvitedRow({
  invite, role, busy, readOnly, onResend, onCancel,
}: {
  invite: PendingGrant;
  role: RoleRecord | undefined;
  busy: boolean;
  /** `team.view` only — the invitation is visible, resend/cancel are not offered. */
  readOnly: boolean;
  onResend: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  return (
    <li className="px-4 py-3 flex items-start gap-3 bg-muted/15">
      <Avatar label={invite.email} muted />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="min-w-0">
          <span className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium text-foreground truncate">{invite.email}</span>
            <span
              className={
                'inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ' +
                (invite.expired
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-muted text-muted-foreground')
              }
            >
              {invite.expired ? <AlertTriangle size={9} /> : <Clock size={9} />}
              {invite.expired ? 'Expired' : 'Invited'}
            </span>
          </span>
          <span className="block text-[13px] text-muted-foreground truncate">
            {expiryLabel(invite.expiresAt, invite.expired)}
            {invite.invitedByName ? ` · invited by ${invite.invitedByName}` : ''}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Read-only: the role applies when they accept, so there is nothing
              to add or remove yet. Cancelling the invite is how you undo it. */}
          <RolePill role={role} slug={invite.role} />
          <span className="text-[12px] text-muted-foreground/60 italic">applies on sign-in</span>

          {!readOnly && (
          <>
          {/* Resend mints a NEW token — the previous link stops working. */}
          <button
            onClick={() => onResend(invite.id)}
            disabled={busy}
            className="text-[12px] font-semibold text-primary hover:underline flex items-center gap-1 disabled:opacity-50"
          >
            <Send size={11} /> {busy ? 'Sending…' : 'Resend'}
          </button>
          <button
            onClick={() => onCancel(invite.id)}
            className="text-[12px] font-semibold text-muted-foreground hover:text-destructive transition-colors"
          >
            Cancel
          </button>
          </>
          )}
        </div>
      </div>
    </li>
  );
}

interface TeamManagementViewProps {
  /**
   * May the viewer READ the roster (`team.view`)? The `team` module is gated on
   * this, so anyone who reaches this screen has it — but the prop is explicit
   * rather than assumed, so a future entry point cannot bypass the check.
   */
  canViewTeam: boolean;
  canManageTeam: boolean;
  teamStaff: StaffUser[];
  teamPending: PendingGrant[];
  teamLoading: boolean;
  teamEmail: string;
  setTeamEmail: (v: string) => void;
  /** The role SLUG selected in the invite dropdown. */
  teamRole: string;
  setTeamRole: (v: string) => void;
  teamBusy: boolean;
  onGrantStaff: () => void;
  onCancelInvite: (inviteId: string) => void;
}

export function TeamManagementView({
  canViewTeam,
  canManageTeam,
  teamStaff,
  teamPending,
  teamLoading,
  teamEmail,
  setTeamEmail,
  teamRole,
  setTeamRole,
  teamBusy,
  onGrantStaff,
  onCancelInvite,
}: TeamManagementViewProps) {
  const roles = useRoleStore((s) => s.roles);
  const fetchRoles = useRoleStore((s) => s.fetchRoles);
  const assignRole = useRoleStore((s) => s.assignRole);
  const resendInvite = useStaffStore((s) => s.resendInvite);
  const resendAccess = useStaffStore((s) => s.resendAccess);
  const removeMember = useStaffStore((s) => s.removeMember);
  const fetchStaff = useStaffStore((s) => s.fetchStaff);
  const emailConfigured = useStaffStore((s) => s.emailConfigured);
  const myId = useAuthStore((s) => s.currentUser?.id);
  const [roleBusy, setRoleBusy] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState<string | null>(null);
  // Revoking every role is destructive and one click away from a role change —
  // confirm by name rather than trusting the aim.
  const [confirmRemove, setConfirmRemove] = useState<StaffUser | null>(null);
  const [removing, setRemoving] = useState(false);

  const onResend = async (id: string) => {
    setInviteBusy(id);
    const r = await resendInvite(id);
    setInviteBusy(null);
    if (r.ok) toast.success(r.emailed ? 'Invitation sent again.' : 'Invite refreshed (email not configured).');
    else toast.error(r.error ?? 'Could not resend the invite.');
  };

  const onResendAccess = async (user: StaffUser) => {
    setRoleBusy(user.userId);
    const r = await resendAccess(user.userId);
    setRoleBusy(null);
    if (!r.ok) toast.error(r.error ?? 'Could not send the email.');
    else if (r.emailed) toast.success(`Access email sent to ${user.email}.`);
    else toast.warning('No email provider is configured, so nothing was sent.');
  };

  const onConfirmRemove = async () => {
    if (!confirmRemove) return;
    setRemoving(true);
    const r = await removeMember(confirmRemove.userId);
    setRemoving(false);
    if (r.ok) {
      toast.success(`${confirmRemove.displayName || confirmRemove.email} was removed from the team.`);
      setConfirmRemove(null);
    } else {
      toast.error(r.error ?? 'Could not remove them.');
    }
  };

  useEffect(() => {
    if (canManageTeam) void fetchRoles();
  }, [canManageTeam, fetchRoles]);

  // Default the invite dropdown to the first role once they load.
  useEffect(() => {
    if (!teamRole && roles.length > 0) setTeamRole(roles[0].slug);
  }, [roles, teamRole, setTeamRole]);

  const bySlug = (slug: string) => roles.find((r) => r.slug === slug);

  // Members first (they can be acted on), then invitations. Within each group,
  // alphabetical — so the list doesn't reshuffle as invites are sent.
  const rows = useMemo<Row[]>(
    () => [
      ...[...teamStaff]
        .sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email))
        .map((user): Row => ({ kind: 'member', key: `u:${user.userId}`, user })),
      ...[...teamPending]
        .sort((a, b) => a.email.localeCompare(b.email))
        .map((invite): Row => ({ kind: 'invited', key: `i:${invite.id}`, invite })),
    ],
    [teamStaff, teamPending],
  );

  // roleStore refreshes the ROLES and the acting user's session, but the roster
  // lives in staffStore — without re-fetching it the chips never changed, so
  // assigning a role toasted success and visibly did nothing until a reload.
  const onAssign = async (userId: string, slug: string) => {
    if (!slug) return;
    setRoleBusy(userId);
    const r = await assignRole(slug, userId);
    if (r.ok) await fetchStaff();
    setRoleBusy(null);
    if (r.ok) toast.success(`Role changed to ${bySlug(slug)?.label ?? slug}.`);
    else toast.error(r.error ?? 'Could not change the role.');
  };

  if (!canViewTeam) {
    return (
      <EmptyState
        icon={Lock}
        heading="Permission required"
        description="You need the “View team” permission to see the staff roster."
      />
    );
  }

  // team.view without team.manage: the roster reads, nothing acts.
  const readOnly = !canManageTeam;

  return (
    <div className="space-y-5">
      {/* Header */}
      <p className="text-sm text-muted-foreground">
        {rows.length === 0
          ? 'No one on the team yet.'
          : [
              `${teamStaff.length} member${teamStaff.length !== 1 ? 's' : ''}`,
              teamPending.length > 0 &&
                `${teamPending.length} invitation${teamPending.length !== 1 ? 's' : ''} pending`,
            ]
              .filter(Boolean)
              .join(' · ')}
      </p>

      {/* Invite — hidden entirely without team.manage. Showing a form whose
          submit the server refuses is worse than not showing it. */}
      {!readOnly && (
      <div className="border border-dashed border-border/60 rounded-sm p-4 space-y-3 bg-card">
        <p className="text-[12px] uppercase tracking-[0.12em] font-bold text-muted-foreground">
          Invite someone (by email)
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            value={teamEmail}
            onChange={(e) => setTeamEmail(e.target.value)}
            placeholder="person@example.com"
            className="flex-1 px-3 py-2 text-sm border border-input rounded-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
            aria-label="Team member email"
          />
          {/* Every role in the database — including any a superadmin created. */}
          <select
            value={teamRole}
            onChange={(e) => setTeamRole(e.target.value)}
            className="px-2 py-2 text-sm border border-input rounded-sm bg-background"
            aria-label="Role"
          >
            {roles.length === 0 && <option value="">No roles defined</option>}
            {roles.map((r) => (
              <option key={r.slug} value={r.slug}>{r.label}</option>
            ))}
          </select>
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 text-sm"
            onClick={onGrantStaff}
            disabled={teamBusy || !teamEmail.trim() || !teamRole}
          >
            <Plus size={13} /> {teamBusy ? 'Inviting…' : 'Invite'}
          </Button>
        </div>
        <p className="text-[13px] text-muted-foreground/70 flex items-start gap-1.5">
          <Shield size={12} className="flex-shrink-0 mt-0.5" />
          <span>
            They get an email with a link to join. If they already have an account the role applies
            straight away, <span className="font-medium">replacing</span> any role they hold — one
            role per person. Define roles in{' '}
            <span className="font-medium">Roles &amp; Permissions</span>.
          </span>
        </p>

        {!emailConfigured && (
          <p className="text-[13px] flex items-start gap-1.5 text-[hsl(var(--chart-4))]">
            <MailWarning size={12} className="flex-shrink-0 mt-0.5" />
            <span>
              No email provider is configured on the server, so invitations are saved but{' '}
              <strong>no email is sent</strong>. Set <code>RESEND_API_KEY</code> and{' '}
              <code>RESEND_FROM_EMAIL</code> to turn delivery on.
            </span>
          </p>
        )}
      </div>
      )}

      {/* Roster — members and invitations in one list */}
      {teamLoading && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading team…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Users}
          heading="No one on the team yet."
          description={
            readOnly
              ? 'No one holds a staff role yet.'
              : 'Invite someone using the form above and give them a role.'
          }
        />
      ) : (
        <div className="border border-border/60 rounded-sm overflow-hidden bg-card">
          <div className="px-4 py-2.5 border-b border-border/40 bg-muted/30">
            <p className="text-[12px] uppercase tracking-[0.12em] font-bold text-muted-foreground">
              Team ({rows.length})
            </p>
          </div>
          <ul className="divide-y divide-border/40">
            {rows.map((row) =>
              row.kind === 'member' ? (
                <MemberRow
                  key={row.key}
                  user={row.user}
                  roles={roles}
                  bySlug={bySlug}
                  busy={roleBusy === row.user.userId}
                  isSelf={row.user.userId === myId}
                  readOnly={readOnly}
                  onAssign={onAssign}
                  onResend={onResendAccess}
                  onRemove={setConfirmRemove}
                />
              ) : (
                <InvitedRow
                  key={row.key}
                  invite={row.invite}
                  role={bySlug(row.invite.role)}
                  busy={inviteBusy === row.invite.id}
                  readOnly={readOnly}
                  onResend={onResend}
                  onCancel={onCancelInvite}
                />
              ),
            )}
          </ul>
        </div>
      )}

      {/* Remove-from-team confirmation */}
      <Dialog open={!!confirmRemove} onOpenChange={(open) => !open && setConfirmRemove(null)}>
        <DialogContent className="max-w-md rounded-sm">
          <DialogHeader>
            <DialogTitle>
              Remove {confirmRemove?.displayName || confirmRemove?.email}?
            </DialogTitle>
            <DialogDescription>
              They lose every newsroom permission immediately. Their account, bylines and
              published work stay exactly as they are — they just become a reader again, and
              you can invite them back at any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(null)} disabled={removing}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={onConfirmRemove}
              disabled={removing}
            >
              {removing ? 'Removing…' : 'Remove from team'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
