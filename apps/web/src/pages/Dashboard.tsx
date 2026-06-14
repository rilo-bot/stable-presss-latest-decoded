import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useOrgStore } from '@/stores/orgStore';
import { useClaimStore } from '@/stores/claimStore';
import { useHorseStore } from '@/stores/horseStore';
import { useHorsePartyLinkStore } from '@/stores/horsePartyLinkStore';
import { authorisedHorseIds, isStaff } from '@/rbac/can';
import { PARTY_ROLES, PARTY_ROLE_LABELS } from '@/types/party';
import type { PartyRole } from '@/types/party';
import { TIER_ORDER, TIER_LABELS } from '@/rbac/entitlement';
import type { SubscriptionTier } from '@/rbac/entitlement';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  Newspaper, Star, Mic, HelpCircle, Building2, ShieldCheck, Users, PlusCircle, Loader2, Crown, Check, BookOpen,
} from 'lucide-react';

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border border-border/60 rounded-sm bg-card p-5">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.1em] text-foreground mb-4">
        {icon} {title}
      </h2>
      {children}
    </section>
  );
}

export default function Dashboard() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const setTier = useAuthStore((s) => s.setSubscriptionTier);
  const mine = useOrgStore((s) => s.mine);
  const fetchMine = useOrgStore((s) => s.fetchMine);
  const createOrg = useOrgStore((s) => s.createOrg);
  const createClaim = useClaimStore((s) => s.createClaim);
  const horses = useHorseStore((s) => s.horses);
  const fetchHorses = useHorseStore((s) => s.fetchHorses);
  const links = useHorsePartyLinkStore((s) => s.links);
  const fetchLinks = useHorsePartyLinkStore((s) => s.fetchHorsePartyLinks);
  const navigate = useNavigate();

  const [claimRole, setClaimRole] = useState<PartyRole>('owner');
  const [orgName, setOrgName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void fetchMine();
    void fetchHorses();
    void fetchLinks();
  }, [fetchMine, fetchHorses, fetchLinks]);

  const stableHorses = useMemo(() => {
    const ids = new Set(authorisedHorseIds(currentUser, { horses, links }));
    return horses.filter((h) => ids.has(h.id));
  }, [currentUser, horses, links]);

  if (!currentUser) return null;
  const staff = isStaff(currentUser);
  const admin = currentUser.roles.includes('administrator');
  const claims = currentUser.partyClaims ?? [];

  const onClaim = async () => {
    setBusy('claim');
    const r = await createClaim(claimRole);
    setBusy(null);
    if (r.ok) toast.success('Claim submitted for verification.');
    else toast.error(r.error ?? 'Could not submit claim.');
  };

  const onCreateOrg = async () => {
    if (!orgName.trim()) return;
    setBusy('org');
    const r = await createOrg({ name: orgName.trim() });
    setBusy(null);
    if (r.ok && r.id) {
      toast.success('Organisation created.');
      navigate(`/orgs/${r.id}`);
    } else toast.error(r.error ?? 'Could not create organisation.');
  };

  const onTier = async (tier: SubscriptionTier) => {
    if (tier === currentUser.subscriptionTier) return;
    setBusy('tier');
    const r = await setTier(tier);
    setBusy(null);
    if (r.ok) toast.success(`You're now on the ${TIER_LABELS[tier]} plan.`);
    else toast.error(r.error ?? 'Could not change plan.');
  };

  const quickLinks = [
    { to: '/news', label: 'News', icon: <Newspaper size={15} /> },
    { to: '/horses', label: 'Horses', icon: <Star size={15} /> },
    { to: '/tipping', label: 'Tipping Ring', icon: <HelpCircle size={15} /> },
    { to: '/podcast', label: 'Podcast', icon: <Mic size={15} /> },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 py-10 space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-foreground">
          Welcome, {currentUser.displayName}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your roles:{' '}
          <span className="text-foreground font-medium">{currentUser.roles.join(', ')}</span>
          <span className="mx-2">·</span>
          Plan:{' '}
          <span
            className="text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full"
            style={{ background: 'hsl(var(--brand-accent) / 0.14)', color: 'hsl(var(--brand-accent))' }}
          >
            {TIER_LABELS[currentUser.subscriptionTier]}
          </span>
        </p>
        <div className="h-px w-full bg-border/60 mt-4" />
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap gap-2">
        {quickLinks.map((q) => (
          <Link
            key={q.to}
            to={q.to}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-border/60 text-sm text-foreground hover:border-primary/50 transition-colors"
          >
            {q.icon} {q.label}
          </Link>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Subscription */}
        <Section title="Your Plan" icon={<Crown size={15} />}>
          <div className="flex gap-2">
            {TIER_ORDER.map((tier) => {
              const active = currentUser.subscriptionTier === tier;
              return (
                <button
                  key={tier}
                  onClick={() => onTier(tier)}
                  disabled={busy === 'tier'}
                  className={
                    'flex-1 px-3 py-2 rounded-md border text-sm font-medium transition-colors ' +
                    (active
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-input text-muted-foreground hover:border-primary/50')
                  }
                >
                  {active && <Check size={13} className="inline mr-1" />}
                  {TIER_LABELS[tier]}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground/70 mt-2">
            Premium content is gated by plan. (Billing is not wired up — switch freely for now.)
          </p>
        </Section>

        {/* Racing roles */}
        <Section title="Racing Roles" icon={<Star size={15} />}>
          {claims.length > 0 ? (
            <ul className="space-y-1.5 mb-3">
              {claims.map((c) => (
                <li key={c.id} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{PARTY_ROLE_LABELS[c.role] ?? c.role}</span>
                  <span
                    className={
                      'text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full ' +
                      (c.status === 'verified'
                        ? 'bg-emerald-500/15 text-emerald-600'
                        : c.status === 'pending'
                          ? 'bg-amber-500/15 text-amber-600'
                          : 'bg-destructive/15 text-destructive')
                    }
                  >
                    {c.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground mb-3">You haven&rsquo;t claimed any racing roles yet.</p>
          )}
          <div className="flex gap-2">
            <select
              value={claimRole}
              onChange={(e) => setClaimRole(e.target.value as PartyRole)}
              className="flex-1 h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              {PARTY_ROLES.map((r) => (
                <option key={r} value={r}>
                  {PARTY_ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={onClaim} disabled={busy === 'claim'} className="gap-1.5">
              {busy === 'claim' ? <Loader2 size={14} className="animate-spin" /> : <PlusCircle size={14} />}
              Claim
            </Button>
          </div>
        </Section>

        {/* My stable */}
        <Section title="My Stable" icon={<BookOpen size={15} />}>
          {stableHorses.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Horses you have a verified, current link to will appear here.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {stableHorses.map((h) => (
                <Link
                  key={h.id}
                  to={`/horses/${h.id}`}
                  className="p-2 border border-border/60 rounded-sm text-sm text-foreground hover:border-primary/50 transition-colors truncate"
                >
                  {h.name}
                </Link>
              ))}
            </div>
          )}
        </Section>

        {/* Organisations */}
        <Section title="Organisations" icon={<Building2 size={15} />}>
          {mine.length > 0 && (
            <ul className="space-y-1.5 mb-3">
              {mine.map((o) => (
                <li key={o.id}>
                  <Link
                    to={`/orgs/${o.id}`}
                    className="flex items-center justify-between text-sm text-foreground hover:text-primary transition-colors"
                  >
                    <span>{o.name}</span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{o.myRole.replace('org_', '')}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="New organisation name" />
            <Button size="sm" onClick={onCreateOrg} disabled={busy === 'org' || !orgName.trim()} className="gap-1.5">
              {busy === 'org' ? <Loader2 size={14} className="animate-spin" /> : <PlusCircle size={14} />}
              Create
            </Button>
          </div>
        </Section>

        {/* Staff / admin */}
        {staff && (
          <Section title="Newsroom & Staff" icon={<Users size={15} />}>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/newsroom"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-border/60 text-sm hover:border-primary/50 transition-colors"
              >
                <Newspaper size={15} /> Newsroom CMS
              </Link>
              {admin && (
                <>
                  <Link
                    to="/claims"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-border/60 text-sm hover:border-primary/50 transition-colors"
                  >
                    <ShieldCheck size={15} /> Verify Claims
                  </Link>
                  <Link
                    to="/staff"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-border/60 text-sm hover:border-primary/50 transition-colors"
                  >
                    <Users size={15} /> Manage Staff
                  </Link>
                </>
              )}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
