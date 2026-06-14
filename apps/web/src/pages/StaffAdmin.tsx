import { useEffect, useState } from 'react';
import { useStaffStore } from '@/stores/staffStore';
import { STAFF_ROLES } from '@/rbac/roles';
import type { StaffRole } from '@/rbac/roles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Users, UserPlus, X, Loader2, Clock, ShieldAlert } from 'lucide-react';

const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  contributor: 'Contributor',
  editor: 'Editor',
  legal_reviewer: 'Legal Reviewer',
  podcast_producer: 'Podcast Producer',
  publisher: 'Publisher',
  administrator: 'Administrator',
};

export default function StaffAdmin() {
  const staff = useStaffStore((s) => s.staff);
  const pending = useStaffStore((s) => s.pending);
  const loading = useStaffStore((s) => s.loading);
  const fetchStaff = useStaffStore((s) => s.fetchStaff);
  const grant = useStaffStore((s) => s.grant);
  const revoke = useStaffStore((s) => s.revoke);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<StaffRole>('contributor');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetchStaff();
  }, [fetchStaff]);

  const onGrant = async () => {
    if (!email.trim()) return;
    setBusy(true);
    const r = await grant(email.trim(), role);
    setBusy(false);
    if (r.ok) {
      toast.success('Role granted.');
      setEmail('');
    } else toast.error(r.error ?? 'Could not grant the role.');
  };

  const onRevoke = async (userId: string, r: StaffRole) => {
    const res = await revoke(userId, r);
    if (res.ok) toast.success('Role revoked.');
    else toast.error(res.error ?? 'Could not revoke.');
  };

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-8 py-10">
      <div className="flex items-center gap-3 mb-2">
        <Users size={20} className="text-primary" />
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground">
          Staff &amp; Roles
        </h1>
      </div>
      <div className="h-px w-full bg-border/60 mb-6" />

      {/* Grant form */}
      <div className="p-4 border border-dashed border-border/60 rounded-sm mb-8 space-y-3">
        <Label className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">
          Grant a staff role (by email)
        </Label>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="person@example.com"
            type="email"
            className="flex-1"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as StaffRole)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>
                {STAFF_ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <Button onClick={onGrant} disabled={busy || !email.trim()} className="gap-1.5">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
            Grant
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground/70 flex items-center gap-1.5">
          <ShieldAlert size={12} /> Granting <span className="font-medium">Administrator</span> lets that person
          manage staff too. If the email has no account yet, the grant applies automatically on their first sign-in.
        </p>
      </div>

      {/* Pending grants */}
      {pending.length > 0 && (
        <div className="mb-8">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.1em] text-foreground mb-3">
            <Clock size={15} /> Pending invites ({pending.length})
          </h2>
          <ul className="space-y-2">
            {pending.map((p, i) => (
              <li
                key={`${p.email}-${p.role}-${i}`}
                className="flex items-center gap-3 p-3 border border-border/60 rounded-sm bg-card text-sm"
              >
                <span className="flex-1 text-foreground">{p.email}</span>
                <span className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground">
                  {STAFF_ROLE_LABELS[p.role] ?? p.role}
                </span>
                <span className="text-[10px] text-muted-foreground/60 italic">applies on sign-in</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Staff list */}
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.1em] text-foreground mb-3">
        Current staff ({staff.length})
      </h2>
      {loading && staff.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
          <Loader2 size={16} className="animate-spin" /> Loading…
        </div>
      ) : (
        <ul className="space-y-2">
          {staff.map((u) => (
            <li key={u.userId} className="flex items-center gap-3 p-3 border border-border/60 rounded-sm bg-card">
              <div className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-foreground truncate">{u.displayName}</span>
                <span className="block text-xs text-muted-foreground truncate">{u.email}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 justify-end">
                {u.staffRoles.map((r) => (
                  <span
                    key={r}
                    className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full bg-primary/8 text-primary"
                  >
                    {STAFF_ROLE_LABELS[r] ?? r}
                    <button
                      onClick={() => onRevoke(u.userId, r)}
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
      )}
    </div>
  );
}
