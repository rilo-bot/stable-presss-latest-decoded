import { useEffect, useState } from 'react';
import { Plus, Shield, Clock, Users, Lock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import type { StaffUser, PendingGrant } from '@/stores/staffStore';
import { useRoleStore } from '@/stores/roleStore';
import { roleColor, roleIcon } from '@/lib/roleDisplay';
import { toast } from 'sonner';

interface TeamManagementViewProps {
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
  onRevokeStaff: (userId: string, slug: string) => void;
  onCancelInvite: (inviteId: string) => void;
}

export function TeamManagementView({
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
  onRevokeStaff,
  onCancelInvite,
}: TeamManagementViewProps) {
  const roles = useRoleStore((s) => s.roles);
  const fetchRoles = useRoleStore((s) => s.fetchRoles);
  const assignRole = useRoleStore((s) => s.assignRole);
  const unassignRole = useRoleStore((s) => s.unassignRole);
  const [roleBusy, setRoleBusy] = useState<string | null>(null);

  useEffect(() => {
    if (canManageTeam) void fetchRoles();
  }, [canManageTeam, fetchRoles]);

  // Default the invite dropdown to the first role once they load.
  useEffect(() => {
    if (!teamRole && roles.length > 0) setTeamRole(roles[0].slug);
  }, [roles, teamRole, setTeamRole]);

  const bySlug = (slug: string) => roles.find((r) => r.slug === slug);
  const labelFor = (slug: string) => bySlug(slug)?.label ?? slug;

  const onAssign = async (userId: string, slug: string) => {
    if (!slug) return;
    setRoleBusy(userId);
    const r = await assignRole(slug, userId);
    setRoleBusy(null);
    if (r.ok) toast.success('Role assigned.');
    else toast.error(r.error ?? 'Could not assign the role.');
  };

  const onUnassign = async (userId: string, slug: string) => {
    setRoleBusy(userId);
    const r = await unassignRole(slug, userId);
    setRoleBusy(null);
    if (r.ok) toast.success('Role removed.');
    else toast.error(r.error ?? 'Could not remove the role.');
  };

  if (!canManageTeam) {
    return (
      <EmptyState
        icon={Lock}
        heading="Permission required"
        description="You need the “Manage roles” permission to invite team members and change what they can do."
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[12px] uppercase tracking-[0.14em] font-bold text-muted-foreground mb-0.5">
            Newsroom Team
          </p>
          <p className="text-sm text-muted-foreground">
            {teamStaff.length === 0
              ? 'No team members on record yet.'
              : `${teamStaff.length} team member${teamStaff.length !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {/* Invite */}
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
        <p className="text-[13px] text-muted-foreground/70 flex items-center gap-1.5">
          <Shield size={12} /> If the email has no account yet, the role applies automatically on
          their first sign-in. Define roles in{' '}
          <span className="font-medium">Roles &amp; Permissions</span>.
        </p>
      </div>

      {/* Pending invites */}
      {teamPending.length > 0 && (
        <div>
          <p className="flex items-center gap-2 text-[12px] uppercase tracking-[0.12em] font-bold text-muted-foreground mb-2">
            <Clock size={13} /> Pending invites ({teamPending.length})
          </p>
          <ul className="space-y-2">
            {teamPending.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 p-3 border border-border/60 rounded-sm bg-card text-sm"
              >
                <span className="flex-1 text-foreground truncate">{p.email}</span>
                <span className="text-[12px] uppercase tracking-wide font-bold text-muted-foreground">
                  {labelFor(p.role)}
                </span>
                <span className="text-[12px] text-muted-foreground/60 italic">applies on sign-in</span>
                <button
                  onClick={() => onCancelInvite(p.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  aria-label={`Cancel the invite for ${p.email}`}
                >
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Roster */}
      {teamLoading && teamStaff.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading team…</p>
      ) : teamStaff.length === 0 ? (
        <EmptyState
          icon={Users}
          heading="No team members yet."
          description="Invite someone using the form above and give them a role."
        />
      ) : (
        <div className="border border-border/60 rounded-sm overflow-hidden bg-card">
          <div className="px-4 py-2.5 border-b border-border/40 bg-muted/30">
            <p className="text-[12px] uppercase tracking-[0.12em] font-bold text-muted-foreground">
              Current team ({teamStaff.length})
            </p>
          </div>
          <ul className="divide-y divide-border/40">
            {teamStaff.map((u) => {
              const held = u.staffRoles ?? [];
              const available = roles.filter((r) => !held.includes(r.slug));
              return (
                <li key={u.userId} className="px-4 py-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-foreground truncate">{u.displayName}</span>
                      <span className="block text-sm text-muted-foreground truncate">{u.email}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {held.map((slug) => {
                      const r = bySlug(slug);
                      const color = roleColor(r);
                      return (
                        <span
                          key={slug}
                          className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-2 py-0.5 rounded-full border"
                          style={{ borderColor: `${color}55`, background: `${color}14`, color }}
                        >
                          {roleIcon(r?.icon, 11)}
                          {r?.label ?? slug}
                          <button
                            onClick={() => onUnassign(u.userId, slug)}
                            disabled={roleBusy === u.userId}
                            className="hover:text-destructive transition-colors"
                            aria-label={`Remove ${r?.label ?? slug} from ${u.displayName}`}
                          >
                            <X size={11} />
                          </button>
                        </span>
                      );
                    })}
                    {available.length > 0 && (
                      <select
                        value=""
                        disabled={roleBusy === u.userId}
                        onChange={(e) => void onAssign(u.userId, e.target.value)}
                        className="text-[12px] px-2 py-0.5 rounded-full border border-dashed border-input bg-background text-muted-foreground hover:border-primary/50 cursor-pointer"
                        aria-label={`Assign a role to ${u.displayName}`}
                      >
                        <option value="">+ Add role…</option>
                        {available.map((r) => (
                          <option key={r.slug} value={r.slug}>{r.label}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
