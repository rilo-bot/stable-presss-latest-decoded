/**
 * HorseStudio — in-profile horse management as a clean, form-first screen (NOT
 * the public magazine layout). Opened inline from PartyStudio / the dashboard
 * (no route change). The owner uploads the hero image directly, edits every
 * attribute as auto-saved fields, links connections (which notify the linked
 * party), and adds media / racing / sales / report records.
 */
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Clock, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useHorseStore } from '@/stores/horseStore';
import { usePartyStore } from '@/stores/partyStore';
import { useHorsePartyLinkStore } from '@/stores/horsePartyLinkStore';
import { useAuthStore } from '@/stores/authStore';
import { canManageHorse } from '@/rbac/can';
import { ROLE_BINDINGS } from '@/lib/profile/roleMap';
import type { Horse } from '@/types/horse';
import type { PartyRole } from '@/types/party';
import type { HorsePartyRelationshipType } from '@/types/horsePartyLink';
import { HORSE_PARTY_RELATIONSHIP_LABELS, isCurrentLink } from '@/types/horsePartyLink';
import { Button } from '@/components/ui/button';
import { Section, StudioField, StudioTextArea, StudioImage } from '@/components/studio/kit';
import {
  MediaSection, RacingSection, SalesSection, ReportsSection,
} from '@/components/profile/sections';
import { MediaDataForm } from '@/components/MediaDataForm';
import { RacingDataForm } from '@/components/RacingDataForm';
import { SalesDataForm } from '@/components/SalesDataForm';
import { ReportsDataForm } from '@/components/ReportsDataForm';

/** Party roles that map to a relationship link (excludes those with no relType). */
const LINK_ROLES = Object.values(ROLE_BINDINGS)
  .filter((b) => b.relType)
  .map((b) => ({ role: b.role, rel: b.relType as HorsePartyRelationshipType, label: b.label }));

const RECORD_MODULES = [
  { key: 'media', label: 'Media', addLabel: 'media' },
  { key: 'racing', label: 'Racing', addLabel: 'racing entry' },
  { key: 'sales', label: 'Sales', addLabel: 'sale record' },
  { key: 'reports', label: 'Reports', addLabel: 'document' },
] as const;
type ModuleKey = (typeof RECORD_MODULES)[number]['key'];

interface HorseStudioProps {
  horseId: string;
  onBack: () => void;
  /** Where "Back" returns to (e.g. the owner's profile name). */
  subjectLabel?: string;
}

export function HorseStudio({ horseId, onBack, subjectLabel }: HorseStudioProps) {
  const horses = useHorseStore((s) => s.horses);
  const updateHorse = useHorseStore((s) => s.updateHorse);
  const parties = usePartyStore((s) => s.parties);
  const allLinks = useHorsePartyLinkStore((s) => s.links);
  const fetchLinks = useHorsePartyLinkStore((s) => s.fetchHorsePartyLinks);
  const addLink = useHorsePartyLinkStore((s) => s.addLink);
  const currentUser = useAuthStore((s) => s.currentUser);

  useEffect(() => { fetchLinks(); }, [fetchLinks]);

  const horse = useMemo(() => horses.find((h) => h.id === horseId), [horses, horseId]);
  const editable = canManageHorse(currentUser, horseId, { horses, links: allLinks });

  const horseLinks = useMemo(() => allLinks.filter((l) => l.horse_id === horseId), [allLinks, horseId]);
  const partyName = (pid: string) => parties.find((p) => p.id === pid)?.name ?? 'Unknown party';

  const [activeModule, setActiveModule] = useState<ModuleKey | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  useEffect(() => { setAddOpen(false); }, [activeModule]);

  const [showAddConn, setShowAddConn] = useState(false);
  const [addRole, setAddRole] = useState<PartyRole>('trainer');
  const [addPartyId, setAddPartyId] = useState('');

  if (!horse) {
    return (
      <div className="fixed inset-0 z-[70] overflow-y-auto bg-background">
        <div className="max-w-4xl mx-auto px-4 py-16 text-center text-muted-foreground">
          <Loader2 className="mx-auto animate-spin" />
          <p className="mt-2 text-sm">Loading horse…</p>
          <button onClick={onBack} className="mt-4 text-sm text-primary hover:underline">← Back</button>
        </div>
      </div>
    );
  }

  const horseName = horse.isUnnamed ? 'Un-Named' : (horse.name || 'New Horse');
  const isUnverified = horse.verificationStatus === 'unverified';
  const set = (patch: Partial<Horse>) => updateHorse(horseId, patch);
  const num = (v: string) => (v.trim() ? Number(v) : undefined);

  const addPartyOptions = parties.filter((p) => p.roles.includes(addRole));

  const submitConnection = async () => {
    if (!addPartyId) { toast.error('Choose a party to link.'); return; }
    const rel = LINK_ROLES.find((r) => r.role === addRole)?.rel;
    if (!rel) return;
    await addLink({
      horse_id: horseId,
      party_id: addPartyId,
      relationship_type: rel,
      start_date: new Date().toISOString().slice(0, 10),
    });
    toast.success(`${partyName(addPartyId)} linked as ${addRole}. They've been notified.`);
    setAddPartyId('');
    setShowAddConn(false);
  };

  const closeAdd = () => setAddOpen(false);
  const closeModule = () => setActiveModule(null);
  const renderAddForm = () => {
    switch (activeModule) {
      case 'media': return <MediaDataForm horseId={horseId} compact onSave={closeAdd} onCancel={closeAdd} />;
      case 'racing': return <RacingDataForm horseId={horseId} compact onSave={closeAdd} onCancel={closeAdd} />;
      case 'sales': return <SalesDataForm horseId={horseId} compact onSave={closeAdd} onCancel={closeAdd} />;
      case 'reports': return <ReportsDataForm horseId={horseId} compact onSave={closeAdd} onCancel={closeAdd} />;
      default: return null;
    }
  };
  const renderSection = () => {
    switch (activeModule) {
      case 'media': return <MediaSection horseIds={[horseId]} subjectName={horseName} onClose={closeModule} />;
      case 'racing': return <RacingSection horseIds={[horseId]} horses={[horse]} subjectName={horseName} onClose={closeModule} />;
      case 'sales': return <SalesSection horseIds={[horseId]} subjectName={horseName} onClose={closeModule} />;
      case 'reports': return <ReportsSection horseIds={[horseId]} subjectName={horseName} onClose={closeModule} />;
      default: return null;
    }
  };
  const activeAddLabel = RECORD_MODULES.find((m) => m.key === activeModule)?.addLabel;

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-background">
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft size={15} /> {subjectLabel ? `Back to ${subjectLabel}` : 'Back'}
          </button>
          {isUnverified && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-700">
              <Clock size={12} /> Unverified · hidden from public
            </span>
          )}
        </div>

        {/* Identity */}
        <Section title="Horse" desc="Upload a photo and set the basics. Changes save as you go.">
          <div className="flex flex-col sm:flex-row gap-5">
            <StudioImage
              src={horse.imageUrl}
              alt={horseName}
              disabled={!editable}
              onUpload={(url) => set({ imageUrl: url })}
              kind="horse"
              className="h-36 w-full sm:w-56 flex-shrink-0"
              label="Add photo"
            />
            <div className="flex-1 space-y-4">
              <StudioField label="Name" value={horse.name ?? ''} onSave={(v) => set({ name: v })} disabled={!editable || horse.isUnnamed} placeholder="e.g. Pride Of Karaka" />
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={!!horse.isUnnamed} disabled={!editable} onChange={(e) => set({ isUnnamed: e.target.checked })} />
                Un-named (foal / yearling without a registered name)
              </label>
              <div className="grid grid-cols-2 gap-4">
                <StudioField label="Sex" value={horse.sex ?? ''} onSave={(v) => set({ sex: v.trim() || undefined })} disabled={!editable} placeholder="e.g. Mare" />
                <StudioField label="Colour" value={horse.colour ?? ''} onSave={(v) => set({ colour: v.trim() || undefined })} disabled={!editable} placeholder="e.g. Bay" />
              </div>
            </div>
          </div>
        </Section>

        {/* Basics / Racing summary — left / right */}
        <div className="grid md:grid-cols-2 gap-6">
          <Section title="Basic Information">
            <div className="grid grid-cols-2 gap-4">
              <StudioField label="Foaled" type="date" value={horse.dob ?? ''} onSave={(v) => set({ dob: v || undefined })} disabled={!editable} />
              <StudioField label="Country" value={horse.country ?? ''} onSave={(v) => set({ country: v.trim() || undefined })} disabled={!editable} placeholder="e.g. NZ" />
              <StudioField label="Hands" type="number" value={horse.handsSize != null ? String(horse.handsSize) : ''} onSave={(v) => set({ handsSize: num(v) })} disabled={!editable} placeholder="e.g. 16" />
              <StudioField label="Metric (cm)" type="number" value={horse.metricSize != null ? String(horse.metricSize) : ''} onSave={(v) => set({ metricSize: num(v) })} disabled={!editable} placeholder="e.g. 163" />
            </div>
          </Section>

          <Section title="Racing Summary">
            <div className="grid grid-cols-2 gap-4">
              <StudioField label="Career record" value={horse.careerRecord ?? ''} onSave={(v) => set({ careerRecord: v.trim() || undefined })} disabled={!editable} placeholder="e.g. 12: 5-3-1" />
              <StudioField label="Winnings ($)" type="number" value={horse.careerWinnings != null ? String(horse.careerWinnings) : ''} onSave={(v) => set({ careerWinnings: num(v) })} disabled={!editable} placeholder="e.g. 250000" />
              <StudioField label="Last 10 form" value={horse.lastTenForm ?? ''} onSave={(v) => set({ lastTenForm: v.trim() || undefined })} disabled={!editable} placeholder="e.g. 1-2-1-4-1" />
              <StudioField label="Current rating" type="number" value={horse.currentRating != null ? String(horse.currentRating) : ''} onSave={(v) => set({ currentRating: num(v) })} disabled={!editable} placeholder="e.g. 92" />
            </div>
          </Section>
        </div>

        {/* Pedigree */}
        <Section title="Pedigree" desc="Sire and dam lines.">
          <div className="grid sm:grid-cols-2 gap-4">
            <StudioField label="Sire" value={horse.sire ?? ''} onSave={(v) => set({ sire: v.trim() || undefined })} disabled={!editable} />
            <StudioField label="Dam" value={horse.dam ?? ''} onSave={(v) => set({ dam: v.trim() || undefined })} disabled={!editable} />
            <StudioField label="Sire's sire" value={horse.sireSire ?? ''} onSave={(v) => set({ sireSire: v.trim() || undefined })} disabled={!editable} />
            <StudioField label="Dam's sire" value={horse.damSire ?? ''} onSave={(v) => set({ damSire: v.trim() || undefined })} disabled={!editable} />
            <StudioField label="Sire's dam" value={horse.sireDam ?? ''} onSave={(v) => set({ sireDam: v.trim() || undefined })} disabled={!editable} />
            <StudioField label="Dam's dam" value={horse.damDam ?? ''} onSave={(v) => set({ damDam: v.trim() || undefined })} disabled={!editable} />
          </div>
        </Section>

        {/* Stud Book */}
        <Section title="Stud Book" desc="Official registry details.">
          <div className="grid sm:grid-cols-2 gap-4">
            <StudioField label="Stud book" value={horse.studBook ?? ''} onSave={(v) => set({ studBook: v.trim() || undefined })} disabled={!editable} placeholder="e.g. NZ Stud Book" />
            <StudioField label="Registration no." value={horse.registrationNumber ?? ''} onSave={(v) => set({ registrationNumber: v.trim() || undefined })} disabled={!editable} />
            <StudioField label="Microchip" value={horse.microchip ?? ''} onSave={(v) => set({ microchip: v.trim() || undefined })} disabled={!editable} />
            <StudioField label="Brand / freeze" value={horse.brandFreeze ?? ''} onSave={(v) => set({ brandFreeze: v.trim() || undefined })} disabled={!editable} />
            <StudioField label="Passport no." value={horse.passportNumber ?? ''} onSave={(v) => set({ passportNumber: v.trim() || undefined })} disabled={!editable} />
          </div>
        </Section>

        {/* Editorial */}
        <Section title="Notes">
          <div className="space-y-4">
            <StudioField label="Pull quote" value={horse.pullQuote ?? ''} onSave={(v) => set({ pullQuote: v.trim() || undefined })} disabled={!editable} placeholder="A standout line for the profile" />
            <StudioTextArea label="Pedigree / general notes" value={horse.pedigreeNotes ?? ''} onSave={(v) => set({ pedigreeNotes: v })} disabled={!editable} rows={3} />
          </div>
        </Section>

        {/* Connections */}
        <Section
          title="Connections"
          desc="Link the people behind this horse. Linking notifies their account."
          right={editable ? (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowAddConn((v) => !v)}>
              <Plus size={14} /> Add
            </Button>
          ) : undefined}
        >
          {editable && showAddConn && (
            <div className="flex flex-col sm:flex-row gap-2 mb-4 p-3 rounded-md border border-border/60 bg-muted/30">
              <select
                value={addRole}
                onChange={(e) => { setAddRole(e.target.value as PartyRole); setAddPartyId(''); }}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                {LINK_ROLES.map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
              </select>
              <select
                value={addPartyId}
                onChange={(e) => setAddPartyId(e.target.value)}
                className="flex-1 h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">{addPartyOptions.length ? `Select a ${addRole}…` : `No ${addRole}s in the register`}</option>
                {addPartyOptions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <Button size="sm" onClick={submitConnection} className="flex-shrink-0">Link &amp; notify</Button>
            </div>
          )}

          {horseLinks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No connections yet.</p>
          ) : (
            <ul className="space-y-2">
              {horseLinks.map((l) => (
                <li key={l.id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                  <span className="text-sm font-medium text-foreground">{partyName(l.party_id)}</span>
                  <span className="text-[11px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">
                    {HORSE_PARTY_RELATIONSHIP_LABELS[l.relationship_type]} · {isCurrentLink(l) ? 'current' : 'past'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Records */}
        <Section title="Records" desc="Media, racing entries, sales and reports for this horse.">
          <div className="flex flex-wrap gap-2 mb-4">
            {RECORD_MODULES.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setActiveModule((p) => (p === m.key ? null : m.key))}
                className={
                  'px-3 py-1.5 rounded-md border text-sm font-medium transition-colors ' +
                  (activeModule === m.key ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground')
                }
              >
                {m.label}
              </button>
            ))}
          </div>

          {activeModule && (
            <div className="space-y-3">
              {editable && (
                addOpen ? (
                  <div className="p-3 rounded-md border border-border/60 bg-muted/30">
                    <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-muted-foreground mb-2">Add {activeAddLabel}</p>
                    {renderAddForm()}
                  </div>
                ) : (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAddOpen(true)}>
                    <Plus size={14} /> Add {activeAddLabel}
                  </Button>
                )
              )}
              {renderSection()}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
