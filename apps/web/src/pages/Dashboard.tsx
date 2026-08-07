import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useOrgStore } from '@/stores/orgStore';
import { useHorseStore } from '@/stores/horseStore';
import { usePartyStore } from '@/stores/partyStore';
import { authorisedHorseIds, primaryPartyId, isAdmin } from '@/rbac/can';
import { can } from '@/lib/permissions';
import { PARTY_ROLES, PARTY_ROLE_LABELS } from '@/types/party';
import type { PartyRole } from '@/types/party';
import type { Horse } from '@/types/horse';
import { ensureConnection } from '@/lib/horseConnections';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { HorseForm, type ConnectFields } from '@/components/HorseForm';
import { AddHorseChoice } from '@/components/AddHorseChoice';
import { SectionHeading } from '@/components/SectionHeading';
import { toast } from 'sonner';
import {
  Newspaper, Star, Mic, HelpCircle, Building2, Users, PlusCircle, Loader2, Crown, Check, BookOpen, Clock, Lock,
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
  const mine = useOrgStore((s) => s.mine);
  const fetchMine = useOrgStore((s) => s.fetchMine);
  const createOrg = useOrgStore((s) => s.createOrg);
  const horses = useHorseStore((s) => s.horses);
  const fetchHorses = useHorseStore((s) => s.fetchHorses);
  const addHorse = useHorseStore((s) => s.addHorse);
  const parties = usePartyStore((s) => s.parties);
  const fetchParties = usePartyStore((s) => s.fetchParties);
  const claimParty = usePartyStore((s) => s.claimParty);
  const addParty = usePartyStore((s) => s.addParty);
  const navigate = useNavigate();

  // Signup can hand off the role the member picked (`/dashboard?claim=trainer`),
  // so they land on the right shortlist instead of a default they must re-pick.
  const [searchParams] = useSearchParams();
  const [claimRole, setClaimRole] = useState<PartyRole>(() => {
    const wanted = searchParams.get('claim');
    return PARTY_ROLES.includes(wanted as PartyRole) ? (wanted as PartyRole) : 'owner';
  });
  const [orgName, setOrgName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [addChooser, setAddChooser] = useState(false); // pick guided vs quick form
  const [quickForm, setQuickForm] = useState(false);   // the quick HorseForm modal

  useEffect(() => {
    void fetchMine();
    void fetchHorses();
    void fetchParties();
  }, [fetchMine, fetchHorses, fetchParties]);

  // A claimed edge IS the access — there is no pending state, so there is no
  // second read-only 'preview' scope any more.
  const stableHorses = useMemo(() => {
    const ids = new Set(authorisedHorseIds(currentUser, { parties, horses }));
    return horses.filter((h) => ids.has(h.id));
  }, [currentUser, horses, parties]);

  // Unclaimed entries in the register, for "find yourself". The register is
  // shared and admin-created: someone who needs an identity CLAIMS the entry
  // that already represents them rather than minting a rival one.
  const claimable = useMemo(
    () => parties.filter((p) => !p.taken && p.role === claimRole),
    [parties, claimRole],
  );

  if (!currentUser) return null;
  const admin = isAdmin(currentUser);
  // The edges this account has claimed. Every one is live — there is no
  // pending/verified split, so there is no status to render.
  const claims = currentUser.parties ?? [];
  const myPartyId = primaryPartyId(currentUser);

  // Claiming is IMMEDIATE — the server has no verification step, so there is
  // nothing to submit and nothing to wait for.
  const onClaim = async (edgeId: string) => {
    setBusy(edgeId);
    const r = await claimParty(edgeId);
    setBusy(null);
    if (!r.ok) { toast.error(r.error ?? 'Could not claim that entry.'); return; }
    toast.success('Claimed — that entry is yours.');
    const pid = primaryPartyId(useAuthStore.getState().currentUser);
    if (pid) navigate(`/studio/${pid}`);
  };

  // Pre-link the member to a new horse under THEIR claimed role, so they appear
  // in the matching connection box. A link is a party EDGE, and an edge points at
  // a PERSON — so this carries `personId`, never the edge's own id.
  const myEdge = () => claims.find((c) => c.id === myPartyId);
  const myConnect = (): ConnectFields => {
    const mine = myEdge();
    return mine ? { [mine.role]: [mine.personId] } : {};
  };

  // Guided path: create an un-named draft (photo-first) and drop into its studio.
  // The horse is saved first, then linked — the edge needs its id.
  //
  // The register is re-read in between because the SERVER also links the creator
  // on POST /api/horses. Without the refresh this would add a duplicate edge and
  // the member would appear twice in their own connection box.
  const onAddHorseGuided = async () => {
    setAddChooser(false);
    setBusy('horse');
    const created = await addHorse({ name: '', isUnnamed: true, pedigreeNotes: '' });
    if (created) {
      const mine = myEdge();
      if (mine) {
        await fetchParties(true);
        await ensureConnection(
          usePartyStore.getState().parties,
          created.id,
          mine.personId,
          mine.role,
          addParty,
        );
      }
    }
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
          Welcome, {currentUser.name}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Your roles:{' '}
          <span className="text-foreground font-medium">{currentUser.roles.join(', ')}</span>
        </p>
        <div className="h-px w-full bg-border/60 mt-4" />
      </div>

      {/* First-run: find yourself in the register and claim your entry.
          The register is shared and admin-maintained — you claim the entry that
          already represents you rather than minting a rival one. Claiming takes
          effect immediately; there is nothing to wait for. */}
      {!admin && !myPartyId && (
        <section className="rounded-lg border border-primary/30 bg-primary/5 p-5">
          <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-foreground">Find yourself in the register</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Pick your role, then claim the entry that&rsquo;s you. It takes effect straight away and
            unlocks the horses you&rsquo;re connected to.
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
          {claimable.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No unclaimed {PARTY_ROLE_LABELS[claimRole].toLowerCase()} entries. Ask a Stable Press
              administrator to add you to the register.
            </p>
          ) : (
            <ul className="space-y-1.5 max-h-56 overflow-y-auto">
              {claimable.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-sm border border-border/60 bg-card px-3 py-2">
                  <span className="flex-1 min-w-0 truncate text-sm text-foreground">{p.name}</span>
                  <Button size="sm" onClick={() => void onClaim(p.id)} disabled={busy === p.id} className="gap-1.5">
                    {busy === p.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    This is me
                  </Button>
                </li>
              ))}
            </ul>
          )}
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
        {/* Racing roles */}
        <Section title="Racing Roles" icon={<Star size={15} />}>
          {/* Every claimed edge is live, so there is no status column — the row
              itself is the fact. Each one names the horse it attaches to, since
              that is what the role actually gives you. */}
          {claims.length > 0 ? (
            <ul className="space-y-1.5 mb-3">
              {claims.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-foreground">{PARTY_ROLE_LABELS[c.role] ?? c.role}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {c.horseId
                      ? (horses.find((h) => h.id === c.horseId)?.name ?? 'a horse')
                      : 'no horse attached'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground mb-3">You haven&rsquo;t claimed any racing roles yet.</p>
          )}
          {myPartyId && (
            <Link
              to={`/studio/${myPartyId}`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
            >
              <PlusCircle size={13} /> Edit my profile
            </Link>
          )}
        </Section>

        {/* My stable */}
        <Section title="My Stable" icon={<BookOpen size={15} />}>
          {false && (
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

          {/* One list. A claimed edge grants edit access outright, so there is
              no second view-only tier of horses to separate out. */}
          {stableHorses.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {myPartyId
                ? 'Add your first horse above — start with a photo, name it later, and finish the details at your own pace.'
                : 'Horses attached to an entry you have claimed will appear here.'}
            </p>
          ) : (
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

        {/* Admin */}
        {admin && (
          <Section title="Production System" icon={<Users size={15} />}>
            <p className="text-sm text-muted-foreground mb-3">
              Story workflow, thoroughbred records, parties, media and racing data all live in the
              production system.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                to="/production-system"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-border/60 text-sm hover:border-primary/50 transition-colors"
              >
                <Newspaper size={15} /> Production System
              </Link>
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
