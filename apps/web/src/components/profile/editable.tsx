/**
 * Editable magazine kit — inline-edit building blocks that wear the ornate
 * parchment / serif look of the public profile pages (HorseDetail / PartyDetail)
 * rather than the plain form-first studio inputs. Used by the owner-editable
 * studios so the onboarding hub looks identical to the details page, just live:
 *   - InlineEditRow / InlineEditTextArea: a parchment dt/dd row that turns into a
 *     themed input on click and AUTO-SAVES on blur (Enter commits, Esc cancels).
 *   - HeroImageEdit: the gold-framed hero portrait with a direct upload overlay
 *     (click → OS picker → S3 upload, no modal).
 */
import { useEffect, useRef, useState } from 'react';
import { Camera, Check, Loader2, Pencil, Image as ImageIcon, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { serifStyle } from '@/components/profile/kit';
import { uploadImage, type UploadKind } from '@/lib/upload';

type SaveState = 'idle' | 'saving' | 'saved';

const labelStyle: React.CSSProperties = {
  fontSize: '0.56rem', textTransform: 'uppercase', letterSpacing: '0.1em',
  color: 'var(--parchment-shadow)', fontWeight: 700, flexShrink: 0, ...serifStyle,
};

const inputStyle: React.CSSProperties = {
  width: '100%', textAlign: 'right', background: 'var(--parchment)',
  border: '1px solid var(--gold-mid)', borderRadius: 2, padding: '2px 6px',
  fontSize: '0.72rem', fontWeight: 600, color: 'var(--forest-deep)',
  outline: 'none', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.12)', ...serifStyle,
};

function SaveBadge({ state }: { state: SaveState }) {
  if (state === 'saving') return <Loader2 size={10} className="animate-spin" style={{ color: 'var(--gold-dark)', flexShrink: 0 }} />;
  if (state === 'saved') return <Check size={11} strokeWidth={3} style={{ color: '#2d7a4a', flexShrink: 0 }} />;
  return null;
}

interface InlineEditRowProps {
  label: string;
  /** Raw editable value (date as YYYY-MM-DD, number as its string form). */
  value: string;
  onSave: (next: string) => void | Promise<void>;
  editable?: boolean;
  type?: 'text' | 'number' | 'date';
  /** Pre-formatted display string (e.g. a formatted date / money) when not editing. */
  displayValue?: string;
  highlight?: boolean;
  min?: number | string;
  max?: number | string;
}

/** A parchment row that becomes a themed input on click and auto-saves on blur. */
export function InlineEditRow({ label, value, onSave, editable, type = 'text', displayValue, highlight, min, max }: InlineEditRowProps) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? '');
  const [state, setState] = useState<SaveState>('idle');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => { setVal(value ?? ''); }, [value]);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const commit = async () => {
    setEditing(false);
    if ((value ?? '') === val) return;
    setState('saving');
    try {
      await onSave(val);
      setState('saved');
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setState('idle'), 1400);
    } catch {
      setState('idle');
      setVal(value ?? '');
    }
  };
  const cancel = () => { setVal(value ?? ''); setEditing(false); };

  const shown = displayValue || value;
  const valueColor = highlight ? 'var(--gold-dark)' : 'var(--forest-deep)';

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid var(--parchment-shadow)', paddingBottom: 6, marginBottom: 6, gap: 8 }}>
      <dt style={labelStyle}>{label}</dt>
      <dd style={{ margin: 0, flex: editing ? 1 : '0 1 auto', minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}>
        {editing ? (
          <input
            autoFocus
            type={type}
            value={val}
            min={min}
            max={max}
            onChange={(e) => setVal(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); else if (e.key === 'Escape') cancel(); }}
            style={inputStyle}
          />
        ) : editable ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'right', maxWidth: '100%' }}
            title={`Edit ${label.toLowerCase()}`}
          >
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: shown ? valueColor : 'var(--parchment-shadow)', fontStyle: shown ? 'normal' : 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...serifStyle }}>
              {shown || `Add ${label.toLowerCase()}`}
            </span>
            <Pencil size={9} style={{ color: 'var(--gold-mid)', flexShrink: 0 }} />
          </button>
        ) : (
          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: valueColor, textAlign: 'right', ...serifStyle }}>{shown || '—'}</span>
        )}
        <SaveBadge state={state} />
      </dd>
    </div>
  );
}

interface InlineEditTextAreaProps {
  label: string;
  value: string;
  onSave: (next: string) => void | Promise<void>;
  editable?: boolean;
  placeholder?: string;
  rows?: number;
}

/** A parchment multi-line editor that auto-saves on blur. */
export function InlineEditTextArea({ label, value, onSave, editable, placeholder, rows = 3 }: InlineEditTextAreaProps) {
  const [val, setVal] = useState(value ?? '');
  const [state, setState] = useState<SaveState>('idle');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => { setVal(value ?? ''); }, [value]);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const commit = async () => {
    if ((value ?? '') === val) return;
    setState('saving');
    try {
      await onSave(val);
      setState('saved');
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setState('idle'), 1400);
    } catch {
      setState('idle');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={labelStyle}>{label}</span>
        <SaveBadge state={state} />
      </div>
      {editable ? (
        <textarea
          value={val}
          rows={rows}
          placeholder={placeholder}
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          style={{ width: '100%', resize: 'vertical', background: 'var(--parchment)', border: '1px solid var(--gold-mid)', borderRadius: 2, padding: '6px 8px', fontSize: '0.72rem', color: 'var(--forest-deep)', lineHeight: 1.5, outline: 'none', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)', ...serifStyle }}
        />
      ) : (
        <p style={{ fontSize: '0.72rem', color: value ? 'var(--forest-mid)' : 'var(--parchment-shadow)', fontStyle: value ? 'normal' : 'italic', lineHeight: 1.6, margin: 0, ...serifStyle }}>{value || 'Not recorded.'}</p>
      )}
    </div>
  );
}

interface HeroImageEditProps {
  src?: string;
  alt: string;
  editable?: boolean;
  kind: UploadKind;
  onUpload: (url: string) => void | Promise<void>;
  containerStyle?: React.CSSProperties;
  /** Caption overlay (role / name block) — only rendered once a real image exists. */
  children?: React.ReactNode;
  /** Empty-state button label. */
  label?: string;
}

/**
 * Gold-framed hero image with a DIRECT upload. No fake placeholder image: until a
 * real photo is uploaded it shows an explicit upload zone with a visible button.
 */
export function HeroImageEdit({ src, alt, editable, kind, onUpload, containerStyle, children, label = 'Upload photo' }: HeroImageEditProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | undefined>(src);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setPreview(src); }, [src]);

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);
    try {
      const { url } = await uploadImage(file, { kind, maxDim: 1280, quality: 0.72 });
      setPreview(url);
      await onUpload(url);
      toast.success('Photo updated.');
    } catch (err) {
      setPreview(src);
      toast.error(err instanceof Error ? err.message : 'Could not upload the image. Please try again.');
    } finally {
      URL.revokeObjectURL(localPreview);
      setBusy(false);
    }
  };

  const pick = () => inputRef.current?.click();

  return (
    <div style={{ position: 'relative', border: '3px solid var(--gold-mid)', boxShadow: '0 0 0 1px var(--gold-dark), 0 6px 24px rgba(0,0,0,0.7)', borderRadius: 4, overflow: 'hidden', background: 'var(--forest-deep)', ...containerStyle }}>
      {preview ? (
        <>
          <img src={preview} alt={alt} crossOrigin="anonymous" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, transparent 45%, rgba(0,0,0,0.5) 100%)', pointerEvents: 'none' }} />
          {children}
          {editable && (
            <button type="button" onClick={pick} disabled={busy} title="Change photo" style={{ position: 'absolute', top: 8, right: 8, display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 3, border: '1px solid var(--gold-mid)', background: 'rgba(14,36,22,0.85)', color: 'var(--gold-bright)', cursor: busy ? 'wait' : 'pointer', fontSize: '0.52rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, ...serifStyle }}>
              {busy ? <Loader2 size={11} className="animate-spin" /> : <Camera size={11} />}
              {busy ? 'Uploading…' : 'Change photo'}
            </button>
          )}
        </>
      ) : (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, background: 'linear-gradient(180deg, rgba(26,51,34,0.55) 0%, rgba(14,36,22,0.78) 100%)' }}>
          <div style={{ width: '100%', height: '100%', border: '2px dashed var(--gold-dark)', borderRadius: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center', padding: 16 }}>
            <div style={{ width: 46, height: 46, borderRadius: '50%', border: '1px solid var(--gold-dark)', background: 'rgba(14,36,22,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ImageIcon size={22} style={{ color: 'var(--gold-mid)' }} />
            </div>
            {editable ? (
              <>
                <button type="button" onClick={pick} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 4, border: '1px solid var(--gold-mid)', background: 'linear-gradient(135deg, var(--gold-bright), var(--gold-mid))', color: 'var(--forest-deep)', cursor: busy ? 'wait' : 'pointer', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, boxShadow: '0 2px 8px rgba(0,0,0,0.4)', ...serifStyle }}>
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                  {busy ? 'Uploading…' : label}
                </button>
                <span style={{ fontSize: '0.56rem', color: 'var(--gold-mid)', ...serifStyle }}>JPG or PNG · nothing uploaded yet</span>
              </>
            ) : (
              <span style={{ fontSize: '0.6rem', fontStyle: 'italic', color: 'var(--parchment-shadow)', ...serifStyle }}>No photo on file</span>
            )}
          </div>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={onChange} />
    </div>
  );
}
