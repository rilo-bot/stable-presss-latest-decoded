import type { Party } from '@/types/party';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AiTextarea } from '@/agent/compose/AiTextarea';
import { Users } from 'lucide-react';
import { Section, SelectField } from './fields';
import { PartyPicker } from './PartyPicker';
import { ImageUploader } from './ImageUploader';
import {
  SEX_OPTIONS,
  COLOUR_OPTIONS,
  COUNTRY_OPTIONS,
  CURRENT_YEAR,
  type FormData,
} from './constants';

type SetField = (
  field: keyof FormData,
  value: string | number | boolean | string[] | undefined
) => void;

/* ════════════════════════════
    SECTION 1 — Basic Information
    ════════════════════════════ */
export function BasicSection({ form, setField }: { form: FormData; setField: SetField }) {
  return (
    <Section title="Basic Information" number="1">
      {/* Horse Name + Un-Named toggle */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="horse-name" className="text-xs font-semibold">
            Horse Name <span className="text-destructive">*</span>
          </Label>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!form.isUnnamed}
              onChange={(e) => setField('isUnnamed', e.target.checked)}
              className="w-3.5 h-3.5 accent-primary rounded"
              id="horse-unnamed"
            />
            <span className="text-[10px] text-muted-foreground font-medium">Un-Named</span>
          </label>
        </div>
        <Input
          id="horse-name"
          value={form.name}
          onChange={(e) => setField('name', e.target.value)}
          placeholder="e.g. Sovereign Streak"
          className="text-sm"
          disabled={!!form.isUnnamed}
          autoFocus
        />
        {form.isUnnamed && (
          <p className="text-[10px] text-muted-foreground italic">
            This horse has not yet been named. Name can be added later.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SelectField
          id="horse-sex"
          label="Sex / Orientation"
          value={form.sex ?? ''}
          onChange={(v) => setField('sex', v)}
          options={SEX_OPTIONS}
          placeholder="Select sex…"
        />

        <div className="space-y-1.5">
          <Label htmlFor="horse-dob" className="text-xs font-semibold">Date of Birth</Label>
          <Input
            id="horse-dob"
            type="date"
            value={form.dob ?? ''}
            onChange={(e) => setField('dob', e.target.value)}
            className="text-sm"
          />
        </div>

        <SelectField
          id="horse-colour"
          label="Colour"
          value={form.colour ?? ''}
          onChange={(v) => setField('colour', v)}
          options={COLOUR_OPTIONS}
          placeholder="Select colour…"
        />

        <SelectField
          id="horse-country"
          label="Country of Birth"
          value={form.country ?? ''}
          onChange={(v) => setField('country', v)}
          options={COUNTRY_OPTIONS}
          placeholder="Select country…"
        />
      </div>

      {/* Size */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Size</Label>
        <div className="grid grid-cols-2 gap-3">
          <div className="relative">
            <Input
              id="horse-hands"
              type="number"
              min={10}
              max={20}
              step={0.1}
              value={form.handsSize ?? ''}
              onChange={(e) =>
                setField('handsSize', e.target.value ? parseFloat(e.target.value) : undefined)
              }
              placeholder="e.g. 16.2"
              className="text-sm pr-14"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-medium pointer-events-none">
              hands
            </span>
          </div>
          <div className="relative">
            <Input
              id="horse-metric"
              type="number"
              min={100}
              max={220}
              value={form.metricSize ?? ''}
              onChange={(e) =>
                setField('metricSize', e.target.value ? parseInt(e.target.value, 10) : undefined)
              }
              placeholder="e.g. 168"
              className="text-sm pr-7"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-medium pointer-events-none">
              cm
            </span>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Enter height in hands (e.g. 16.2) and/or centimetres.
        </p>
      </div>
    </Section>
  );
}

/* ════════════════════════════
    SECTION 2 — Pedigree (Bloodline)
    ════════════════════════════ */
export function PedigreeSection({ form, setField }: { form: FormData; setField: SetField }) {
  return (
    <Section title="Pedigree — Bloodline" number="2" defaultOpen={false}>
      <p className="text-[10px] text-muted-foreground -mt-2 italic">
        Fill in the family tree. Grandsire / Granddam fields can be auto-populated from the Sire and Dam entries.
      </p>

      {/* Sire block */}
      <div className="rounded-sm border border-border/40 bg-muted/20 p-3 space-y-3">
        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Sire (Father)</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5 sm:col-span-3">
            <Label htmlFor="horse-sire" className="text-xs font-semibold">Sire Name</Label>
            <Input
              id="horse-sire"
              value={form.sire ?? ''}
              onChange={(e) => setField('sire', e.target.value)}
              placeholder="e.g. Not I Am"
              className="text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="horse-siresire" className="text-xs font-semibold">
              Sire&apos;s Sire <span className="text-[9px] text-muted-foreground font-normal">(Grandsire)</span>
            </Label>
            <Input
              id="horse-siresire"
              value={form.sireSire ?? ''}
              onChange={(e) => setField('sireSire', e.target.value)}
              placeholder="e.g. Galileo"
              className="text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="horse-siredam" className="text-xs font-semibold">
              Sire&apos;s Dam <span className="text-[9px] text-muted-foreground font-normal">(Granddam)</span>
            </Label>
            <Input
              id="horse-siredam"
              value={form.sireDam ?? ''}
              onChange={(e) => setField('sireDam', e.target.value)}
              placeholder="e.g. Urban Sea"
              className="text-sm"
            />
          </div>
        </div>
      </div>

      {/* Dam block */}
      <div className="rounded-sm border border-border/40 bg-muted/20 p-3 space-y-3">
        <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Dam (Mother)</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="horse-dam" className="text-xs font-semibold">Dam Name</Label>
            <Input
              id="horse-dam"
              value={form.dam ?? ''}
              onChange={(e) => setField('dam', e.target.value)}
              placeholder="e.g. Gold Strike"
              className="text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="horse-damyob" className="text-xs font-semibold">
              Dam&apos;s Year of Birth
            </Label>
            <Input
              id="horse-damyob"
              type="number"
              min={1990}
              max={CURRENT_YEAR}
              value={form.damYob ?? ''}
              onChange={(e) =>
                setField('damYob', e.target.value ? parseInt(e.target.value, 10) : undefined)
              }
              placeholder="e.g. 2008"
              className="text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="horse-damsire" className="text-xs font-semibold">
              Dam&apos;s Sire <span className="text-[9px] text-muted-foreground font-normal">(Grandsire)</span>
            </Label>
            <Input
              id="horse-damsire"
              value={form.damSire ?? ''}
              onChange={(e) => setField('damSire', e.target.value)}
              placeholder="e.g. Redoutes Choice"
              className="text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="horse-damdam" className="text-xs font-semibold">
              Dam&apos;s Dam <span className="text-[9px] text-muted-foreground font-normal">(Granddam)</span>
            </Label>
            <Input
              id="horse-damdam"
              value={form.damDam ?? ''}
              onChange={(e) => setField('damDam', e.target.value)}
              placeholder="e.g. Danehill Lady"
              className="text-sm"
            />
          </div>
        </div>
      </div>

      {/* Great-grandparents (generation 3) */}
      <div className="mt-4">
        <Label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Great-Grandparents <span className="text-[9px] font-normal normal-case">(generation 3 — optional)</span>
        </Label>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
          {([
            ['sireSireSire', "Sire's Sire's Sire"],
            ['sireSireDam', "Sire's Sire's Dam"],
            ['sireDamSire', "Sire's Dam's Sire"],
            ['sireDamDam', "Sire's Dam's Dam"],
            ['damSireSire', "Dam's Sire's Sire"],
            ['damSireDam', "Dam's Sire's Dam"],
            ['damDamSire', "Dam's Dam's Sire"],
            ['damDamDam', "Dam's Dam's Dam"],
          ] as const).map(([key, label]) => (
            <div key={key} className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">{label}</Label>
              <Input value={(form[key] as string) ?? ''} onChange={(e) => setField(key, e.target.value)} className="text-xs" />
            </div>
          ))}
        </div>
      </div>

      {/* Stud Book registry */}
      <div className="mt-5 pt-4 border-t border-border/50">
        <Label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Stud Book Registry
        </Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
          <div className="space-y-1">
            <Label htmlFor="horse-studbook" className="text-[10px] text-muted-foreground">Stud Book</Label>
            <Input id="horse-studbook" value={form.studBook ?? ''} onChange={(e) => setField('studBook', e.target.value)} placeholder="Australian Stud Book" className="text-xs" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="horse-regno" className="text-[10px] text-muted-foreground">Registration No.</Label>
            <Input id="horse-regno" value={form.registrationNumber ?? ''} onChange={(e) => setField('registrationNumber', e.target.value)} className="text-xs" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="horse-microchip" className="text-[10px] text-muted-foreground">Microchip</Label>
            <Input id="horse-microchip" value={form.microchip ?? ''} onChange={(e) => setField('microchip', e.target.value)} className="text-xs" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="horse-passport" className="text-[10px] text-muted-foreground">Passport No.</Label>
            <Input id="horse-passport" value={form.passportNumber ?? ''} onChange={(e) => setField('passportNumber', e.target.value)} className="text-xs" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="horse-brand" className="text-[10px] text-muted-foreground">Brand / Freeze Mark</Label>
            <Input id="horse-brand" value={form.brandFreeze ?? ''} onChange={(e) => setField('brandFreeze', e.target.value)} className="text-xs" />
          </div>
        </div>
      </div>

      {/* Pedigree notes */}
      <div className="space-y-1.5">
        <Label htmlFor="horse-pedigree" className="text-xs font-semibold">Pedigree Notes</Label>
        <AiTextarea
          id="horse-pedigree"
          value={form.pedigreeNotes}
          onChange={(e) => setField('pedigreeNotes', e.target.value)}
          placeholder="e.g. By Galileo out of Golden Thread (Danehill). A strong staying pedigree with international Group 1 winners on both sides…"
          className="text-sm resize-none"
          rows={3}
          aiLabel="Pedigree notes"
          aiKey="pedigreeNotes"
          entityKind="horse"
          getContext={() => ({
            name: form.name, sex: form.sex, colour: form.colour, country: form.country,
            sire: form.sire, sireSire: form.sireSire, sireDam: form.sireDam,
            dam: form.dam, damSire: form.damSire, damDam: form.damDam,
          })}
          onAccept={(text) => setField('pedigreeNotes', text)}
        />
      </div>
    </Section>
  );
}

/* ════════════════════════════
    SECTION 3 — Connections & Personnel
    ════════════════════════════ */
export function ConnectionsSection({
  form,
  setField,
  allParties,
  ownerParties,
  trainerParties,
  jockeyParties,
  breederParties,
  agentParties,
  syndMgrParties,
}: {
  form: FormData;
  setField: SetField;
  allParties: Party[];
  ownerParties: Party[];
  trainerParties: Party[];
  jockeyParties: Party[];
  breederParties: Party[];
  agentParties: Party[];
  syndMgrParties: Party[];
}) {
  return (
    <Section title="Connections &amp; Personnel" number="3" defaultOpen={false}>
      {/* Hint banner */}
      <div className="flex items-start gap-2.5 p-3 rounded-sm bg-primary/5 border border-primary/15 -mt-2 mb-2">
        <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Users size={11} className="text-primary" />
        </div>
        <div>
          <p className="text-xs font-semibold text-foreground">Linked from your Party database</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            All connections below are sourced from Parties in the Production System. Create owners, trainers, jockeys and
            more in the Parties section — they will appear in the dropdowns here.
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {/* ── Ownership ── */}
        <div className="rounded-sm border border-border/40 bg-muted/10 p-4 space-y-4">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Ownership</p>

          <PartyPicker
            label="Owner(s)"
            roleFilter="owner"
            selectedIds={form.ownerIds ?? []}
            onChange={(ids) => setField('ownerIds', ids)}
            allParties={allParties}
            required
            hint={`${ownerParties.length} owner${ownerParties.length !== 1 ? 's' : ''} in your database. Select all that apply.`}
          />

          <PartyPicker
            label="Syndicate Manager(s)"
            roleFilter="syndicate manager"
            selectedIds={form.syndicateManagerIds ?? []}
            onChange={(ids) => setField('syndicateManagerIds', ids)}
            allParties={allParties}
            hint={syndMgrParties.length > 0 ? `${syndMgrParties.length} syndicate manager${syndMgrParties.length !== 1 ? 's' : ''} available.` : undefined}
          />
        </div>

        {/* ── Training ── */}
        <div className="rounded-sm border border-border/40 bg-muted/10 p-4 space-y-4">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Training</p>

          <PartyPicker
            label="Trainer(s)"
            roleFilter="trainer"
            selectedIds={form.trainerIds ?? []}
            onChange={(ids) => setField('trainerIds', ids)}
            allParties={allParties}
            required
            hint={`${trainerParties.length} trainer${trainerParties.length !== 1 ? 's' : ''} in your database.`}
          />
        </div>

        {/* ── Riding ── */}
        <div className="rounded-sm border border-border/40 bg-muted/10 p-4 space-y-4">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Riding</p>

          <PartyPicker
            label="Jockey(s) / Rider(s)"
            roleFilter="jockey"
            selectedIds={form.jockeyIds ?? []}
            onChange={(ids) => setField('jockeyIds', ids)}
            allParties={allParties}
            hint={jockeyParties.length > 0 ? `${jockeyParties.length} jockey${jockeyParties.length !== 1 ? 's' : ''} available.` : undefined}
          />
        </div>

        {/* ── Breeding ── */}
        <div className="rounded-sm border border-border/40 bg-muted/10 p-4 space-y-4">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Breeding</p>

          <PartyPicker
            label="Breeder(s)"
            roleFilter="breeder"
            selectedIds={form.breederIds ?? []}
            onChange={(ids) => setField('breederIds', ids)}
            allParties={allParties}
            hint={breederParties.length > 0 ? `${breederParties.length} breeder${breederParties.length !== 1 ? 's' : ''} available.` : undefined}
          />
        </div>

        {/* ── Agents & Personnel ── */}
        <div className="rounded-sm border border-border/40 bg-muted/10 p-4 space-y-4">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Agents &amp; Personnel</p>

          <PartyPicker
            label="Bloodstock Agent(s)"
            roleFilter="bloodstock agent"
            selectedIds={form.bloodstockAgentIds ?? []}
            onChange={(ids) => setField('bloodstockAgentIds', ids)}
            allParties={allParties}
            hint={agentParties.length > 0 ? `${agentParties.length} agent${agentParties.length !== 1 ? 's' : ''} available.` : undefined}
          />

          <PartyPicker
            label="Personnel"
            roleFilter="personnel"
            selectedIds={form.personnelIds ?? []}
            onChange={(ids) => setField('personnelIds', ids)}
            allParties={allParties}
            hint="Vets, farriers, strappers, trackwork riders — all parties with the Personnel role."
          />
        </div>
      </div>
    </Section>
  );
}

/* ════════════════════════════
    SECTION 4 — Racing Summary
    ════════════════════════════ */
export function RacingSummarySection({ form, setField }: { form: FormData; setField: SetField }) {
  return (
    <Section title="Racing Summary — Initial Stats" number="4" defaultOpen={false}>
      <p className="text-[10px] text-muted-foreground -mt-2 italic">
        Populate the career record table. Formats: Career/Season Record as <strong>Starts:Wins-Seconds-Thirds</strong>, e.g. 8:2-3-1.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="horse-career-record" className="text-xs font-semibold">Career Record</Label>
          <Input
            id="horse-career-record"
            value={form.careerRecord ?? ''}
            onChange={(e) => setField('careerRecord', e.target.value)}
            placeholder="e.g. 8:2-3-1"
            className="text-sm font-mono"
          />
          <p className="text-[10px] text-muted-foreground">Format: Starts:Wins-Seconds-Thirds</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="horse-winnings" className="text-xs font-semibold">Career Winnings</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">$</span>
            <Input
              id="horse-winnings"
              type="number"
              min={0}
              value={form.careerWinnings ?? ''}
              onChange={(e) =>
                setField('careerWinnings', e.target.value ? parseInt(e.target.value, 10) : undefined)
              }
              placeholder="e.g. 493000"
              className="text-sm pl-7 font-mono"
            />
          </div>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="horse-last10" className="text-xs font-semibold">Last 10 Form</Label>
          <Input
            id="horse-last10"
            value={form.lastTenForm ?? ''}
            onChange={(e) => setField('lastTenForm', e.target.value)}
            placeholder="e.g. 1-2-3-4-2-10-1-5-1-3"
            className="text-sm font-mono"
          />
          <p className="text-[10px] text-muted-foreground">
            Most recent run last. Use finishing positions separated by hyphens.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="horse-season-record" className="text-xs font-semibold">Season Record</Label>
          <Input
            id="horse-season-record"
            value={form.seasonRecord ?? ''}
            onChange={(e) => setField('seasonRecord', e.target.value)}
            placeholder="e.g. 4:2-1-0"
            className="text-sm font-mono"
          />
          <p className="text-[10px] text-muted-foreground">Format: Starts:Wins-Seconds-Thirds</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="horse-rating" className="text-xs font-semibold">Current Rating</Label>
          <Input
            id="horse-rating"
            type="number"
            min={0}
            max={140}
            value={form.currentRating ?? ''}
            onChange={(e) =>
              setField('currentRating', e.target.value ? parseInt(e.target.value, 10) : undefined)
            }
            placeholder="e.g. 112"
            className="text-sm font-mono"
          />
        </div>
      </div>
    </Section>
  );
}

/* ════════════════════════════
    EDITORIAL
    ════════════════════════════ */
export function EditorialSection({ form, setField }: { form: FormData; setField: SetField }) {
  return (
    <Section title="Editorial &amp; Media" number="5" defaultOpen={false}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="horse-pullquote" className="text-xs font-semibold">Pull Quote</Label>
          <Input
            id="horse-pullquote"
            value={form.pullQuote ?? ''}
            onChange={(e) => setField('pullQuote', e.target.value)}
            placeholder="A memorable line about this horse…"
            className="text-sm"
          />
          <p className="text-[10px] text-muted-foreground">
            Displayed as an editorial highlight on the profile card.
          </p>
        </div>

        {/* ── Image Uploader ── */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Horse Photo</Label>
          <p className="text-[10px] text-muted-foreground">
            Add a photo by pasting a web link or uploading a file from your device.
          </p>
          <ImageUploader
            value={form.imageUrl ?? ''}
            onChange={(url) => setField('imageUrl', url)}
            kind="horse"
            label="horse photo"
            id="horse-image"
          />
        </div>
      </div>
    </Section>
  );
}
