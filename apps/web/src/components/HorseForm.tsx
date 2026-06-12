import { useState, useEffect, useMemo, useRef } from 'react';
import { useHorseStore } from '@/stores/horseStore';
import { usePartyStore } from '@/stores/partyStore';
import type { Horse } from '@/types/horse';
import type { Party, PartyRole } from '@/types/party';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { X, Share as HorseIcon, Save, Trash, ChevronDown, Users, Plus, Check, Upload, Link, Image, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface HorseFormProps {
  open: boolean;
  onClose: () => void;
  editHorse?: Horse | null;
}

const SEX_OPTIONS = ['Colt', 'Filly', 'Mare', 'Stallion', 'Gelding', 'Rig'];

const COLOUR_OPTIONS = [
  'Bay', 'Dark Bay / Brown', 'Chestnut', 'Grey', 'Roan', 'Black',
  'Brown', 'Palomino', 'Dun', 'Buckskin', 'Cremello', 'Pinto',
];

const COUNTRY_OPTIONS = [
  'Australia', 'New Zealand', 'Ireland', 'United Kingdom',
  'France', 'United States', 'Japan', 'Hong Kong', 'South Africa',
  'Germany', 'Canada', 'Argentina', 'UAE', 'Singapore',
];

type FormData = Omit<Horse, 'id' | 'createdAt'>;

const empty = (): FormData => ({
  name: '',
  isUnnamed: false,
  sex: '',
  dob: '',
  colour: '',
  country: '',
  handsSize: undefined,
  metricSize: undefined,
  sire: '',
  sireSire: '',
  sireDam: '',
  dam: '',
  damYob: undefined,
  damSire: '',
  damDam: '',
  // Generation 3 — great-grandparents
  sireSireSire: '',
  sireSireDam: '',
  sireDamSire: '',
  sireDamDam: '',
  damSireSire: '',
  damSireDam: '',
  damDamSire: '',
  damDamDam: '',
  // Stud Book registry
  studBook: '',
  registrationNumber: '',
  microchip: '',
  brandFreeze: '',
  passportNumber: '',
  // Party ID arrays
  ownerIds: [],
  trainerIds: [],
  jockeyIds: [],
  breederIds: [],
  bloodstockAgentIds: [],
  syndicateManagerIds: [],
  personnelIds: [],
  // Legacy (kept for backwards compat)
  owner: '',
  ownerSince: '',
  breeder: '',
  trainer: '',
  trainerSince: '',
  jockey: '',
  syndicateManager: '',
  bloodstockAgent: '',
  horseBreaker: '',
  associatedPersonnel: '',
  careerRecord: '',
  careerWinnings: undefined,
  lastTenForm: '',
  seasonRecord: '',
  currentRating: undefined,
  pedigreeNotes: '',
  pullQuote: '',
  imageUrl: '',
  age: undefined,
});

/* ── Collapsible section component ── */
function Section({
  title,
  number,
  children,
  defaultOpen = true,
}: {
  title: string;
  number: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <fieldset className="border-0 p-0 m-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between pb-2 border-b border-border/40 mb-4 group"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/15 text-primary text-[9px] font-bold flex-shrink-0">
            {number}
          </span>
          <legend className="text-[10px] uppercase tracking-[0.14em] font-bold text-muted-foreground group-hover:text-foreground transition-colors">
            {title}
          </legend>
        </div>
        <ChevronDown
          size={13}
          className={cn(
            'text-muted-foreground transition-transform duration-200',
            open ? 'rotate-180' : 'rotate-0'
          )}
        />
      </button>
      {open && <div className="space-y-4">{children}</div>}
    </fieldset>
  );
}

/* ── Shared select ── */
function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-semibold">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-input rounded-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        aria-label={label}
      >
        <option value="">{placeholder ?? `Select…`}</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

/* ── Party multi-select picker ── */
function PartyPicker({
  label,
  roleFilter,
  selectedIds,
  onChange,
  allParties,
  required,
  hint,
}: {
  label: string;
  roleFilter: PartyRole | PartyRole[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  allParties: Party[];
  required?: boolean;
  hint?: string;
}) {
  const roles = Array.isArray(roleFilter) ? roleFilter : [roleFilter];
  const filtered = useMemo(
    () => allParties.filter((p) => p.roles.some((r) => roles.includes(r))),
    [allParties, roles]
  );

  const [open, setOpen] = useState(false);

  const toggle = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    onChange(next);
  };

  const selectedParties = useMemo(
    () => allParties.filter((p) => selectedIds.includes(p.id)),
    [allParties, selectedIds]
  );

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>

      {/* Selected chips */}
      {selectedParties.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1">
          {selectedParties.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-primary/10 text-primary text-[11px] font-medium border border-primary/20"
            >
              {p.name}
              <button
                type="button"
                onClick={() => toggle(p.id)}
                className="ml-0.5 hover:text-destructive transition-colors"
                aria-label={`Remove ${p.name}`}
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Dropdown trigger */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2 text-sm border border-input rounded-sm bg-background hover:bg-muted/40 focus:outline-none focus:ring-1 focus:ring-ring transition-colors text-left"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className="text-muted-foreground text-xs">
            {filtered.length === 0
              ? 'No parties with this role yet — add them in the CMS'
              : selectedIds.length === 0
              ? `Select ${label.toLowerCase()}…`
              : `${selectedIds.length} selected`}
          </span>
          <ChevronDown size={13} className={cn('text-muted-foreground transition-transform', open && 'rotate-180')} />
        </button>

        {open && filtered.length > 0 && (
          <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-sm shadow-lg max-h-48 overflow-y-auto">
            {filtered.map((p) => {
              const isSelected = selectedIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm hover:bg-primary/5 transition-colors',
                    isSelected && 'bg-primary/8'
                  )}
                  role="option"
                  aria-selected={isSelected}
                >
                  <div className={cn(
                    'w-4 h-4 rounded-[3px] border flex items-center justify-center flex-shrink-0 transition-colors',
                    isSelected ? 'bg-primary border-primary' : 'border-input'
                  )}>
                    {isSelected && <Check size={10} className="text-primary-foreground" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-xs truncate">{p.name}</p>
                    {p.profession && (
                      <p className="text-[10px] text-muted-foreground truncate">{p.profession}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 flex-shrink-0">
                    {p.roles.filter((r) => roles.includes(r)).map((r) => (
                      <span key={r} className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[9px] font-semibold uppercase tracking-wide">
                        {r}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Click-away dismissal */}
        {open && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
        )}
      </div>

      {filtered.length === 0 && (
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Plus size={10} />
          Create parties in the CMS Parties section, then they will appear here.
        </p>
      )}
      {hint && filtered.length > 0 && (
        <p className="text-[10px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

/* ── Image uploader: paste URL or upload file ── */
function ImageUploader({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const [mode, setMode] = useState<'url' | 'upload'>('url');
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file (JPG, PNG, WebP, etc.)');
      return;
    }
    // 5 MB limit — prevents localStorage quota errors
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be under 5 MB. For larger photos, paste a URL instead.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result === 'string') {
        onChange(result);
        toast.success('Image loaded. It will display this session — use a URL for permanent storage.');
      }
    };
    reader.onerror = () => {
      toast.error('Could not read the file. Try a different image.');
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => setDragging(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const clearImage = () => {
    onChange('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const isDataUrl = value?.startsWith('data:');

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex items-center gap-1 p-0.5 rounded-sm bg-muted/40 border border-border/40 w-fit">
        <button
          type="button"
          onClick={() => setMode('url')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] text-[11px] font-semibold transition-colors',
            mode === 'url'
              ? 'bg-card text-foreground shadow-sm border border-border/40'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Link size={11} />
          Paste URL
        </button>
        <button
          type="button"
          onClick={() => setMode('upload')}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] text-[11px] font-semibold transition-colors',
            mode === 'upload'
              ? 'bg-card text-foreground shadow-sm border border-border/40'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Upload size={11} />
          Upload File
        </button>
      </div>

      {/* URL input mode */}
      {mode === 'url' && (
        <div className="space-y-1.5">
          <Input
            id="horse-image"
            type="url"
            value={isDataUrl ? '' : (value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://example.com/horse-photo.jpg"
            className="text-sm"
          />
          <p className="text-[10px] text-muted-foreground">
            Paste a direct link to an image. URL-based photos are saved permanently.
          </p>
        </div>
      )}

      {/* File upload mode */}
      {mode === 'upload' && (
        <div className="space-y-2">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileRef.current?.click()}
            className={cn(
              'relative flex flex-col items-center justify-center gap-2 rounded-sm border-2 border-dashed cursor-pointer transition-colors py-6 px-4',
              dragging
                ? 'border-primary bg-primary/5'
                : 'border-border/50 bg-muted/20 hover:border-primary/50 hover:bg-primary/5'
            )}
          >
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Upload size={18} className="text-primary" />
            </div>
            <div className="text-center">
              <p className="text-xs font-semibold text-foreground">
                {dragging ? 'Drop the image here' : 'Click to browse or drag & drop'}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                JPG, PNG, WebP, GIF — max 5 MB
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={handleInputChange}
              aria-label="Upload horse image"
            />
          </div>

          {/* Session-only notice */}
          <div className="flex items-start gap-1.5 p-2 rounded-sm bg-[hsl(var(--brand-accent)/0.08)] border border-[hsl(var(--brand-accent)/0.2)]">
            <AlertTriangle size={11} className="text-[hsl(var(--brand-accent))] mt-0.5 flex-shrink-0" />
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">Session only.</span>{' '}
              Uploaded images display during this session but are not saved between page reloads
              (browser storage limits). For a permanent photo, paste a URL instead.
            </p>
          </div>
        </div>
      )}

      {/* Preview */}
      {value && (
        <div className="relative rounded-sm overflow-hidden border border-border/40 bg-muted/20">
          <img
            src={value}
            alt="Horse preview"
            crossOrigin="anonymous"
            className="w-full h-40 object-cover"
            onError={() => {
              toast.error('Could not load the image. Check the URL and try again.');
              onChange('');
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/30 via-transparent to-transparent" />
          <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Image size={11} className="text-primary-foreground" />
              <span className="text-[10px] text-primary-foreground font-medium">
                {isDataUrl ? 'Uploaded image (session only)' : 'Image URL preview'}
              </span>
            </div>
            <button
              type="button"
              onClick={clearImage}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-foreground/40 hover:bg-destructive/80 text-primary-foreground text-[10px] font-semibold transition-colors"
              aria-label="Remove image"
            >
              <X size={9} />
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function HorseForm({ open, onClose, editHorse }: HorseFormProps) {
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
              // Legacy
              owner: editHorse.owner ?? '',
              ownerSince: editHorse.ownerSince ?? '',
              breeder: editHorse.breeder ?? '',
              trainer: editHorse.trainer ?? '',
              trainerSince: editHorse.trainerSince ?? '',
              jockey: editHorse.jockey ?? '',
              syndicateManager: editHorse.syndicateManager ?? '',
              bloodstockAgent: editHorse.bloodstockAgent ?? '',
              horseBreaker: editHorse.horseBreaker ?? '',
              associatedPersonnel: editHorse.associatedPersonnel ?? '',
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
          : empty()
      );
      setConfirmDelete(false);
      setSaving(false);
    }
  }, [open, editHorse]);

  const setField = (field: keyof FormData, value: string | number | boolean | string[] | undefined) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.isUnnamed && !form.name.trim()) {
      toast.error('Horse name is required, or tick "Un-Named".');
      return;
    }

    // Check that at least one owner and one trainer are selected
    const hasOwner = (form.ownerIds ?? []).length > 0 || (form.owner ?? '').trim().length > 0;
    const hasTrainer = (form.trainerIds ?? []).length > 0 || (form.trainer ?? '').trim().length > 0;

    if (!hasOwner) {
      toast.error('At least one owner is required. Add owners in the Parties CMS first.');
      return;
    }
    if (!hasTrainer) {
      toast.error('At least one trainer is required. Add trainers in the Parties CMS first.');
      return;
    }

    setSaving(true);

    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 280));

      const displayName = form.isUnnamed ? 'Un-Named' : form.name;

      if (editHorse) {
        updateHorse(editHorse.id, form);
        toast.success(`${displayName} has been updated.`);
      } else {
        addHorse(form);
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
  const personnelParties = useMemo(() => allParties.filter((p) => p.roles.includes('personnel')), [allParties]);

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

            {/* ════════════════════════════
                SECTION 1 — Basic Information
                ════════════════════════════ */}
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

            {/* ════════════════════════════
                SECTION 2 — Pedigree (Bloodline)
                ════════════════════════════ */}
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
                      max={new Date().getFullYear()}
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
                <Textarea
                  id="horse-pedigree"
                  value={form.pedigreeNotes}
                  onChange={(e) => setField('pedigreeNotes', e.target.value)}
                  placeholder="e.g. By Galileo out of Golden Thread (Danehill). A strong staying pedigree with international Group 1 winners on both sides…"
                  className="text-sm resize-none"
                  rows={3}
                />
              </div>
            </Section>

            {/* ════════════════════════════
                SECTION 3 — Connections & Personnel
                ════════════════════════════ */}
            <Section title="Connections &amp; Personnel" number="3" defaultOpen={false}>
              {/* Hint banner */}
              <div className="flex items-start gap-2.5 p-3 rounded-sm bg-primary/5 border border-primary/15 -mt-2 mb-2">
                <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Users size={11} className="text-primary" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">Linked from your Party database</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    All connections below are sourced from Parties in the CMS. Create owners, trainers, jockeys and
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

            {/* ════════════════════════════
                SECTION 4 — Racing Summary
                ════════════════════════════ */}
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

            {/* ════════════════════════════
                EDITORIAL
                ════════════════════════════ */}
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
                  />
                </div>
              </div>
            </Section>
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
