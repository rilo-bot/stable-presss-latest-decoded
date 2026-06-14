/**
 * Studio kit — the clean, form-first building blocks for the member self-service
 * studios (PartyStudio + HorseStudio). Deliberately NOT the ornate magazine
 * layout: plain app-styled inputs that AUTO-SAVE on blur, a direct image-upload
 * tile (click → OS picker → upload, no modal), and a titled Section wrapper.
 */
import { useEffect, useRef, useState } from 'react';
import { Camera, Check, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { uploadImage, type UploadKind } from '@/lib/upload';

/* ── Titled section wrapper ─────────────────────────────────────────────────── */
export function Section({
  title, desc, right, children, className,
}: {
  title: string;
  desc?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-lg border border-border/60 bg-card p-5', className)}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-foreground">{title}</h2>
          {desc && <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

type SaveState = 'idle' | 'saving' | 'saved';

function SaveBadge({ state }: { state: SaveState }) {
  if (state === 'saving') return <Loader2 size={11} className="animate-spin text-muted-foreground" />;
  if (state === 'saved') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600">
        <Check size={10} strokeWidth={3} /> Saved
      </span>
    );
  }
  return null;
}

/* ── Auto-save text / number / date field ───────────────────────────────────── */
export function StudioField({
  label, value, onSave, type = 'text', placeholder, hint, disabled, min, max,
}: {
  label: string;
  value: string;
  onSave: (next: string) => void | Promise<void>;
  type?: 'text' | 'number' | 'date';
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
  min?: number | string;
  max?: number | string;
}) {
  const [val, setVal] = useState(value ?? '');
  const [state, setState] = useState<SaveState>('idle');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => { setVal(value ?? ''); }, [value]);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const commit = async () => {
    const next = type === 'number' ? val.trim() : val;
    if ((value ?? '') === next) return;
    setState('saving');
    try {
      await onSave(next);
      setState('saved');
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setState('idle'), 1400);
    } catch {
      setState('idle');
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 min-h-[16px]">
        <Label className="text-[11px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">{label}</Label>
        <SaveBadge state={state} />
      </div>
      <Input
        type={type}
        value={val}
        min={min}
        max={max}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter' && type !== 'text') (e.target as HTMLInputElement).blur(); }}
      />
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/* ── Auto-save multi-line field ─────────────────────────────────────────────── */
export function StudioTextArea({
  label, value, onSave, placeholder, rows = 3, disabled,
}: {
  label: string;
  value: string;
  onSave: (next: string) => void | Promise<void>;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
}) {
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
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 min-h-[16px]">
        <Label className="text-[11px] uppercase tracking-[0.08em] font-semibold text-muted-foreground">{label}</Label>
        <SaveBadge state={state} />
      </div>
      <textarea
        value={val}
        rows={rows}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
      />
    </div>
  );
}

/* ── Direct image-upload tile (click → OS picker → upload, no modal) ─────────── */
export function StudioImage({
  src, alt, onUpload, className, rounded, disabled, label = 'Upload photo', kind = 'misc',
}: {
  src?: string;
  alt: string;
  /** Receives the stored URL (S3 public URL, or an inline data URL in fallback mode). */
  onUpload: (url: string) => void | Promise<void>;
  className?: string;
  rounded?: boolean;
  disabled?: boolean;
  label?: string;
  /** Storage bucket folder hint. */
  kind?: UploadKind;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | undefined>(src);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setPreview(src); }, [src]);

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    // Show an instant local preview while the upload runs.
    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);
    try {
      // Compress + upload to S3 (presigned PUT); store the returned URL.
      const { url } = await uploadImage(file, { kind, maxDim: 640, quality: 0.7 });
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

  return (
    <button
      type="button"
      onClick={() => !disabled && inputRef.current?.click()}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'group relative overflow-hidden border-2 border-border bg-muted/40 transition-colors',
        !disabled && 'cursor-pointer hover:border-primary/60',
        rounded ? 'rounded-full' : 'rounded-lg',
        className,
      )}
    >
      {preview ? (
        <img src={preview} alt={alt} crossOrigin="anonymous" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-muted-foreground">
          <Upload size={20} />
          <span className="text-[10px] uppercase tracking-[0.08em] font-semibold">{label}</span>
        </div>
      )}
      {!disabled && (
        <div className="absolute inset-0 flex items-center justify-center bg-foreground/0 group-hover:bg-foreground/35 transition-colors">
          <span className="flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1.5 text-[11px] font-semibold text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
            {busy ? 'Uploading…' : preview ? 'Change' : label}
          </span>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={onChange} />
    </button>
  );
}
