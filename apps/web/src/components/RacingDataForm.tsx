import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { useRacingEntryStore } from '@/stores/racingEntryStore';
import { usePartyStore } from '@/stores/partyStore';
import { useHorseStore } from '@/stores/horseStore';
import { loadDraft, useFormDraft } from '@/hooks/useFormDraft';
import { DraftRestoredHint } from './DraftRestoredHint';
import type { RacingEntry, RaceStatus } from '@/types/racingEntry';
import { RACE_STATUSES } from '@/types/racingEntry';
import { Flag, ChevronDown, X, AlertCircle } from 'lucide-react';

interface RacingDraft {
  selectedHorseId: string;
  subject: string;
  raceName: string;
  raceDate: string;
  venue: string;
  country: string;
  classGrade: string;
  distance: string;
  trackCondition: string;
  status: RaceStatus;
  finishPosition: string;
  margin: string;
  time: string;
  prizeMoney: string;
  barrier: string;
  weightCarried: string;
  jockeyId: string;
  trainerId: string;
}

const serifStyle: React.CSSProperties = { fontFamily: "'IM Fell English', 'Palatino Linotype', Georgia, serif" };

/* ── Shared field components ── */
function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label style={{ display: 'block', fontSize: '0.56rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--parchment-shadow)', fontWeight: 700, marginBottom: 4, ...serifStyle }}>
      {children}
      {required && <span style={{ color: '#e09090', marginLeft: 3 }}>*</span>}
    </label>
  );
}

function FieldInput({
  value, onChange, placeholder, type = 'text', hasError,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; hasError?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%', boxSizing: 'border-box', padding: '6px 9px', fontSize: '0.72rem',
        background: 'var(--parchment)', border: `1px solid ${hasError ? '#e09090' : 'var(--parchment-dark)'}`,
        borderRadius: 3, color: 'var(--forest-deep)', outline: 'none', fontFamily: 'inherit',
        transition: 'border-color 0.15s',
      }}
      onFocus={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = 'var(--gold-mid)'; }}
      onBlur={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = hasError ? '#e09090' : 'var(--parchment-dark)'; }}
    />
  );
}

function FieldSelect({
  value, onChange, children, hasError,
}: {
  value: string; onChange: (v: string) => void; children: React.ReactNode; hasError?: boolean;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%', boxSizing: 'border-box', padding: '6px 28px 6px 9px', fontSize: '0.72rem',
          background: 'var(--parchment)', border: `1px solid ${hasError ? '#e09090' : 'var(--parchment-dark)'}`,
          borderRadius: 3, color: 'var(--forest-deep)', outline: 'none', fontFamily: 'inherit',
          appearance: 'none', cursor: 'pointer', transition: 'border-color 0.15s',
        }}
        onFocus={(e) => { (e.currentTarget as HTMLSelectElement).style.borderColor = 'var(--gold-mid)'; }}
        onBlur={(e) => { (e.currentTarget as HTMLSelectElement).style.borderColor = hasError ? '#e09090' : 'var(--parchment-dark)'; }}
      >
        {children}
      </select>
      <ChevronDown size={12} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--parchment-shadow)', pointerEvents: 'none' }} />
    </div>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
      <AlertCircle size={10} style={{ color: '#e09090', flexShrink: 0 }} />
      <span style={{ fontSize: '0.58rem', color: '#e09090', ...serifStyle }}>{msg}</span>
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 10px', ...serifStyle }}>
      <div style={{ flex: 1, height: 1, background: 'var(--parchment-dark)' }} />
      <span style={{ fontSize: '0.52rem', textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--parchment-shadow)', fontWeight: 700 }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--parchment-dark)' }} />
    </div>
  );
}

function Row2({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div>;
}

function Row3({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>{children}</div>;
}

/* ── STATUS BADGE ── */
function StatusBadge({ status }: { status: RaceStatus }) {
  const colors: Record<RaceStatus, { bg: string; text: string }> = {
    Entered:   { bg: 'rgba(26,51,34,0.85)',  text: 'var(--gold-mid)' },
    Accepted:  { bg: 'rgba(30,60,30,0.9)',   text: 'var(--gold-bright)' },
    Scratched: { bg: 'rgba(80,20,20,0.6)',   text: '#e09090' },
    Declared:  { bg: 'rgba(20,40,80,0.8)',   text: '#90b0e0' },
    Finished:  { bg: 'rgba(40,30,10,0.85)',  text: 'var(--gold-bright)' },
  };
  const c = colors[status] ?? colors.Entered;
  return (
    <span style={{ background: c.bg, color: c.text, fontSize: '0.52rem', fontWeight: 700, padding: '2px 8px', borderRadius: 2, textTransform: 'uppercase', letterSpacing: '0.12em', border: '1px solid rgba(255,224,154,0.15)' }}>
      {status}
    </span>
  );
}

/* ════════════════════════════════════════════════════════════
   MAIN FORM COMPONENT
   ════════════════════════════════════════════════════════════ */
interface RacingDataFormProps {
  /** Pre-selected horse ID (set when opened from a Horse profile) */
  horseId?: string;
  /** Existing record for edit mode */
  initial?: RacingEntry;
  /** Compact display mode (embedded inside HorseDetail) */
  compact?: boolean;
  onSave: () => void;
  onCancel: () => void;
}

interface FormErrors {
  horse_id?: string;
  subject?: string;
  race_name?: string;
  race_date?: string;
  venue?: string;
  status?: string;
}

export function RacingDataForm({ horseId, initial, compact = false, onSave, onCancel }: RacingDataFormProps) {
  const addEntry = useRacingEntryStore((s) => s.addEntry);
  const updateEntry = useRacingEntryStore((s) => s.updateEntry);
  const allParties = usePartyStore((s) => s.parties);
  const fetchParties = usePartyStore((s) => s.fetchParties);
  const allHorses = useHorseStore((s) => s.horses);
  const fetchHorses = useHorseStore((s) => s.fetchHorses);

  useEffect(() => { fetchParties(); }, [fetchParties]);
  useEffect(() => { fetchHorses(); }, [fetchHorses]);

  const jockeys = useMemo(() => allParties.filter((p) => p.roles.includes('jockey')), [allParties]);
  const trainers = useMemo(() => allParties.filter((p) => p.roles.includes('trainer')), [allParties]);

  const isEdit = !!initial;

  /* Lock horse selector when horseId is pre-supplied */
  const horseLocked = !!horseId;

  // Restore an in-progress draft (new records only — never overwrite an edit).
  const draftKey = `racing:${horseId ?? 'global'}`;
  const draft = useMemo(() => (isEdit ? null : loadDraft<RacingDraft>(draftKey)), [isEdit, draftKey]);

  // ── Form state ──
  const [selectedHorseId, setSelectedHorseId] = useState(initial?.horse_id ?? horseId ?? draft?.selectedHorseId ?? '');
  const [subject, setSubject] = useState(initial?.subject ?? draft?.subject ?? '');
  const [raceName, setRaceName] = useState(initial?.race_name ?? draft?.raceName ?? '');
  const [raceDate, setRaceDate] = useState(initial?.race_date ?? draft?.raceDate ?? '');
  const [venue, setVenue] = useState(initial?.venue ?? draft?.venue ?? '');
  const [country, setCountry] = useState(initial?.country ?? draft?.country ?? '');
  const [classGrade, setClassGrade] = useState(initial?.class_grade ?? draft?.classGrade ?? '');
  const [distance, setDistance] = useState(initial?.distance ?? draft?.distance ?? '');
  const [trackCondition, setTrackCondition] = useState(initial?.track_condition ?? draft?.trackCondition ?? '');
  const [status, setStatus] = useState<RaceStatus>(initial?.status ?? draft?.status ?? 'Entered');
  const [finishPosition, setFinishPosition] = useState(initial?.finish_position !== undefined ? String(initial.finish_position) : (draft?.finishPosition ?? ''));
  const [margin, setMargin] = useState(initial?.margin ?? draft?.margin ?? '');
  const [time, setTime] = useState(initial?.time ?? draft?.time ?? '');
  const [prizeMoney, setPrizeMoney] = useState(initial?.prize_money !== undefined ? String(initial.prize_money) : (draft?.prizeMoney ?? ''));
  const [barrier, setBarrier] = useState(initial?.barrier !== undefined ? String(initial.barrier) : (draft?.barrier ?? ''));
  const [weightCarried, setWeightCarried] = useState(initial?.weight_carried ?? draft?.weightCarried ?? '');
  const [jockeyId, setJockeyId] = useState(initial?.jockey_id ?? draft?.jockeyId ?? '');
  const [trainerId, setTrainerId] = useState(initial?.trainer_id ?? draft?.trainerId ?? '');

  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);

  const { clearDraft, restored } = useFormDraft<RacingDraft>(
    draftKey,
    {
      selectedHorseId, subject, raceName, raceDate, venue, country, classGrade, distance,
      trackCondition, status, finishPosition, margin, time, prizeMoney, barrier, weightCarried,
      jockeyId, trainerId,
    },
    {
      enabled: !isEdit,
      isEmpty: (d) => !d.subject.trim() && !d.raceName.trim() && !d.raceDate && !d.venue.trim(),
    },
  );
  const [draftRestored, setDraftRestored] = useState(restored);
  function discardDraft() {
    clearDraft();
    setSelectedHorseId(horseId ?? '');
    setSubject(''); setRaceName(''); setRaceDate(''); setVenue(''); setCountry('');
    setClassGrade(''); setDistance(''); setTrackCondition(''); setStatus('Entered');
    setFinishPosition(''); setMargin(''); setTime(''); setPrizeMoney(''); setBarrier('');
    setWeightCarried(''); setJockeyId(''); setTrainerId('');
    setDraftRestored(false);
  }

  function validate(): boolean {
    const e: FormErrors = {};
    if (!selectedHorseId.trim()) e.horse_id = 'Please select a horse';
    if (!subject.trim()) e.subject = 'Subject is required';
    if (!raceName.trim()) e.race_name = 'Race name is required';
    if (!raceDate.trim()) e.race_date = 'Race date is required';
    if (!venue.trim()) e.venue = 'Venue is required';
    if (!status) e.status = 'Status is required';
    setErrors(e);
    if (Object.keys(e).length > 0) {
      toast.error('Please complete all required fields');
    }
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSaving(true);
    const payload: Omit<RacingEntry, 'id' | 'createdAt'> = {
      horse_id: selectedHorseId,
      subject: subject.trim(),
      race_name: raceName.trim(),
      race_date: raceDate,
      venue: venue.trim(),
      country: country.trim() || undefined,
      class_grade: classGrade.trim() || undefined,
      distance: distance.trim() || undefined,
      track_condition: trackCondition.trim() || undefined,
      status,
      finish_position: finishPosition !== '' ? Number(finishPosition) : undefined,
      margin: margin.trim() || undefined,
      time: time.trim() || undefined,
      prize_money: prizeMoney !== '' ? Number(prizeMoney) : undefined,
      barrier: barrier !== '' ? Number(barrier) : undefined,
      weight_carried: weightCarried.trim() || undefined,
      jockey_id: jockeyId || undefined,
      trainer_id: trainerId || undefined,
    };
    try {
      if (isEdit && initial) {
        await updateEntry(initial.id, payload);
        toast.success('Racing record updated');
      } else {
        await addEntry(payload);
        toast.success('Racing record saved');
      }
      clearDraft();
      onSave();
    } catch {
      toast.error('Failed to save — please try again');
    } finally {
      setSaving(false);
    }
  }

  const formHeader = (
    <div style={{ position: 'relative', padding: compact ? '10px 14px 10px' : '16px 20px 14px', background: 'linear-gradient(180deg, var(--forest-light) 0%, var(--forest-mid) 100%)', borderBottom: '2px solid var(--gold-dark)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: 3, background: 'rgba(26,51,34,0.85)', border: '1px solid var(--gold-mid)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Flag size={13} strokeWidth={1.8} style={{ color: 'var(--gold-bright)' }} />
        </div>
        <div>
          <div style={{ fontSize: '0.5rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--gold-mid)', ...serifStyle }}>Stable Press · Racing Data</div>
          <div style={{ fontSize: compact ? '0.85rem' : '1rem', fontWeight: 700, color: 'var(--parchment)', textShadow: '0 1px 3px rgba(0,0,0,0.7)', lineHeight: 1, ...serifStyle }}>
            {isEdit ? 'Edit Racing Record' : 'New Racing Record'}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {status && <StatusBadge status={status} />}
        <button onClick={onCancel} aria-label="Cancel" style={{ width: 26, height: 26, borderRadius: 2, border: '1px solid var(--gold-dark)', background: 'rgba(26,51,34,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
          <X size={13} style={{ color: 'var(--gold-bright)' }} />
        </button>
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, var(--gold-dark) 0%, var(--gold-bright) 50%, var(--gold-dark) 100%)' }} />
    </div>
  );

  const formBody = (
    <div style={{ padding: compact ? '12px 14px 14px' : '18px 20px 20px', overflowY: 'auto', maxHeight: compact ? 'calc(100vh - 280px)' : '70vh', background: 'var(--parchment)', backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 20px, rgba(0,0,0,0.018) 20px, rgba(0,0,0,0.018) 21px)' }}>

      {draftRestored && <DraftRestoredHint onDiscard={discardDraft} />}

      {/* ── SECTION: Core Fields ── */}
      <SectionDivider label="Race Identity" />

      {/* Horse selector — locked if horseId is pre-supplied */}
      <div style={{ marginBottom: 10 }}>
        <FieldLabel required>Horse</FieldLabel>
        {horseLocked ? (
          <div style={{ padding: '6px 9px', background: 'rgba(0,0,0,0.04)', border: '1px solid var(--parchment-dark)', borderRadius: 3, fontSize: '0.72rem', color: 'var(--forest-deep)', ...serifStyle }}>
            {allHorses.find((h) => h.id === selectedHorseId)?.name ?? selectedHorseId}
          </div>
        ) : (
          <FieldSelect value={selectedHorseId} onChange={setSelectedHorseId} hasError={!!errors.horse_id}>
            <option value="">— Select horse —</option>
            {allHorses.map((h) => (
              <option key={h.id} value={h.id}>{h.isUnnamed ? 'Un-Named' : h.name}</option>
            ))}
          </FieldSelect>
        )}
        <FieldError msg={errors.horse_id} />
      </div>

      <div style={{ marginBottom: 10 }}>
        <FieldLabel required>Subject</FieldLabel>
        <FieldInput value={subject} onChange={setSubject} placeholder="Brief description of this race entry or record" hasError={!!errors.subject} />
        <FieldError msg={errors.subject} />
      </div>

      <Row2>
        <div>
          <FieldLabel required>Race Name</FieldLabel>
          <FieldInput value={raceName} onChange={setRaceName} placeholder="Cox Plate, Melbourne Cup…" hasError={!!errors.race_name} />
          <FieldError msg={errors.race_name} />
        </div>
        <div>
          <FieldLabel required>Status</FieldLabel>
          <FieldSelect value={status} onChange={(v) => setStatus(v as RaceStatus)} hasError={!!errors.status}>
            {RACE_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </FieldSelect>
          <FieldError msg={errors.status} />
        </div>
      </Row2>

      <div style={{ marginTop: 10 }}>
        <Row2>
          <div>
            <FieldLabel required>Race Date</FieldLabel>
            <FieldInput type="date" value={raceDate} onChange={setRaceDate} hasError={!!errors.race_date} />
            <FieldError msg={errors.race_date} />
          </div>
          <div>
            <FieldLabel required>Venue</FieldLabel>
            <FieldInput value={venue} onChange={setVenue} placeholder="Flemington, Royal Randwick…" hasError={!!errors.venue} />
            <FieldError msg={errors.venue} />
          </div>
        </Row2>
      </div>

      {/* ── SECTION: Race Details ── */}
      <SectionDivider label="Race Details" />

      <Row3>
        <div>
          <FieldLabel>Country</FieldLabel>
          <FieldInput value={country} onChange={setCountry} placeholder="Australia" />
        </div>
        <div>
          <FieldLabel>Class / Grade</FieldLabel>
          <FieldInput value={classGrade} onChange={setClassGrade} placeholder="Gr.1, Listed, BM88…" />
        </div>
        <div>
          <FieldLabel>Distance</FieldLabel>
          <FieldInput value={distance} onChange={setDistance} placeholder="2000m" />
        </div>
      </Row3>

      <div style={{ marginTop: 10 }}>
        <FieldLabel>Track Condition</FieldLabel>
        <FieldInput value={trackCondition} onChange={setTrackCondition} placeholder="Good (3), Soft (5), Heavy (8)…" />
      </div>

      {/* ── SECTION: Race Result ── */}
      <SectionDivider label="Result & Timing" />

      <Row3>
        <div>
          <FieldLabel>Finish Position</FieldLabel>
          <FieldInput type="number" value={finishPosition} onChange={setFinishPosition} placeholder="1" />
        </div>
        <div>
          <FieldLabel>Margin</FieldLabel>
          <FieldInput value={margin} onChange={setMargin} placeholder="Nose, 1.2L, 3/4L…" />
        </div>
        <div>
          <FieldLabel>Time</FieldLabel>
          <FieldInput value={time} onChange={setTime} placeholder="2:00.1" />
        </div>
      </Row3>

      <div style={{ marginTop: 10 }}>
        <Row2>
          <div>
            <FieldLabel>Prize Money (AUD)</FieldLabel>
            <FieldInput type="number" value={prizeMoney} onChange={setPrizeMoney} placeholder="450000" />
          </div>
          <div>
            <FieldLabel>Barrier</FieldLabel>
            <FieldInput type="number" value={barrier} onChange={setBarrier} placeholder="4" />
          </div>
        </Row2>
      </div>

      <div style={{ marginTop: 10 }}>
        <FieldLabel>Weight Carried</FieldLabel>
        <FieldInput value={weightCarried} onChange={setWeightCarried} placeholder="57kg, 56.5kg…" />
      </div>

      {/* ── SECTION: Connections ── */}
      <SectionDivider label="Connections for this Race" />

      <Row2>
        <div>
          <FieldLabel>Jockey</FieldLabel>
          <FieldSelect value={jockeyId} onChange={setJockeyId}>
            <option value="">— Select jockey —</option>
            {jockeys.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </FieldSelect>
          <div style={{ marginTop: 3, fontSize: '0.55rem', color: 'var(--parchment-shadow)', fontStyle: 'italic', ...serifStyle }}>Jockey riding engagement for this race</div>
        </div>
        <div>
          <FieldLabel>Trainer</FieldLabel>
          <FieldSelect value={trainerId} onChange={setTrainerId}>
            <option value="">— Select trainer —</option>
            {trainers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </FieldSelect>
          <div style={{ marginTop: 3, fontSize: '0.55rem', color: 'var(--parchment-shadow)', fontStyle: 'italic', ...serifStyle }}>Trainer responsible at time of race</div>
        </div>
      </Row2>

      {/* Note about auto-surfacing */}
      <div style={{ marginTop: 16, padding: '8px 10px', background: 'rgba(26,51,34,0.06)', border: '1px solid var(--parchment-dark)', borderRadius: 3, display: 'flex', alignItems: 'flex-start', gap: 7 }}>
        <Flag size={11} style={{ color: 'var(--gold-mid)', flexShrink: 0, marginTop: 2 }} />
        <span style={{ fontSize: '0.58rem', color: 'var(--parchment-shadow)', lineHeight: 1.5, ...serifStyle }}>
          This record will surface on the Horse profile and the Racing Data section. Records with linked Jockey and Trainer will also appear on their respective party profiles.
        </span>
      </div>
    </div>
  );

  const formFooter = (
    <div style={{ padding: compact ? '10px 14px' : '12px 20px', background: 'linear-gradient(180deg, var(--forest-mid) 0%, var(--forest-deep) 100%)', borderTop: '2px solid var(--gold-dark)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <button
        onClick={onCancel}
        style={{ padding: '6px 16px', background: 'transparent', border: '1px solid var(--gold-dark)', borderRadius: 3, cursor: 'pointer', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--gold-mid)', ...serifStyle, transition: 'border-color 0.15s, color 0.15s' }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--gold-bright)'; (e.currentTarget as HTMLElement).style.color = 'var(--gold-bright)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--gold-dark)'; (e.currentTarget as HTMLElement).style.color = 'var(--gold-mid)'; }}
      >
        Cancel
      </button>
      <button
        onClick={handleSubmit}
        disabled={saving}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 20px', background: saving ? 'var(--gold-dark)' : 'linear-gradient(135deg, var(--gold-bright) 0%, var(--gold-mid) 100%)', border: 'none', borderRadius: 3, cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--forest-deep)', boxShadow: '0 2px 6px rgba(0,0,0,0.35)', ...serifStyle, transition: 'background 0.15s' }}
      >
        <Flag size={11} strokeWidth={2.5} />
        {saving ? 'Saving…' : isEdit ? 'Update Record' : 'Save Racing Record'}
      </button>
    </div>
  );

  if (compact) {
    return (
      <div style={{ ...serifStyle, display: 'flex', flexDirection: 'column', background: 'var(--parchment)', border: '2px solid var(--gold-mid)', borderRadius: 4, overflow: 'hidden', boxShadow: '0 0 0 1px var(--gold-dark), 0 4px 16px rgba(0,0,0,0.45)' }}>
        {formHeader}
        {formBody}
        {formFooter}
      </div>
    );
  }

  /* Full-screen dialog mode */
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,24,15,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: 720, maxHeight: '92vh', display: 'flex', flexDirection: 'column', border: '2px solid var(--gold-mid)', borderRadius: 4, overflow: 'hidden', boxShadow: '0 0 0 1px var(--gold-dark), 0 20px 60px rgba(0,0,0,0.9)', ...serifStyle }}>
        {formHeader}
        {formBody}
        {formFooter}
      </div>
    </div>
  );
}
