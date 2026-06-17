import { Plus, Shield, Clock, Users, Lock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { STAFF_ROLES } from '@/rbac/roles';
import type { StaffRole } from '@/rbac/roles';
import type { StaffUser, PendingGrant } from '@/stores/staffStore';
import { STAFF_ROLE_LABELS } from '../constants';

interface TeamManagementViewProps {
  canManageTeam: boolean;
  teamStaff: StaffUser[];
  teamPending: PendingGrant[];
  teamLoading: boolean;
  teamEmail: string;
  setTeamEmail: (v: string) => void;
  teamRole: StaffRole;
  setTeamRole: (v: StaffRole) => void;
  teamBusy: boolean;
  onGrantStaff: () => void;
  onRevokeStaff: (userId: string, role: StaffRole) => void;
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
}: TeamManagementViewProps) {
  if (!canManageTeam) {
    return (
      <EmptyState
        icon={Lock}
        heading="Administrator access required"
        description="Only administrators can invite team members and manage their staff roles."
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

      {/* Grant / invite */}
      <div className="border border-dashed border-border/60 rounded-sm p-4 space-y-3 bg-card">
        <p className="text-[12px] uppercase tracking-[0.12em] font-bold text-muted-foreground">
          Invite or grant a staff role (by email)
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
          <select
            value={teamRole}
            onChange={(e) => setTeamRole(e.target.value as StaffRole)}
            className="px-2 py-2 text-sm border border-input rounded-sm bg-background"
            aria-label="Staff role"
          >
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>{STAFF_ROLE_LABELS[r]}</option>
            ))}
          </select>
          <Button
            size="sm"
            className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 text-sm"
            onClick={onGrantStaff}
            disabled={teamBusy || !teamEmail.trim()}
          >
            <Plus size={13} /> {teamBusy ? 'Granting…' : 'Grant'}
          </Button>
        </div>
        <p className="text-[13px] text-muted-foreground/70 flex items-center gap-1.5">
          <Shield size={12} /> Granting <span className="font-medium">Administrator</span> lets that
          person manage the team too. If the email has no account yet, the grant applies automatically on their first sign-in.
        </p>
      </div>

      {/* Pending invites */}
      {teamPending.length > 0 && (
        <div>
          <p className="flex items-center gap-2 text-[12px] uppercase tracking-[0.12em] font-bold text-muted-foreground mb-2">
            <Clock size={13} /> Pending invites ({teamPending.length})
          </p>
          <ul className="space-y-2">
            {teamPending.map((p, i) => (
              <li
                key={`${p.email}-${p.role}-${i}`}
                className="flex items-center gap-3 p-3 border border-border/60 rounded-sm bg-card text-sm"
              >
                <span className="flex-1 text-foreground truncate">{p.email}</span>
                <span className="text-[12px] uppercase tracking-wide font-bold text-muted-foreground">
                  {STAFF_ROLE_LABELS[p.role] ?? p.role}
                </span>
                <span className="text-[12px] text-muted-foreground/60 italic">applies on sign-in</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Staff roster */}
      {teamLoading && teamStaff.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading team…</p>
      ) : teamStaff.length === 0 ? (
        <EmptyState
          icon={Users}
          heading="No team members yet."
          description="Invite contributors, editors, legal reviewers and publishers using the form above."
        />
      ) : (
        <div className="border border-border/60 rounded-sm overflow-hidden bg-card">
          <div className="px-4 py-2.5 border-b border-border/40 bg-muted/30">
            <p className="text-[12px] uppercase tracking-[0.12em] font-bold text-muted-foreground">
              Current staff ({teamStaff.length})
            </p>
          </div>
          <ul className="divide-y divide-border/40">
            {teamStaff.map((u) => (
              <li key={u.userId} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-foreground truncate">{u.displayName}</span>
                  <span className="block text-sm text-muted-foreground truncate">{u.email}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 justify-end">
                  {u.staffRoles.map((r) => (
                    <span
                      key={r}
                      className="inline-flex items-center gap-1 text-[12px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full bg-primary/8 text-primary"
                    >
                      {STAFF_ROLE_LABELS[r] ?? r}
                      <button
                        onClick={() => onRevokeStaff(u.userId, r)}
                        className="hover:text-destructive transition-colors"
                        aria-label={`Revoke ${r}`}
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
