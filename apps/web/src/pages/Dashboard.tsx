import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useOrgStore } from '@/stores/orgStore';
import { useClaimStore } from '@/stores/claimStore';
import { useHorseStore } from '@/stores/horseStore';
import { useHorsePartyLinkStore } from '@/stores/horsePartyLinkStore';
import { authorisedHorseIds, previewHorseIds, hasProvisionalParty, primaryPartyId, isStaff } from '@/rbac/can';
import { can } from '@/lib/permissions';
import { PARTY_ROLES, PARTY_ROLE_LABELS } from '@/types/party';
import type { PartyRole } from '@/types/party';
import type { Horse } from '@/types/horse';
import { ROLE_BINDINGS } from '@/lib/profile/roleMap';
import { TIER_ORDER, TIER_LABELS } from '@/rbac/entitlement';
import type { SubscriptionTier } from '@/rbac/entitlement';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { HorseForm } from '@/components/HorseForm';
import { AddHorseChoice } from '@/components/AddHorseChoice';
import { SectionHeading } from '@/components/SectionHeading';
import { toast } from 'sonner';
import {
  Newspaper, Star, Mic, HelpCircle, Building2, ShieldCheck, Users, PlusCircle, Loader2, Crown, Check, BookOpen, Clock, Lock,
} from 'lucide-react';

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border border-border/60 rounded-sm bg-card p-5">
      <SectionHeading icon={icon} className="mb-4">{title}</SectionHeading>
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
  const addHorse = useHorseStore((s) => s.addHorse);
  const links = useHorsePartyLinkStore((s) => s.links);
  const fetchLinks = useHorsePartyLinkStore((s) => s.fetchHorsePartyLinks);
  const navigate = useNavigate();

  const [claimRole, setClaimRole] = useState<PartyRole>('owner');
  const [orgName, setOrgName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [addChooser, setAddChooser] = useState(false); // pick guided vs quick form
  const [quickForm, setQuickForm] = useState(false);   // the quick HorseForm modal

  useEffect(() => {
    void fetchMine();
    void fetchHorses();
    void fetchLinks();
  }, [fetchMine, fetchHorses, fetchLinks]);

  // Verified scope = horses the user can actually manage (write).
  const stableHorses = useMemo(() => {
    const ids = new Set(authorisedHorseIds(currentUser, { horses, links }));
    return horses.filter((h) => ids.has(h.id));
  }, [currentUser, horses, links]);

  // Pending-only scope = horses visible read-only while a claim awaits verification.
  const previewHorses = useMemo(() => {
    const verified = new Set(authorisedHorseIds(currentUser, { horses, links }));
    const preview = new Set(previewHorseIds(currentUser, { horses, links }));
    return horses.filter((h) => preview.has(h.id) && !verified.has(h.id));
  }, [currentUser, horses, links]);

  if (!currentUser) return null;
  const staff = isStaff(currentUser);
  // Was roles.includes('administrator') — roles[] no longer carries staff slugs.
  const admin = can('platform.admin');
  const claims = currentUser.partyClaims ?? [];
  // Provisional = a self-registered party they can edit NOW (hidden from public
  // until verified). Awaiting-existing = a claim on a pre-existing party that
  // stays view-only until an admin/org approves it.
  const provisional = hasProvisionalParty(currentUser);
  const awaitingExisting = claims.some((c) => c.status === 'pending' && !c.selfRegistered);
  const myPartyId = primaryPartyId(currentUser);

  const onClaim = async () => {
    setBusy('claim');
    const r = await createClaim(claimRole);
    setBusy(null);
    if (r.ok) toast.success('Claim submitted for verification.');
    else toast.error(r.error ?? 'Could not submit claim.');
  };

  // First-run: create the member's profile in one click (quick role pick above)
  // and drop them straight into their hub to add details + horses.
  const onCreateProfile = async () => {
    setBusy('create');
    const r = await createClaim(claimRole);
    setBusy(null);
    if (!r.ok) { toast.error(r.error ?? 'Could not create your profile.'); return; }
    toast.success('Profile created — add your details and horses next.');
    const pid = primaryPartyId(useAuthStore.getState().currentUser);
    navigate(pid ? `/studio/${pid}` : '/dashboard');
  };

  // One-click: create an un-named draft horse (photo-first, name later) and drop
  // straight into its studio. We tag the creating party in the *Ids field for
  // THEIR role (owner→ownerIds, trainer→trainerIds, …) so the server auto-links
  // them under that role and they appear in the matching connection box.
  // Pre-link the member to a new horse under THEIR claimed role (owner→ownerIds,
  // trainer→trainerIds, …) so the server auto-links them in the matching box.
  const myConnect = (): Partial<Horse> => {
    const myRole: PartyRole = claims.find((c) => c.partyId === myPartyId)?.role ?? 'owner';
    const c: Partial<Horse> = {};
    if (myPartyId) (c as Record<string, string[]>)[ROLE_BINDINGS[myRole].horseField] = [myPartyId];
    return c;
  };

  // Guided path: create an un-named draft (photo-first) and drop into its studio.
  const onAddHorseGuided = async () => {
    setAddChooser(false);
    setBusy('horse');
    const created = await addHorse({ ...myConnect(), name: '', isUnnamed: true, pedigreeNotes: '' });
    setBusy(null);
    if (created) navigate(`/studio/horse/${created.id}`);
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

      {/* First-run: create your profile (quick role pick → one click → hub) */}
      {!staff && !myPartyId && (
        <section className="rounded-lg border border-primary/30 bg-primary/5 p-5">
          <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-foreground">Set up your racing profile</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Pick your role and we&rsquo;ll create your profile in one click — then add your details
            and horses at your own pace. Nothing is public until a staff member verifies it.
          </p>
          <div className="flex flex-wrap gap-2 mt-3 mb-4">
            {PARTY_ROLES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setClaimRole(r)}
                className={
                  'rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ' +
                  (claimRole === r
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card text-muted-foreground border-border hover:border-primary/60 hover:text-foreground')
                }
              >
                {PARTY_ROLE_LABELS[r]}
              </button>
            ))}
          </div>
          <Button onClick={onCreateProfile} disabled={busy === 'create'} className="gap-1.5">
            {busy === 'create' ? <Loader2 size={14} className="animate-spin" /> : <PlusCircle size={14} />}
            Create my profile
          </Button>
        </section>
      )}

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
          {provisional && (
            <div className="flex items-start gap-2 mb-3 rounded-sm border border-primary/30 bg-primary/5 px-3 py-2">
              <ShieldCheck size={14} className="mt-0.5 shrink-0 text-primary" />
              <p className="text-[11px] leading-snug text-foreground/80">
                Your profile is live in <span className="font-semibold">provisional</span> mode —
                visible only to you while a staff member verifies your claim. You can register
                horses and add their data now; everything stays hidden from the public site until
                it&rsquo;s verified.
              </p>
            </div>
          )}

          {awaitingExisting && (
            <div className="flex items-start gap-2 mb-3 rounded-sm border border-amber-500/30 bg-amber-500/10 px-3 py-2">
              <Clock size={14} className="mt-0.5 shrink-0 text-amber-600" />
              <p className="text-[11px] leading-snug text-amber-700">
                You&rsquo;ve claimed an existing party record. You can preview its stable below in{' '}
                <span className="font-semibold">view-only</span> mode — editing unlocks once an admin
                or your organisation approves it.
              </p>
            </div>
          )}

          {myPartyId && (
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <button
                type="button"
                onClick={() => setAddChooser(true)}
                disabled={busy === 'horse'}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {busy === 'horse' ? <Loader2 size={14} className="animate-spin" /> : <PlusCircle size={14} />}
                {stableHorses.length === 0 ? 'Add your first horse' : 'Add a horse'}
              </button>
              <Link
                to={`/studio/${myPartyId}`}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
              >
                Manage my profile
              </Link>
            </div>
          )}

          {stableHorses.length === 0 && previewHorses.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {myPartyId
                ? 'Add your first horse above — start with a photo, name it later, and finish the details at your own pace.'
                : 'Horses you have a verified, current link to will appear here.'}
            </p>
          ) : (
            <div className="space-y-3">
              {stableHorses.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {stableHorses.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() => navigate(`/studio/horse/${h.id}`)}
                      className="p-2 border border-border/60 rounded-sm text-sm text-foreground hover:border-primary/50 transition-colors truncate text-left"
                    >
                      {h.name}
                    </button>
                  ))}
                </div>
              )}

              {previewHorses.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.12em] font-bold text-muted-foreground mb-1.5">
                    Pending verification · view only
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {previewHorses.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => navigate(`/horses/${h.id}`)}
                        className="flex items-center gap-1.5 p-2 border border-dashed border-amber-500/40 bg-amber-500/5 rounded-sm text-sm text-muted-foreground hover:text-foreground transition-colors truncate w-full text-left"
                        title="View only until your claim is verified"
                      >
                        <Lock size={12} className="shrink-0 text-amber-600" />
                        <span className="truncate">{h.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Section>

        {/* Add-a-horse: pick guided studio vs quick form */}
        <AddHorseChoice
          open={addChooser}
          onClose={() => setAddChooser(false)}
          onGuided={onAddHorseGuided}
          onQuick={() => { setAddChooser(false); setQuickForm(true); }}
        />
        <HorseForm open={quickForm} onClose={() => setQuickForm(false)} memberMode defaultConnect={myConnect()} />

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
            <p className="text-sm text-muted-foreground mb-3">
              Story workflow, thoroughbred records, parties, media and racing data all live in the
              production system.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/newsroom"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-border/60 text-sm hover:border-primary/50 transition-colors"
              >
                <Newspaper size={15} /> Newsroom Production System
              </Link>
              {admin && (
                <Link
                  to="/claims"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-border/60 text-sm hover:border-primary/50 transition-colors"
                >
                  <ShieldCheck size={15} /> Verify Claims
                </Link>
              )}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
