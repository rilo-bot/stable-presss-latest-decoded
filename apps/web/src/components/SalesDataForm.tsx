import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useSaleStore } from '@/stores/saleStore';
import { usePartyStore } from '@/stores/partyStore';
import { useHorseStore } from '@/stores/horseStore';
import type { Sale, SaleType } from '@/types/sale';
import { SALE_TYPES } from '@/types/sale';
import { ShoppingCart, ChevronDown, X, AlertCircle } from 'lucide-react';

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

interface Props { horseId?: string; initial?: Sale; compact?: boolean; onSave: () => void; onCancel: () => void; }

export function SalesDataForm({ horseId, initial, compact = false, onSave, onCancel }: Props) {
  const addSale = useSaleStore((s) => s.addSale);
  const updateSale = useSaleStore((s) => s.updateSale);
  const allParties = usePartyStore((s) => s.parties);
  const fetchParties = usePartyStore((s) => s.fetchParties);
  const allHorses = useHorseStore((s) => s.horses);
  const fetchHorses = useHorseStore((s) => s.fetchHorses);
  useEffect(() => { fetchParties(); fetchHorses(); }, [fetchParties, fetchHorses]);

  const [selectedHorseId, setSelectedHorseId] = useState(initial?.horse_id ?? horseId ?? '');
  const [saleDate, setSaleDate] = useState(initial?.sale_date ?? '');
  const [saleType, setSaleType] = useState<SaleType>(initial?.sale_type ?? 'Yearling Sale');
  const [venue, setVenue] = useState(initial?.venue ?? '');
  const [lot, setLot] = useState(initial?.lot ?? '');
  const [price, setPrice] = useState(initial?.price !== undefined ? String(initial.price) : '');
  const [currency, setCurrency] = useState(initial?.currency ?? 'AUD');
  const [buyerId, setBuyerId] = useState(initial?.buyer_party_id ?? '');
  const [vendor, setVendor] = useState(initial?.vendor ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [errors, setErrors] = useState<{ horse_id?: string; sale_date?: string; venue?: string }>({});
  const [saving, setSaving] = useState(false);

  const isEdit = !!initial;
  const horseLocked = !!horseId;

  async function handleSubmit() {
    const e: typeof errors = {};
    if (!selectedHorseId) e.horse_id = 'Please select a horse';
    if (!saleDate) e.sale_date = 'Sale date is required';
    if (!venue.trim()) e.venue = 'Venue is required';
    setErrors(e);
    if (Object.keys(e).length > 0) { toast.error('Please complete all required fields'); return; }
    setSaving(true);
    const payload: Omit<Sale, 'id' | 'createdAt'> = {
      horse_id: selectedHorseId, sale_date: saleDate, sale_type: saleType, venue: venue.trim(),
      lot: lot.trim() || undefined, price: price !== '' ? Number(price) : undefined, currency,
      buyer_party_id: buyerId || undefined, vendor: vendor.trim() || undefined, notes: notes.trim() || undefined,
    };
    try {
      if (isEdit && initial) { await updateSale(initial.id, payload); toast.success('Sale record updated'); }
      else { await addSale(payload); toast.success('Sale record saved'); }
      onSave();
    } catch { toast.error('Failed to save — please try again'); }
    finally { setSaving(false); }
  }

  const header = (
    <div style={{ position: 'relative', padding: '14px 18px', background: 'linear-gradient(180deg, var(--forest-light) 0%, var(--forest-mid) 100%)', borderBottom: '2px solid var(--gold-dark)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: 3, background: 'rgba(26,51,34,0.85)', border: '1px solid var(--gold-mid)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ShoppingCart size={13} style={{ color: 'var(--gold-bright)' }} /></div>
        <div>
          <div style={{ fontSize: '0.5rem', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--gold-mid)', ...serifStyle }}>Stable Press · Sales Data</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--parchment)', lineHeight: 1, ...serifStyle }}>{isEdit ? 'Edit Sale Record' : 'New Sale Record'}</div>
        </div>
      </div>
      <button onClick={onCancel} aria-label="Cancel" style={{ width: 26, height: 26, borderRadius: 2, border: '1px solid var(--gold-dark)', background: 'rgba(26,51,34,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={13} style={{ color: 'var(--gold-bright)' }} /></button>
    </div>
  );

  const body = (
    <div style={{ padding: '16px 18px', overflowY: 'auto', maxHeight: compact ? 'calc(100vh - 240px)' : '70vh', background: 'var(--parchment)' }}>
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
        <div><FieldLabel required>Sale Date</FieldLabel><FieldInput type="date" value={saleDate} onChange={setSaleDate} hasError={!!errors.sale_date} /><FieldError msg={errors.sale_date} /></div>
        <div><FieldLabel required>Sale Type</FieldLabel><FieldSelect value={saleType} onChange={(v) => setSaleType(v as SaleType)}>{SALE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</FieldSelect></div>
      </Row2>
      <Row2>
        <div><FieldLabel required>Venue / Sale Company</FieldLabel><FieldInput value={venue} onChange={setVenue} placeholder="Magic Millions, Karaka…" hasError={!!errors.venue} /><FieldError msg={errors.venue} /></div>
        <div><FieldLabel>Lot</FieldLabel><FieldInput value={lot} onChange={setLot} placeholder="Lot 412" /></div>
      </Row2>
      <Row2>
        <div><FieldLabel>Price</FieldLabel><FieldInput type="number" value={price} onChange={setPrice} placeholder="420000" /></div>
        <div><FieldLabel>Currency</FieldLabel><FieldSelect value={currency} onChange={setCurrency}><option value="AUD">AUD</option><option value="NZD">NZD</option><option value="GBP">GBP</option><option value="USD">USD</option></FieldSelect></div>
      </Row2>
      <Row2>
        <div><FieldLabel>Buyer</FieldLabel><FieldSelect value={buyerId} onChange={setBuyerId}><option value="">— Select buyer —</option>{allParties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</FieldSelect></div>
        <div><FieldLabel>Vendor / Consignor</FieldLabel><FieldInput value={vendor} onChange={setVendor} placeholder="Newgate Stud" /></div>
      </Row2>
      <div><FieldLabel>Notes</FieldLabel><FieldInput value={notes} onChange={setNotes} placeholder="Optional notes" /></div>
    </div>
  );

  const footer = (
    <div style={{ padding: '12px 18px', background: 'linear-gradient(180deg, var(--forest-mid) 0%, var(--forest-deep) 100%)', borderTop: '2px solid var(--gold-dark)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <button onClick={onCancel} style={{ padding: '6px 16px', background: 'transparent', border: '1px solid var(--gold-dark)', borderRadius: 3, cursor: 'pointer', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--gold-mid)', ...serifStyle }}>Cancel</button>
      <button onClick={handleSubmit} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 20px', background: saving ? 'var(--gold-dark)' : 'linear-gradient(135deg, var(--gold-bright) 0%, var(--gold-mid) 100%)', border: 'none', borderRadius: 3, cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--forest-deep)', ...serifStyle }}><ShoppingCart size={11} strokeWidth={2.5} />{saving ? 'Saving…' : isEdit ? 'Update' : 'Save Sale'}</button>
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
