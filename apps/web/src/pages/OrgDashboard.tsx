import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useOrgStore } from '@/stores/orgStore';
import { useClaimStore } from '@/stores/claimStore';
import { useHorseStore } from '@/stores/horseStore';
import { PARTY_ROLES, PARTY_ROLE_LABELS } from '@/types/party';
import type { PartyRole } from '@/types/party';
import type { OrgRole } from '@/rbac/roles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  Building2, Users, UserPlus, Trash2, Check, X, ShieldCheck, Loader2, PlusCircle, Star, MapPin,
} from 'lucide-react';

const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  org_owner: 'Owner',
  org_manager: 'Manager',
  org_member: 'Member',
};

export default function OrgDashboard() {
  const { id = '' } = useParams();
  const currentUser = useAuthStore((s) => s.currentUser);
  const detail = useOrgStore((s) => s.detail);
  const loading = useOrgStore((s) => s.loading);
  const fetchOrg = useOrgStore((s) => s.fetchOrg);
  const addMember = useOrgStore((s) => s.addMember);
  const removeMember = useOrgStore((s) => s.removeMember);
  const createManagedParty = useOrgStore((s) => s.createManagedParty);
  const horses = useHorseStore((s) => s.horses);
  const fetchHorses = useHorseStore((s) => s.fetchHorses);
  const pending = useClaimStore((s) => s.pending);
  const fetchPending = useClaimStore((s) => s.fetchPending);
  const verifyClaim = useClaimStore((s) => s.verifyClaim);
  const rejectClaim = useClaimStore((s) => s.rejectClaim);

  const myRole = currentUser?.orgMemberships?.find((m) => m.orgId === id)?.orgRole;
  const canManage = myRole === 'org_owner' || myRole === 'org_manager';
  const isOwner = myRole === 'org_owner';

  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<OrgRole>('org_member');
  const [partyName, setPartyName] = useState('');
  const [partyRoles, setPartyRoles] = useState<PartyRole[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void fetchOrg(id);
    void fetchHorses();
    if (canManage) void fetchPending();
  }, [id, canManage, fetchOrg, fetchHorses, fetchPending]);

  const managedIds = useMemo(
    () => new Set((detail?.managedParties ?? []).map((p) => p.id)),
    [detail],
  );
  // Claims for THIS org's managed parties (server already scopes to orgs you manage).
  const orgPending = useMemo(
    () => pending.filter((c) => managedIds.has(c.partyId)),
    [pending, managedIds],
  );
  const scopedHorses = useMemo(
    () => horses.filter((h) => (detail?.horseIds ?? []).includes(h.id)),
    [horses, detail],
  );

  const onAddMember = async () => {
    if (!memberEmail.trim()) return;
    setBusy('member');
    const r = await addMember(id, memberEmail.trim(), memberRole);
    setBusy(null);
    if (r.ok) {
      toast.success('Member added.');
      setMemberEmail('');
      setMemberRole('org_member');
    } else toast.error(r.error ?? 'Could not add member.');
  };

  const onRemoveMember = async (userId: string) => {
    setBusy(userId);
    const r = await removeMember(id, userId);
    setBusy(null);
    if (r.ok) toast.success('Member removed.');
    else toast.error(r.error ?? 'Could not remove member.');
  };

  const onAddParty = async () => {
    if (!partyName.trim()) return;
    setBusy('party');
    const r = await createManagedParty(id, { name: partyName.trim(), roles: partyRoles });
    setBusy(null);
    if (r.ok) {
      toast.success('Managed party added.');
      setPartyName('');
      setPartyRoles([]);
    } else toast.error(r.error ?? 'Could not add party.');
  };

  const onVerify = async (claimId: string) => {
    setBusy(claimId);
    const r = await verifyClaim(claimId);
    setBusy(null);
    if (r.ok) toast.success('Claim verified.');
    else toast.error(r.error ?? 'Could not verify.');
  };

  const onReject = async (claimId: string) => {
    const reason = window.prompt('Reason for rejection (optional):') ?? undefined;
    setBusy(claimId);
    const r = await rejectClaim(claimId, reason);
    setBusy(null);
    if (r.ok) toast.success('Claim rejected.');
    else toast.error(r.error ?? 'Could not reject.');
  };

  if (loading && !detail) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-24 justify-center">
        <Loader2 size={16} className="animate-spin" /> Loading organisation…
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center text-sm text-muted-foreground">
        Organisation not found, or you don&rsquo;t have access.
      </div>
    );
  }

  const togglePartyRole = (role: PartyRole) =>
    setPartyRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 py-10 space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <Building2 size={22} className="text-primary" />
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground">
            {detail.org.name}
          </h1>
          {myRole && (
            <span
              className="text-[10px] uppercase tracking-[0.1em] font-bold px-2 py-0.5 rounded-full"
              style={{ background: 'hsl(var(--brand-accent) / 0.14)', color: 'hsl(var(--brand-accent))' }}
            >
              You: {ORG_ROLE_LABELS[myRole]}
            </span>
          )}
        </div>
        {detail.org.base_location && (
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
            <MapPin size={13} /> {detail.org.base_location}
          </p>
        )}
        <div className="h-px w-full bg-border/60 mt-4" />
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Members */}
        <section>
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.1em] text-foreground mb-3">
            <Users size={15} /> Members ({detail.members.length})
          </h2>
          <ul className="space-y-2 mb-4">
            {detail.members.map((m) => (
              <li
                key={m.userId}
                className="flex items-center gap-3 p-3 border border-border/60 rounded-sm bg-card"
              >
                <div className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-foreground truncate">{m.displayName}</span>
                  <span className="block text-xs text-muted-foreground truncate">{m.email}</span>
                </div>
                <span className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">
                  {ORG_ROLE_LABELS[m.orgRole]}
                </span>
                {isOwner && m.userId !== currentUser?.id && (
                  <button
                    onClick={() => onRemoveMember(m.userId)}
                    disabled={busy === m.userId}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                    aria-label="Remove member"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>

          {canManage && (
            <div className="p-3 border border-dashed border-border/60 rounded-sm space-y-2">
              <Label className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">
                Invite a member (by email)
              </Label>
              <Input
                value={memberEmail}
                onChange={(e) => setMemberEmail(e.target.value)}
                placeholder="person@example.com"
                type="email"
              />
              <div className="flex items-center gap-2">
                <select
                  value={memberRole}
                  onChange={(e) => setMemberRole(e.target.value as OrgRole)}
                  className="flex-1 h-9 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="org_member">Member</option>
                  {isOwner && <option value="org_manager">Manager</option>}
                  {isOwner && <option value="org_owner">Owner</option>}
                </select>
                <Button size="sm" onClick={onAddMember} disabled={busy === 'member' || !memberEmail.trim()} className="gap-1.5">
                  {busy === 'member' ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                  Add
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground/70">
                The person must already have a Stable Press account.
              </p>
            </div>
          )}
        </section>

        {/* Managed parties */}
        <section>
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.1em] text-foreground mb-3">
            <Star size={15} /> Managed Parties ({detail.managedParties.length})
          </h2>
          <ul className="space-y-2 mb-4">
            {detail.managedParties.length === 0 && (
              <li className="text-xs text-muted-foreground italic py-2">No managed parties yet.</li>
            )}
            {detail.managedParties.map((p) => (
              <li key={p.id} className="p-3 border border-border/60 rounded-sm bg-card">
                <span className="block text-sm font-medium text-foreground">{p.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {p.roles.length ? p.roles.map((r) => PARTY_ROLE_LABELS[r] ?? r).join(', ') : 'No roles'}
                </span>
              </li>
            ))}
          </ul>

          {canManage && (
            <div className="p-3 border border-dashed border-border/60 rounded-sm space-y-2">
              <Label className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">
                Add a managed party
              </Label>
              <Input value={partyName} onChange={(e) => setPartyName(e.target.value)} placeholder="Party name" />
              <div className="flex flex-wrap gap-1.5">
                {PARTY_ROLES.map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => togglePartyRole(role)}
                    className={
                      'text-[11px] px-2 py-1 rounded-full border transition-colors ' +
                      (partyRoles.includes(role)
                        ? 'border-primary bg-primary/10 text-primary font-semibold'
                        : 'border-input text-muted-foreground hover:border-primary/50')
                    }
                  >
                    {PARTY_ROLE_LABELS[role]}
                  </button>
                ))}
              </div>
              <Button size="sm" onClick={onAddParty} disabled={busy === 'party' || !partyName.trim()} className="gap-1.5">
                {busy === 'party' ? <Loader2 size={14} className="animate-spin" /> : <PlusCircle size={14} />}
                Add party
              </Button>
            </div>
          )}
        </section>
      </div>

      {/* Pending verifications (owner/manager) */}
      {canManage && (
        <section>
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.1em] text-foreground mb-3">
            <ShieldCheck size={15} /> Pending Verifications ({orgPending.length})
          </h2>
          {orgPending.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No one has claimed your managed parties yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {orgPending.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 border border-border/60 rounded-sm bg-card"
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-foreground">{c.claimantName}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      claims <span className="font-medium">{PARTY_ROLE_LABELS[c.role] ?? c.role}</span> · {c.partyName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => onVerify(c.id)} disabled={busy === c.id} className="gap-1.5">
                      {busy === c.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onReject(c.id)} disabled={busy === c.id} className="gap-1.5">
                      <X size={14} /> Reject
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Org horses */}
      <section>
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.1em] text-foreground mb-3">
          Horses in scope ({scopedHorses.length})
        </h2>
        {scopedHorses.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No horses are linked to this organisation or its parties yet.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {scopedHorses.map((h) => (
              <div key={h.id} className="p-3 border border-border/60 rounded-sm bg-card text-sm text-foreground truncate">
                {h.name}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
