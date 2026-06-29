import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { useReportStore } from '@/stores/reportStore';
import { useHorseStore } from '@/stores/horseStore';
import { loadDraft, useFormDraft } from '@/hooks/useFormDraft';
import type { HorseReport, ReportDocType, ReportVisibility } from '@/types/horseReport';
import { REPORT_DOC_TYPES } from '@/types/horseReport';
import { FileText, ChevronDown, X, AlertCircle } from 'lucide-react';
import { DraftRestoredHint } from './DraftRestoredHint';

interface ReportDraft {
  selectedHorseId: string;
  docType: ReportDocType;
  title: string;
  issuedDate: string;
  issuingBody: string;
  url: string;
  visibility: ReportVisibility;
}

const serifStyle: React.CSSProperties = { fontFamily: "'IM Fell English', 'Palatino Linotype', Georgia, serif" };

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label style={{ display: 'block', fontSize: '0.56rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--parchment-shadow)', fontWeight: 700, marginBottom: 4, ...serifStyle }}>
      {children}{required && <span style={{ color: '#e09090', marginLeft: 3 }}>*</span>}
    </label>
  );
}
function FieldInput({ value, onChange, placeholder, type = 'text', hasError }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string; hasError?: boolean }) {
  return (
    <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: '100%', boxSizing: 'border-box', padding: '6px 9px', fontSize: '0.72rem', background: 'var(--parchment)', border: `1px solid ${hasError ? '#e09090' : 'var(--parchment-dark)'}`, borderRadius: 3, color: 'var(--forest-deep)', outline: 'none', fontFamily: 'inherit' }} />
  );
}
function FieldSelect({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'relative' }}>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%', boxSizing: 'border-box', padding: '6px 28px 6px 9px', fontSize: '0.72rem', background: 'var(--parchment)', border: '1px solid var(--parchment-dark)', borderRadius: 3, color: 'var(--forest-deep)', outline: 'none', fontFamily: 'inherit', appearance: 'none', cursor: 'pointer' }}>
        {children}
      </select>
      <ChevronDown size={12} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--parchment-shadow)', pointerEvents: 'none' }} />
    </div>
  );
}
function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}><AlertCircle size={10} style={{ color: '#e09090' }} /><span style={{ fontSize: '0.58rem', color: '#e09090', ...serifStyle }}>{msg}</span></div>;
}
function Row2({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>{children}</div>;
}

interface Props { horseId?: string; initial?: HorseReport; compact?: boolean; onSave: () => void; onCancel: () => void; }

export function ReportsDataForm({ horseId, initial, compact = false, onSave, onCancel }: Props) {
  const addReport = useReportStore((s) => s.addReport);
  const updateReport = useReportStore((s) => s.updateReport);
  const allHorses = useHorseStore((s) => s.horses);
  const fetchHorses = useHorseStore((s) => s.fetchHorses);
  useEffect(() => { fetchHorses(); }, [fetchHorses]);

  const isEdit = !!initial;
  const horseLocked = !!horseId;

  // Restore an in-progress draft (new records only — never overwrite an edit).
  const draftKey = `reports:${horseId ?? 'global'}`;
  const draft = useMemo(() => (isEdit ? null : loadDraft<ReportDraft>(draftKey)), [isEdit, draftKey]);

  const [selectedHorseId, setSelectedHorseId] = useState(initial?.horse_id ?? horseId ?? draft?.selectedHorseId ?? '');
  const [docType, setDocType] = useState<ReportDocType>(initial?.doc_type ?? draft?.docType ?? 'Registration');
  const [title, setTitle] = useState(initial?.title ?? draft?.title ?? '');
  const [issuedDate, setIssuedDate] = useState(initial?.issued_date ?? draft?.issuedDate ?? '');
  const [issuingBody, setIssuingBody] = useState(initial?.issuing_body ?? draft?.issuingBody ?? '');
  const [url, setUrl] = useState(initial?.url ?? draft?.url ?? '');
  const [visibility, setVisibility] = useState<ReportVisibility>(initial?.visibility ?? draft?.visibility ?? 'public');
  const [errors, setErrors] = useState<{ horse_id?: string; title?: string }>({});
  const [saving, setSaving] = useState(false);

  const { clearDraft, restored } = useFormDraft<ReportDraft>(
    draftKey,
    { selectedHorseId, docType, title, issuedDate, issuingBody, url, visibility },
    {
      enabled: !isEdit,
      isEmpty: (d) => !d.title.trim() && !d.issuingBody.trim() && !d.url.trim() && !d.issuedDate,
    },
  );
  const [draftRestored, setDraftRestored] = useState(restored);
  function discardDraft() {
    clearDraft();
    setSelectedHorseId(horseId ?? '');
    setDocType('Registration');
    setTitle(''); setIssuedDate(''); setIssuingBody(''); setUrl(''); setVisibility('public');
    setDraftRestored(false);
  }

  async function handleSubmit() {
    const e: typeof errors = {};
    if (!selectedHorseId) e.horse_id = 'Please select a horse';
    if (!title.trim()) e.title = 'Title is required';
    setErrors(e);
    if (Object.keys(e).length > 0) { toast.error('Please complete all required fields'); return; }
    setSaving(true);
    const payload: Omit<HorseReport, 'id' | 'createdAt'> = {
      horse_id: selectedHorseId, doc_type: docType, title: title.trim(),
      issued_date: issuedDate || undefined, issuing_body: issuingBody.trim() || undefined,
      url: url.trim() || undefined, visibility,
    };
    try {
      if (isEdit && initial) { await updateReport(initial.id, payload); toast.success('Document updated'); }
      else { await addReport(payload); toast.success('Document saved'); }
      clearDraft();
      onSave();
    } catch { toast.error('Failed to save — please try again'); }
    finally { setSaving(false); }
  }

  const header = (
    <div style={{ position: 'relative', padding: '14px 18px', background: 'linear-gradient(180deg, var(--forest-light) 0%, var(--forest-mid) 100%)', borderBottom: '2px solid var(--gold-dark)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: 3, background: 'rgba(26,51,34,0.85)', border: '1px solid var(--gold-mid)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FileText size={13} style={{ color: 'var(--gold-bright)' }} /></div>
        <div>
          <div style={{ fontSize: '0.5rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--gold-mid)', ...serifStyle }}>Stable Press · Reports / Forms</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--parchment)', lineHeight: 1, ...serifStyle }}>{isEdit ? 'Edit Document' : 'New Document'}</div>
        </div>
      </div>
      <button onClick={onCancel} aria-label="Cancel" style={{ width: 26, height: 26, borderRadius: 2, border: '1px solid var(--gold-dark)', background: 'rgba(26,51,34,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={13} style={{ color: 'var(--gold-bright)' }} /></button>
    </div>
  );

  const body = (
    <div style={{ padding: '16px 18px', overflowY: 'auto', maxHeight: compact ? 'calc(100vh - 240px)' : '70vh', background: 'var(--parchment)' }}>
      {draftRestored && <DraftRestoredHint onDiscard={discardDraft} />}
      <div style={{ marginBottom: 10 }}>
        <FieldLabel required>Horse</FieldLabel>
        {horseLocked ? (
          <div style={{ padding: '6px 9px', background: 'rgba(0,0,0,0.04)', border: '1px solid var(--parchment-dark)', borderRadius: 3, fontSize: '0.72rem', color: 'var(--forest-deep)', ...serifStyle }}>{allHorses.find((h) => h.id === selectedHorseId)?.name ?? selectedHorseId}</div>
        ) : (
          <FieldSelect value={selectedHorseId} onChange={setSelectedHorseId}>
            <option value="">— Select horse —</option>
            {allHorses.map((h) => <option key={h.id} value={h.id}>{h.isUnnamed ? 'Un-Named' : h.name}</option>)}
          </FieldSelect>
        )}
        <FieldError msg={errors.horse_id} />
      </div>
      <Row2>
        <div><FieldLabel required>Document Type</FieldLabel><FieldSelect value={docType} onChange={(v) => setDocType(v as ReportDocType)}>{REPORT_DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</FieldSelect></div>
        <div><FieldLabel>Visibility</FieldLabel><FieldSelect value={visibility} onChange={(v) => setVisibility(v as ReportVisibility)}><option value="public">Public</option><option value="restricted">Restricted (members only)</option></FieldSelect></div>
      </Row2>
      <div style={{ marginBottom: 10 }}><FieldLabel required>Title</FieldLabel><FieldInput value={title} onChange={setTitle} placeholder="Certificate of Registration" hasError={!!errors.title} /><FieldError msg={errors.title} /></div>
      <Row2>
        <div><FieldLabel>Issued Date</FieldLabel><FieldInput type="date" value={issuedDate} onChange={setIssuedDate} /></div>
        <div><FieldLabel>Issuing Body</FieldLabel><FieldInput value={issuingBody} onChange={setIssuingBody} placeholder="Racing Australia" /></div>
      </Row2>
      <div><FieldLabel>Document Link</FieldLabel><FieldInput value={url} onChange={setUrl} placeholder="https://… or /path" /></div>
    </div>
  );

  const footer = (
    <div style={{ padding: '12px 18px', background: 'linear-gradient(180deg, var(--forest-mid) 0%, var(--forest-deep) 100%)', borderTop: '2px solid var(--gold-dark)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <button onClick={onCancel} style={{ padding: '6px 16px', background: 'transparent', border: '1px solid var(--gold-dark)', borderRadius: 3, cursor: 'pointer', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--gold-mid)', ...serifStyle }}>Cancel</button>
      <button onClick={handleSubmit} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 20px', background: saving ? 'var(--gold-dark)' : 'linear-gradient(135deg, var(--gold-bright) 0%, var(--gold-mid) 100%)', border: 'none', borderRadius: 3, cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--forest-deep)', ...serifStyle }}><FileText size={11} strokeWidth={2.5} />{saving ? 'Saving…' : isEdit ? 'Update' : 'Save Document'}</button>
    </div>
  );

  if (compact) {
    return <div style={{ ...serifStyle, display: 'flex', flexDirection: 'column', background: 'var(--parchment)' }}>{header}{body}{footer}</div>;
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,24,15,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 640, maxHeight: '92vh', display: 'flex', flexDirection: 'column', border: '2px solid var(--gold-mid)', borderRadius: 4, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.9)', ...serifStyle }}>{header}{body}{footer}</div>
    </div>
  );
}
