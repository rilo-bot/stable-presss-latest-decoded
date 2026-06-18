import { useState, useEffect, useMemo } from 'react';
import { useHorseStore } from '@/stores/horseStore';
import { usePartyStore } from '@/stores/partyStore';
import type { Horse } from '@/types/horse';
import { Button } from '@/components/ui/button';
import { X, Share as HorseIcon, Save, Trash } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { empty, type FormData } from './horse-form/constants';
import {
  BasicSection,
  PedigreeSection,
  ConnectionsSection,
  RacingSummarySection,
  EditorialSection,
} from './horse-form/sections';

type ConnectFields = Partial<Pick<Horse,
  'ownerIds' | 'trainerIds' | 'jockeyIds' | 'breederIds' | 'bloodstockAgentIds' | 'syndicateManagerIds' | 'personnelIds'>>;

interface HorseFormProps {
  open: boolean;
  onClose: () => void;
  editHorse?: Horse | null;
  /** Pre-select this party as owner when creating (member self-registration). */
  defaultOwnerId?: string;
  /** Role-aware pre-link when creating (e.g. a trainer member → { trainerIds:[id] }). */
  defaultConnect?: ConnectFields;
  /** Member self-service mode: relax the owner/trainer requirement (self-link is enough). */
  memberMode?: boolean;
}

export function HorseForm({ open, onClose, editHorse, defaultOwnerId, defaultConnect, memberMode }: HorseFormProps) {
  const addHorse = useHorseStore((s) => s.addHorse);
  const updateHorse = useHorseStore((s) => s.updateHorse);
  const removeHorse = useHorseStore((s) => s.removeHorse);
  const allParties = usePartyStore((s) => s.parties);

  const [form, setForm] = useState<FormData>(empty());
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        editHorse
          ? {
              name: editHorse.name ?? '',
              isUnnamed: editHorse.isUnnamed ?? false,
              sex: editHorse.sex ?? '',
              dob: editHorse.dob ?? '',
              colour: editHorse.colour ?? '',
              country: editHorse.country ?? '',
              handsSize: editHorse.handsSize,
              metricSize: editHorse.metricSize,
              sire: editHorse.sire ?? '',
              sireSire: editHorse.sireSire ?? '',
              sireDam: editHorse.sireDam ?? '',
              dam: editHorse.dam ?? '',
              damYob: editHorse.damYob,
              damSire: editHorse.damSire ?? '',
              damDam: editHorse.damDam ?? '',
              sireSireSire: editHorse.sireSireSire ?? '',
              sireSireDam: editHorse.sireSireDam ?? '',
              sireDamSire: editHorse.sireDamSire ?? '',
              sireDamDam: editHorse.sireDamDam ?? '',
              damSireSire: editHorse.damSireSire ?? '',
              damSireDam: editHorse.damSireDam ?? '',
              damDamSire: editHorse.damDamSire ?? '',
              damDamDam: editHorse.damDamDam ?? '',
              studBook: editHorse.studBook ?? '',
              registrationNumber: editHorse.registrationNumber ?? '',
              microchip: editHorse.microchip ?? '',
              brandFreeze: editHorse.brandFreeze ?? '',
              passportNumber: editHorse.passportNumber ?? '',
              // Party IDs
              ownerIds: editHorse.ownerIds ?? [],
              trainerIds: editHorse.trainerIds ?? [],
              jockeyIds: editHorse.jockeyIds ?? [],
              breederIds: editHorse.breederIds ?? [],
              bloodstockAgentIds: editHorse.bloodstockAgentIds ?? [],
              syndicateManagerIds: editHorse.syndicateManagerIds ?? [],
              personnelIds: editHorse.personnelIds ?? [],
              careerRecord: editHorse.careerRecord ?? '',
              careerWinnings: editHorse.careerWinnings,
              lastTenForm: editHorse.lastTenForm ?? '',
              seasonRecord: editHorse.seasonRecord ?? '',
              currentRating: editHorse.currentRating,
              pedigreeNotes: editHorse.pedigreeNotes ?? '',
              pullQuote: editHorse.pullQuote ?? '',
              imageUrl: editHorse.imageUrl ?? '',
              age: editHorse.age,
            }
          : { ...empty(), ...(defaultOwnerId ? { ownerIds: [defaultOwnerId] } : {}), ...(defaultConnect ?? {}) }
      );
      setConfirmDelete(false);
      setSaving(false);
    }
  }, [open, editHorse, defaultOwnerId, defaultConnect]);

  const setField = (field: keyof FormData, value: string | number | boolean | string[] | undefined) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.isUnnamed && !form.name.trim()) {
      toast.error('Horse name is required, or tick "Un-Named".');
      return;
    }

    // Owner/trainer are required for STAFF entry (a full record). Members self-
    // register with just their own party linked (via defaultConnect), so the
    // requirement is relaxed in memberMode.
    const hasOwner = (form.ownerIds ?? []).length > 0;
    const hasTrainer = (form.trainerIds ?? []).length > 0;

    if (!memberMode && !hasOwner) {
      toast.error('At least one owner is required. Add owners in the Parties Production System first.');
      return;
    }
    if (!memberMode && !hasTrainer) {
      toast.error('At least one trainer is required. Add trainers in the Parties Production System first.');
      return;
    }

    setSaving(true);

    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 280));

      const displayName = form.isUnnamed ? 'Un-Named' : form.name;

      if (editHorse) {
        await updateHorse(editHorse.id, form);
        toast.success(`${displayName} has been updated.`);
      } else {
        const created = await addHorse(form);
        if (!created) return; // store already surfaced the error
        toast.success(`${displayName} has been added to the stables.`);
      }

      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!editHorse) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      removeHorse(editHorse.id);
      toast.success(`${editHorse.name || 'Horse'} has been removed from the stables.`);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not remove this horse.';
      toast.error(msg);
    }
  };

  // Count how many parties exist per role to hint the user
  const ownerParties = useMemo(() => allParties.filter((p) => p.roles.includes('owner')), [allParties]);
  const trainerParties = useMemo(() => allParties.filter((p) => p.roles.includes('trainer')), [allParties]);
  const jockeyParties = useMemo(() => allParties.filter((p) => p.roles.includes('jockey')), [allParties]);
  const breederParties = useMemo(() => allParties.filter((p) => p.roles.includes('breeder')), [allParties]);
  const agentParties = useMemo(() => allParties.filter((p) => p.roles.includes('bloodstock agent')), [allParties]);
  const syndMgrParties = useMemo(() => allParties.filter((p) => p.roles.includes('syndicate manager')), [allParties]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={editHorse ? 'Edit horse profile' : 'Add horse profile'}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative z-10 w-full sm:max-w-3xl max-h-[94vh] flex flex-col bg-card border border-border/60 rounded-t-xl sm:rounded-xl shadow-2xl overflow-hidden">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/40 bg-primary/5 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center">
              <HorseIcon size={14} className="text-primary" />
            </div>
            <div>
              <p className="font-[family-name:var(--font-display)] text-sm font-bold text-foreground">
                {editHorse ? 'Edit Thoroughbred Profile' : 'Add Thoroughbred Profile'}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {editHorse
                  ? `Updating record for ${editHorse.name || 'Un-Named'}`
                  : 'Complete all sections to build a full profile'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Close form"
            type="button"
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

            <BasicSection form={form} setField={setField} />

            <PedigreeSection form={form} setField={setField} />

            <ConnectionsSection
              form={form}
              setField={setField}
              allParties={allParties}
              ownerParties={ownerParties}
              trainerParties={trainerParties}
              jockeyParties={jockeyParties}
              breederParties={breederParties}
              agentParties={agentParties}
              syndMgrParties={syndMgrParties}
            />

            <RacingSummarySection form={form} setField={setField} />

            <EditorialSection form={form} setField={setField} />
          </div>

          {/* ── Sticky footer ── */}
          <div className="flex-shrink-0 border-t border-border/40 px-5 py-4 bg-card flex items-center justify-between gap-3">
            <div>
              {editHorse && (
                confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-destructive font-semibold">Remove this horse?</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      className="text-xs gap-1"
                      onClick={handleDelete}
                    >
                      <Trash size={11} />
                      Confirm Remove
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-xs"
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-xs gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={handleDelete}
                  >
                    <Trash size={11} />
                    Remove
                  </Button>
                )
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={onClose}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={saving}
                className={cn(
                  'text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90',
                  saving && 'opacity-70 pointer-events-none'
                )}
              >
                {saving ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save size={11} />
                    {editHorse ? 'Update Profile' : 'Add to Stables'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
