import { useState, useEffect, useMemo } from 'react';
import { useHorseStore } from '@/stores/horseStore';
import { usePartyStore } from '@/stores/partyStore';
import { useRegister } from '@/lib/register';
import {
  connectionsForHorse,
  emptyConnectionMap,
  reconcileHorseConnections,
  type ConnectionMap,
} from '@/lib/horseConnections';
import type { PartyRole } from '@/types/party';
import type { Horse } from '@/types/horse';
import { Button } from '@/components/ui/button';
import { X, Share as HorseIcon, Save, Trash, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { loadDraft, useFormDraft } from '@/hooks/useFormDraft';
import { empty, type FormData } from './horse-form/constants';
import {
  BasicSection,
  PedigreeSection,
  ConnectionsSection,
  RacingSummarySection,
  EditorialSection,
} from './horse-form/sections';

/**
 * Pre-link when creating: role → PERSON ids. A member registering their own
 * horse arrives with themselves already filled into their own role.
 *
 * This was `Partial<Pick<Horse, 'ownerIds' | …>>` — connection fields ON the
 * horse. They no longer exist; a connection is a party edge, so the form
 * collects them separately and writes them after the horse has an id.
 */
export type ConnectFields = Partial<Record<PartyRole, string[]>>;

interface HorseFormProps {
  open: boolean;
  onClose: () => void;
  editHorse?: Horse | null;
  /** Pre-select this person as owner when creating (member self-registration). */
  defaultOwnerId?: string;
  /** Role-aware pre-link when creating (e.g. a trainer member → { trainer: [id] }). */
  defaultConnect?: ConnectFields;
  /** Member self-service mode: relax the owner/trainer requirement (self-link is enough). */
  memberMode?: boolean;
}

export function HorseForm({ open, onClose, editHorse, defaultOwnerId, defaultConnect, memberMode }: HorseFormProps) {
  const addHorse = useHorseStore((s) => s.addHorse);
  const updateHorse = useHorseStore((s) => s.updateHorse);
  const removeHorse = useHorseStore((s) => s.removeHorse);
  const parties = usePartyStore((s) => s.parties);
  const addParty = usePartyStore((s) => s.addParty);
  const removeParty = usePartyStore((s) => s.removeParty);
  const fetchParties = usePartyStore((s) => s.fetchParties);
  const allParties = useRegister();

  const [form, setForm] = useState<FormData>(empty());
  // Connections live OUTSIDE `form`: they are edges in the register, not fields
  // on the horse, and they save on their own round trip.
  const [connections, setConnections] = useState<ConnectionMap>(emptyConnectionMap());
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);

  const setConnection = (role: PartyRole, ids: string[]) =>
    setConnections((prev) => ({ ...prev, [role]: ids }));

  /** The pre-link a caller asked for, as a full map. */
  const seededConnections = (): ConnectionMap => {
    const map = emptyConnectionMap();
    if (defaultOwnerId) map.owner = [defaultOwnerId];
    for (const [role, ids] of Object.entries(defaultConnect ?? {})) {
      if (ids?.length) map[role as PartyRole] = [...ids];
    }
    return map;
  };

  // Drafting is scoped to the entry context (staff full-entry vs member self-service).
  const draftKey = `horse:${memberMode ? 'member' : 'staff'}`;

  useEffect(() => {
    if (open) {
      const draft = editHorse ? null : loadDraft<Partial<FormData>>(draftKey);
      setDraftRestored(!!draft);
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
          : {
              ...empty(),
              ...(draft ?? {}),
            }
      );
      // Editing: the horse's CURRENT edges. Creating: whatever pre-link the
      // caller asked for. A restored draft never carries connections — they are
      // register rows, so a stale draft could otherwise resurrect a link that
      // was deleted while the draft sat in localStorage.
      setConnections(editHorse ? connectionsForHorse(parties, editHorse.id) : seededConnections());
      setConfirmDelete(false);
      setSaving(false);
    }
    // draftKey is derived from memberMode; loadDraft is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editHorse, defaultOwnerId, defaultConnect, parties]);

  const setField = (field: keyof FormData, value: string | number | boolean | string[] | undefined) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  // Auto-save an in-progress draft so an accidental close doesn't lose work.
  const { clearDraft } = useFormDraft<FormData>(
    draftKey,
    // Skip transient data: URLs — they can blow the localStorage quota.
    { ...form, imageUrl: form.imageUrl?.startsWith('data:') ? '' : form.imageUrl },
    {
      enabled: open && !editHorse,
      isEmpty: (d) =>
        !d.name.trim() && !d.isUnnamed && !d.sire?.trim() && !d.dam?.trim() && !d.imageUrl?.trim(),
    },
  );

  const discardDraft = () => {
    clearDraft();
    setForm(empty());
    setConnections(seededConnections());
    setDraftRestored(false);
  };

  /**
   * Write the connections as register edges.
   *
   * A SEPARATE round trip from saving the horse, because they are separate
   * records — the horse must exist first, so a new horse reconciles against the
   * id it was just given. A failure here is reported but does not fail the save:
   * the horse is already stored, and claiming otherwise would be a lie.
   */
  const saveConnections = async (horseId: string, against: typeof parties = parties) => {
    const { failed } = await reconcileHorseConnections(horseId, connections, against, {
      addParty,
      removeParty,
    });
    if (failed > 0) {
      toast.warning(
        `The horse was saved, but ${failed} connection${failed !== 1 ? 's' : ''} could not be updated. Check the connections panel.`,
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.isUnnamed && !form.name.trim()) {
      toast.error('Horse name is required, or tick "Un-Named".');
      return;
    }

    // Owner/trainer are required for STAFF entry (a full record). Members self-
    // register with just their own edge linked (via defaultConnect), so the
    // requirement is relaxed in memberMode.
    if (!memberMode && connections.owner.length === 0) {
      toast.error('At least one owner is required. Add owners in the People register first.');
      return;
    }
    if (!memberMode && connections.trainer.length === 0) {
      toast.error('At least one trainer is required. Add trainers in the People register first.');
      return;
    }

    setSaving(true);

    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 280));

      const displayName = form.isUnnamed ? 'Un-Named' : form.name;

      if (editHorse) {
        await updateHorse(editHorse.id, form);
        await saveConnections(editHorse.id);
        toast.success(`${displayName} has been updated.`);
      } else {
        const created = await addHorse(form);
        if (!created) return; // store already surfaced the error
        // Re-read the register first: POST /api/horses links the creator itself
        // when a member registers a horse, and reconciling against a stale list
        // would add that same edge a second time.
        await fetchParties(true);
        await saveConnections(created.id, usePartyStore.getState().parties);
        clearDraft();
        setDraftRestored(false);
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

            {draftRestored && !editHorse && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-sm border border-border/60 bg-muted/40 text-xs">
                <RotateCcw size={12} className="flex-shrink-0 text-muted-foreground" />
                <span className="flex-1 text-muted-foreground">
                  Unsaved draft restored from your last session.
                </span>
                <button
                  type="button"
                  onClick={discardDraft}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-sm border border-border/60 text-[10px] uppercase tracking-[0.08em] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X size={9} /> Discard
                </button>
              </div>
            )}

            <BasicSection form={form} setField={setField} />

            <PedigreeSection form={form} setField={setField} />

            <ConnectionsSection
              connections={connections}
              setConnection={setConnection}
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
