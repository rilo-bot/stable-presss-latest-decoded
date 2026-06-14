/**
 * PartyStudio — the member's OWN profile, as a clean form-first editor (not the
 * public magazine layout). The party is the hub: upload your photo directly,
 * fill your details (auto-saved on blur), then register/manage your horses at the
 * bottom. Clicking a horse opens the form-first HorseStudio inline (no redirect).
 *
 * Rendered for the member-owner of a party; the public/staff see the magazine
 * PartyDetail. Writes are server ownership-scoped (provisional access).
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, PlusCircle, Loader2, Check, ChevronRight, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { usePartyStore } from '@/stores/partyStore';
import { useHorseStore } from '@/stores/horseStore';
import { useHorsePartyLinkStore } from '@/stores/horsePartyLinkStore';
import { useMemberOnboardingStore } from '@/stores/memberOnboardingStore';
import { canManageParty } from '@/rbac/can';
import { horsesLinkedToParty } from '@/rbac/scope';
import {
  PARTY_ROLE_LABELS, PERSONNEL_SUBTYPES, PERSONNEL_SUBTYPE_LABELS, getStartedYearLabel,
} from '@/types/party';
import type { Party, PartyRole, PersonnelSubtype } from '@/types/party';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Section, StudioField, StudioImage } from '@/components/studio/kit';
import { HorseStudio } from '@/components/HorseStudio';

/** Whole-years age from a YYYY-MM-DD string, or null. */
function calcAge(dob?: string): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age >= 0 ? age : null;
}

const CURRENT_YEAR = new Date().getFullYear();

interface PartyStudioProps {
  partyId: string;
  /** Optional back affordance (e.g. when opened from the dashboard). */
  onBack?: () => void;
}

export function PartyStudio({ partyId, onBack }: PartyStudioProps) {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.currentUser);
  const parties = usePartyStore((s) => s.parties);
  const fetchParties = usePartyStore((s) => s.fetchParties);
  const updateParty = usePartyStore((s) => s.updateParty);
  const horses = useHorseStore((s) => s.horses);
  const fetchHorses = useHorseStore((s) => s.fetchHorses);
  const addHorse = useHorseStore((s) => s.addHorse);
  const links = useHorsePartyLinkStore((s) => s.links);
  const fetchLinks = useHorsePartyLinkStore((s) => s.fetchHorsePartyLinks);
  const dismissedWelcome = useMemberOnboardingStore((s) => !!s.dismissedByUser[currentUser?.id ?? '']);
  const dismissWelcome = useMemberOnboardingStore((s) => s.dismiss);

  useEffect(() => { fetchParties(); fetchHorses(); fetchLinks(); }, [fetchParties, fetchHorses, fetchLinks]);

  const [studioHorseId, setStudioHorseId] = useState<string | null>(null);
  const [newHorseName, setNewHorseName] = useState('');
  const [adding, setAdding] = useState(false);

  const party = useMemo(() => parties.find((p) => p.id === partyId), [parties, partyId]);
  const editable = canManageParty(currentUser, partyId);

  const myHorses = useMemo(() => {
    const linked = new Set(horsesLinkedToParty(partyId, { horses, links }));
    return horses.filter((h) => linked.has(h.id) || h.createdByUserId === currentUser?.id);
  }, [horses, links, partyId, currentUser]);

  if (!party) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-muted-foreground">
        <Loader2 className="mx-auto animate-spin" /> <p className="mt-2 text-sm">Loading your profile…</p>
      </div>
    );
  }

  const roles = party.roles ?? [];
  const primaryRole: PartyRole | undefined = roles[0];
  const roleLabel = primaryRole ? PARTY_ROLE_LABELS[primaryRole] : 'Member';
  const age = calcAge(party.date_of_birth);
  const isUnverified = party.verificationStatus === 'unverified';
  const isPerson = party.party_type !== 'organisation';
  const subtypes = party.personnel_subtype ?? [];

  const set = (patch: Partial<Party>) => updateParty(partyId, patch);

  const toggleSubtype = (s: PersonnelSubtype) => {
    const next = subtypes.includes(s) ? subtypes.filter((x) => x !== s) : [...subtypes, s];
    void set({ personnel_subtype: next });
  };

  const onAddHorse = async () => {
    const name = newHorseName.trim();
    if (!name) { toast.error('Enter a horse name.'); return; }
    setAdding(true);
    try {
      await addHorse({ name, pedigreeNotes: '', ownerIds: [partyId] });
      toast.success(`${name} registered — open it to add details.`);
      setNewHorseName('');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft size={15} /> Back
            </button>
          )}
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground">My Profile</h1>
        </div>
        {isUnverified && (
          <span
            title="Visible only to you until a staff member verifies your claim"
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-700"
          >
            <Clock size={12} /> Provisional · hidden from public
          </span>
        )}
      </div>

      {/* First-run welcome strip (dismissible per user) */}
      {editable && !dismissedWelcome && (
        <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Welcome to Stable Press 👋</p>
            <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">
              This is your profile. Add your photo and details below, and register your horses
              whenever you like — there&rsquo;s no rush, and nothing is public until a staff member
              verifies it.
            </p>
          </div>
          <button
            onClick={() => currentUser && dismissWelcome(currentUser.id)}
            className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Skip <X size={13} />
          </button>
        </div>
      )}

      {/* Identity card */}
      <Section title="Identity" desc="This is how you appear across Stable Press.">
        <div className="flex flex-col sm:flex-row gap-5">
          {isPerson && (
            <StudioImage
              src={party.photo}
              alt={party.name}
              disabled={!editable}
              onUpload={(url) => set({ photo: url })}
              kind="party"
              className="h-32 w-32 flex-shrink-0"
              label="Add photo"
            />
          )}
          <div className="flex-1 grid sm:grid-cols-2 gap-4">
            <StudioField label={isPerson ? 'Full name' : 'Organisation name'} value={party.name ?? ''} onSave={(v) => set({ name: v.trim() })} disabled={!editable} placeholder="e.g. Ciaron Maher" />
            <div className="space-y-1">
              <span className="text-[11px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">Role</span>
              <div className="flex flex-wrap gap-1.5">
                {roles.length === 0 ? <span className="text-sm text-muted-foreground">—</span> : roles.map((r) => (
                  <span key={r} className="rounded-full bg-primary/10 text-primary border border-primary/25 px-2.5 py-0.5 text-xs font-medium">{PARTY_ROLE_LABELS[r]}</span>
                ))}
              </div>
            </div>
            <StudioField label="Profession" value={party.profession ?? ''} onSave={(v) => set({ profession: v.trim() || undefined })} disabled={!editable} placeholder={isPerson ? 'e.g. Thoroughbred Trainer' : 'e.g. Bloodstock Agency'} />
          </div>
        </div>
      </Section>

      {/* Details — left / right */}
      <div className="grid md:grid-cols-2 gap-6">
        <Section title="Personal Details">
          <div className="space-y-4">
            {isPerson && (
              <StudioField
                label="Date of birth"
                type="date"
                value={party.date_of_birth ?? ''}
                onSave={(v) => set({ date_of_birth: v || undefined })}
                disabled={!editable}
                max={new Date().toISOString().split('T')[0]}
                hint={age !== null ? `${age} years old` : undefined}
              />
            )}
            <StudioField label="Country of birth" value={party.country_of_birth ?? ''} onSave={(v) => set({ country_of_birth: v.trim() || undefined })} disabled={!editable} placeholder="e.g. New Zealand" />
          </div>
        </Section>

        <Section title="Base & Experience">
          <div className="space-y-4">
            <StudioField label="Base location" value={party.base_location ?? ''} onSave={(v) => set({ base_location: v.trim() || undefined })} disabled={!editable} placeholder="e.g. Karaka, Auckland" />
            <StudioField
              label={getStartedYearLabel(roles)}
              type="number"
              min={1900}
              max={CURRENT_YEAR}
              value={party.started_year ? String(party.started_year) : ''}
              onSave={(v) => set({ started_year: v ? parseInt(v, 10) : undefined })}
              disabled={!editable}
              placeholder={`e.g. ${CURRENT_YEAR - 10}`}
              hint={party.started_year ? `${CURRENT_YEAR - party.started_year} years in the industry` : undefined}
            />
          </div>
        </Section>
      </div>

      {/* Personnel subtypes (only relevant for the personnel role) */}
      {roles.includes('personnel') && (
        <Section title="Personnel Type" desc="Select all that apply.">
          <div className="flex flex-wrap gap-2">
            {PERSONNEL_SUBTYPES.map((s) => {
              const active = subtypes.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  disabled={!editable}
                  onClick={() => toggleSubtype(s)}
                  className={
                    'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all border ' +
                    (active ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:border-primary/60 hover:text-foreground')
                  }
                >
                  {active && <Check size={11} strokeWidth={3} />} {PERSONNEL_SUBTYPE_LABELS[s]}
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {/* My Horses */}
      <Section
        title="My Horses"
        desc="Register your horses, then open one to add its data. New horses stay hidden from the public until verified."
      >
        {editable && (
          <div className="flex gap-2 mb-4">
            <Input
              value={newHorseName}
              onChange={(e) => setNewHorseName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void onAddHorse(); }}
              placeholder="New horse name…"
            />
            <Button onClick={onAddHorse} disabled={adding || !newHorseName.trim()} className="gap-1.5 flex-shrink-0">
              {adding ? <Loader2 size={14} className="animate-spin" /> : <PlusCircle size={14} />} Register
            </Button>
          </div>
        )}

        {myHorses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No horses yet — register one above to start your stable.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {myHorses.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => setStudioHorseId(h.id)}
                className="flex items-center gap-3 rounded-md border border-border/60 p-2.5 text-left hover:border-primary/50 transition-colors"
              >
                <div className="h-11 w-11 rounded-md overflow-hidden border border-border/60 bg-muted flex-shrink-0">
                  {h.imageUrl && <img src={h.imageUrl} alt={h.name} crossOrigin="anonymous" className="h-full w-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-foreground truncate">{h.isUnnamed ? 'Un-Named' : h.name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {[h.sex, h.colour].filter(Boolean).join(' · ') || 'Add details'}
                    {h.verificationStatus === 'unverified' && <span className="ml-1 text-amber-600">· unverified</span>}
                  </div>
                </div>
                <ChevronRight size={15} className="text-muted-foreground flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </Section>

      <div className="text-center">
        <button onClick={() => navigate(`/parties/${partyId}?public=1`)} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
          Preview my public profile
        </button>
      </div>

      {studioHorseId && (
        <HorseStudio horseId={studioHorseId} onBack={() => setStudioHorseId(null)} subjectLabel="My Profile" />
      )}
    </div>
  );
}
