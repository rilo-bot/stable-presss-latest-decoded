import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { User, Building2, Upload, X, Check, Camera, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { usePartyStore } from '@/stores/partyStore';
import type { Party, PartyType, PartyRole, PersonnelSubtype } from '@/types/party';
import {
  PARTY_ROLES,
  PARTY_ROLE_LABELS,
  getStartedYearLabel,
  PERSONNEL_SUBTYPES,
  PERSONNEL_SUBTYPE_LABELS,
} from '@/types/party';

/* ─────────────────────────────────────────────
   Props
───────────────────────────────────────────── */
interface PartyFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When supplied, the form operates in edit mode. */
  party?: Party;
  /**
   * When supplied (and not in edit mode), the form opens with this role
   * pre-selected so the user does not have to pick it manually.
   */
  defaultRole?: PartyRole;
  /** Called after a successful save so callers can react (e.g. navigate). */
  onSaved?: (id: string) => void;
}

/* ─────────────────────────────────────────────
   Helpers
───────────────────────────────────────────── */

/**
 * Compress an image File to a small JPEG data URL.
 * Max dimension is capped and JPEG quality is set low enough that
 * the result comfortably fits in localStorage even for many records.
 */
function compressImage(file: File, maxDim = 320, quality = 0.55): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = (evt) => {
      const src = evt.target?.result as string;
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to decode image'));
      img.onload = () => {
        const { naturalWidth: w, naturalHeight: h } = img;
        const scale = Math.min(1, maxDim / Math.max(w, h));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas not supported')); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE_MB = 5;

/** Calculate age in whole years from a YYYY-MM-DD string. Returns null if invalid. */
function calcAge(dob: string): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const mDiff = now.getMonth() - birth.getMonth();
  if (mDiff < 0 || (mDiff === 0 && now.getDate() < birth.getDate())) age--;
  return age >= 0 ? age : null;
}

const CURRENT_YEAR = new Date().getFullYear();

/* ─────────────────────────────────────────────
   Component
───────────────────────────────────────────── */
export function PartyForm({ open, onOpenChange, party, defaultRole, onSaved }: PartyFormProps) {
  const addParty = usePartyStore((s) => s.addParty);
  const updateParty = usePartyStore((s) => s.updateParty);
  const isEdit = !!party;

  /* ── Form state ── */
  const [partyType, setPartyType] = useState<PartyType>(party?.party_type ?? 'person');
  const [name, setName] = useState(party?.name ?? '');
  // In create mode, honour defaultRole as the initial selection
  const [roles, setRoles] = useState<PartyRole[]>(
    party?.roles ?? (defaultRole ? [defaultRole] : [])
  );
  const [photo, setPhoto] = useState<string | undefined>(party?.photo);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | undefined>(party?.photo);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);

  /* ── New field state ── */
  const [profession, setProfession] = useState(party?.profession ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(party?.date_of_birth ?? '');
  const [countryOfBirth, setCountryOfBirth] = useState(party?.country_of_birth ?? '');
  const [baseLocation, setBaseLocation] = useState(party?.base_location ?? '');
  const [startedYear, setStartedYear] = useState<string>(
    party?.started_year ? String(party.started_year) : ''
  );
  const [personnelSubtypes, setPersonnelSubtypes] = useState<PersonnelSubtype[]>(
    party?.personnel_subtype ?? []
  );

  /* ── Derived: auto-calculated age ── */
  const calculatedAge = useMemo(() => calcAge(dateOfBirth), [dateOfBirth]);

  /* ── Derived: adaptive started-year label ── */
  const startedYearLabel = useMemo(() => getStartedYearLabel(roles), [roles]);

  /* ── Derived: show personnel subtype picker ── */
  const showPersonnelSubtype = roles.includes('personnel');

  /* ── Reset form to blank (with optional defaultRole) when the dialog opens ── */
  const resetForm = useCallback(() => {
    setPartyType(party?.party_type ?? 'person');
    setName(party?.name ?? '');
    // In create mode, re-apply the defaultRole; in edit mode, restore existing roles
    setRoles(party?.roles ?? (defaultRole ? [defaultRole] : []));
    setPhoto(party?.photo);
    setPhotoFile(null);
    setPhotoPreview(party?.photo);
    setErrors({});
    setSaving(false);
    setProfession(party?.profession ?? '');
    setDateOfBirth(party?.date_of_birth ?? '');
    setCountryOfBirth(party?.country_of_birth ?? '');
    setBaseLocation(party?.base_location ?? '');
    setStartedYear(party?.started_year ? String(party.started_year) : '');
    setPersonnelSubtypes(party?.personnel_subtype ?? []);
  }, [party, defaultRole]);

  /*
   * When the dialog opens AND we are in create mode, sync the defaultRole
   * into the form in case it changed between opens (e.g. the user clicked
   * "Add Owner" then "Add Trainer" without ever submitting).
   */
  useEffect(() => {
    if (open && !isEdit) {
      setRoles(defaultRole ? [defaultRole] : []);
      // Clear everything else back to blank
      setPartyType('person');
      setName('');
      setPhoto(undefined);
      setPhotoFile(null);
      setPhotoPreview(undefined);
      setErrors({});
      setSaving(false);
      setProfession('');
      setDateOfBirth('');
      setCountryOfBirth('');
      setBaseLocation('');
      setStartedYear('');
      setPersonnelSubtypes([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultRole]);

  /* ── Type toggle ── */
  const handleTypeChange = (type: PartyType) => {
    setPartyType(type);
    if (type === 'organisation') {
      setErrors((prev) => { const n = { ...prev }; delete n.photo; return n; });
    }
  };

  /* ── Role toggle ── */
  const toggleRole = (role: PartyRole) => {
    setRoles((prev) => {
      const next = prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role];
      // Clear personnel subtypes if personnel role is being removed
      if (role === 'personnel' && prev.includes('personnel')) {
        setPersonnelSubtypes([]);
      }
      return next;
    });
    setErrors((prev) => { const n = { ...prev }; delete n.roles; return n; });
  };

  /* ── Personnel subtype toggle ── */
  const togglePersonnelSubtype = (subtype: PersonnelSubtype) => {
    setPersonnelSubtypes((prev) =>
      prev.includes(subtype) ? prev.filter((s) => s !== subtype) : [...prev, subtype]
    );
  };

  /* ── Photo handling ── */
  const processPhotoFile = async (file: File) => {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      toast.error('Please upload a JPEG, PNG, WebP or GIF image.');
      return;
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      toast.error(`Image must be under ${MAX_FILE_SIZE_MB} MB.`);
      return;
    }
    try {
      // Show a full-res preview immediately for good UX
      const previewReader = new FileReader();
      previewReader.onload = (e) => {
        setPhotoPreview(e.target?.result as string);
      };
      previewReader.readAsDataURL(file);

      // Compress to a small JPEG for storage — prevents localStorage quota errors
      const compressed = await compressImage(file, 320, 0.55);
      setPhotoFile(file);
      setPhoto(compressed);
      setErrors((prev) => { const n = { ...prev }; delete n.photo; return n; });
    } catch {
      toast.error('Could not process the image file. Please try again.');
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await processPhotoFile(file);
    e.target.value = '';
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await processPhotoFile(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const removePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(undefined);
    setPhoto(undefined);
  };

  /* ── Validation ── */
  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Name is required.';
    if (roles.length === 0) next.roles = 'Select at least one role.';
    if (partyType === 'person' && !photo) next.photo = 'A photo is required for individuals.';
    if (startedYear) {
      const yr = parseInt(startedYear, 10);
      if (isNaN(yr) || yr < 1900 || yr > CURRENT_YEAR) {
        next.started_year = `Enter a valid year between 1900 and ${CURRENT_YEAR}.`;
      }
    }
    if (dateOfBirth) {
      const d = new Date(dateOfBirth);
      if (isNaN(d.getTime())) {
        next.date_of_birth = 'Enter a valid date.';
      } else if (d > new Date()) {
        next.date_of_birth = 'Date of birth cannot be in the future.';
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  /* ── Submit ── */
  const handleSave = async () => {
    if (!validate()) {
      toast.error('Please fix the errors before saving.');
      return;
    }
    setSaving(true);
    try {
      const payload: Omit<Party, 'id' | 'createdAt'> = {
        party_type: partyType,
        roles,
        name: name.trim(),
        photo,
        profession: profession.trim() || undefined,
        date_of_birth: dateOfBirth || undefined,
        country_of_birth: countryOfBirth.trim() || undefined,
        base_location: baseLocation.trim() || undefined,
        started_year: startedYear ? parseInt(startedYear, 10) : undefined,
        personnel_subtype: showPersonnelSubtype && personnelSubtypes.length > 0
          ? personnelSubtypes
          : undefined,
      };
      if (isEdit && party) {
        await updateParty(party.id, payload);
        toast.success('Party record updated.');
        onSaved?.(party.id);
      } else {
        const id = await addParty(payload);
        toast.success('Party added to Stable Press.');
        onSaved?.(id);
      }
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('quota') || message.includes('QuotaExceeded')) {
        toast.error('Storage is full. Try removing some existing records to free up space.');
      } else {
        toast.error('Something went wrong saving this party. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  /* ─────────────────────────────────────────────
     Render
  ───────────────────────────────────────────── */
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) resetForm();
        onOpenChange(o);
      }}
    >
      <DialogContent
        className="max-w-2xl w-full max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden"
        aria-describedby={undefined}
      >
        {/* ── Sticky header ── */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/60 flex-shrink-0">
          <DialogTitle className="font-[family-name:var(--font-display)] text-xl font-bold text-foreground">
            {isEdit ? 'Edit Party' : 'Add New Party'}
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Register an individual or organisation connected to the racing industry.
          </p>
        </DialogHeader>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* ── Party Type Toggle ── */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-[0.1em] font-semibold text-muted-foreground">
              Party Type <span className="text-destructive">*</span>
            </Label>
            <div className="grid grid-cols-2 gap-3">
              {(['person', 'organisation'] as PartyType[]).map((type) => {
                const Icon = type === 'person' ? User : Building2;
                const label = type === 'person' ? 'Individual' : 'Organisation';
                const desc = type === 'person'
                  ? 'Jockey, trainer, owner…'
                  : 'Stud farm, syndicate, bloodstock…';
                const selected = partyType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => handleTypeChange(type)}
                    className={cn(
                      'relative flex items-start gap-3 rounded-md border-2 p-4 text-left transition-all',
                      selected
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-card hover:border-primary/40 hover:bg-muted/40'
                    )}
                  >
                    <div
                      className={cn(
                        'mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors',
                        selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                      )}
                    >
                      <Icon size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground leading-tight">{label}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{desc}</p>
                    </div>
                    {selected && (
                      <span className="absolute top-3 right-3 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check size={10} strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Name ── */}
          <div className="space-y-1.5">
            <Label htmlFor="party-name" className="text-xs uppercase tracking-[0.1em] font-semibold text-muted-foreground">
              {partyType === 'person' ? 'Full Name' : 'Organisation Name'}{' '}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id="party-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (e.target.value.trim()) setErrors((prev) => { const n = { ...prev }; delete n.name; return n; });
              }}
              placeholder={partyType === 'person' ? 'e.g. Ciaron Maher' : 'e.g. Trelawny Stud'}
              className={cn(errors.name && 'border-destructive ring-destructive')}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'party-name-error' : undefined}
            />
            {errors.name && (
              <p id="party-name-error" className="text-xs text-destructive mt-1">{errors.name}</p>
            )}
          </div>

          {/* ── Profession ── */}
          <div className="space-y-1.5">
            <Label htmlFor="party-profession" className="text-xs uppercase tracking-[0.1em] font-semibold text-muted-foreground">
              Profession
            </Label>
            <Input
              id="party-profession"
              value={profession}
              onChange={(e) => setProfession(e.target.value)}
              placeholder={partyType === 'person' ? 'e.g. Thoroughbred Trainer' : 'e.g. Bloodstock Agency'}
            />
          </div>

          {/* ── Roles ── */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-[0.1em] font-semibold text-muted-foreground">
              Roles <span className="text-destructive">*</span>
            </Label>
            <p className="text-[11px] text-muted-foreground -mt-1">
              Select all roles this party holds in the racing industry.
            </p>
            <div className="flex flex-wrap gap-2 mt-1" role="group" aria-label="Party roles">
              {PARTY_ROLES.map((role) => {
                const active = roles.includes(role);
                return (
                  <button
                    key={role}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleRole(role)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all border',
                      active
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-card text-muted-foreground border-border hover:border-primary/60 hover:text-foreground'
                    )}
                  >
                    {active && <Check size={10} strokeWidth={3} />}
                    {PARTY_ROLE_LABELS[role]}
                  </button>
                );
              })}
            </div>
            {errors.roles && (
              <p className="text-xs text-destructive mt-1">{errors.roles}</p>
            )}
          </div>

          {/* ── Personnel Subtype (revealed only when 'personnel' role is selected) ── */}
          {showPersonnelSubtype && (
            <div className="space-y-2 pl-4 border-l-2 border-primary/30">
              <div>
                <Label className="text-xs uppercase tracking-[0.1em] font-semibold text-muted-foreground">
                  Personnel Type
                </Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Select all that apply for this personnel member.
                </p>
              </div>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Personnel subtypes">
                {PERSONNEL_SUBTYPES.map((subtype) => {
                  const active = personnelSubtypes.includes(subtype);
                  return (
                    <button
                      key={subtype}
                      type="button"
                      aria-pressed={active}
                      onClick={() => togglePersonnelSubtype(subtype)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all border',
                        active
                          ? 'bg-[hsl(var(--brand-accent))] text-[hsl(var(--brand-accent-foreground))] border-[hsl(var(--brand-accent))] shadow-sm'
                          : 'bg-card text-muted-foreground border-border hover:border-[hsl(var(--brand-accent))]/60 hover:text-foreground'
                      )}
                    >
                      {active && <Check size={10} strokeWidth={3} />}
                      {PERSONNEL_SUBTYPE_LABELS[subtype]}
                    </button>
                  );
                })}
              </div>
              {personnelSubtypes.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {personnelSubtypes.length} subtype{personnelSubtypes.length !== 1 ? 's' : ''} selected
                </p>
              )}
            </div>
          )}

          {/* ── Date of Birth + Auto Age (person only) ── */}
          {partyType === 'person' && (
            <div className="space-y-1.5">
              <Label htmlFor="party-dob" className="text-xs uppercase tracking-[0.1em] font-semibold text-muted-foreground">
                Date of Birth
              </Label>
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <Input
                    id="party-dob"
                    type="date"
                    value={dateOfBirth}
                    max={new Date().toISOString().split('T')[0]}
                    onChange={(e) => {
                      setDateOfBirth(e.target.value);
                      setErrors((prev) => { const n = { ...prev }; delete n.date_of_birth; return n; });
                    }}
                    className={cn('pl-9', errors.date_of_birth && 'border-destructive ring-destructive')}
                    aria-invalid={!!errors.date_of_birth}
                    aria-describedby={errors.date_of_birth ? 'party-dob-error' : undefined}
                  />
                </div>
                {/* Auto-calculated age pill */}
                {calculatedAge !== null && (
                  <div className="flex-shrink-0 flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/25 rounded-md px-3 py-2 text-xs font-semibold">
                    <span className="font-[family-name:var(--font-display)] text-base font-bold leading-none">
                      {calculatedAge}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.08em] text-primary/70 font-semibold">
                      yrs
                    </span>
                  </div>
                )}
              </div>
              {errors.date_of_birth && (
                <p id="party-dob-error" className="text-xs text-destructive mt-1">{errors.date_of_birth}</p>
              )}
            </div>
          )}

          {/* ── Country of Birth ── */}
          <div className="space-y-1.5">
            <Label htmlFor="party-country" className="text-xs uppercase tracking-[0.1em] font-semibold text-muted-foreground">
              Country of Birth
            </Label>
            <Input
              id="party-country"
              value={countryOfBirth}
              onChange={(e) => setCountryOfBirth(e.target.value)}
              placeholder="e.g. Australia"
            />
          </div>

          {/* ── Base Location ── */}
          <div className="space-y-1.5">
            <Label htmlFor="party-base" className="text-xs uppercase tracking-[0.1em] font-semibold text-muted-foreground">
              Base Location
            </Label>
            <Input
              id="party-base"
              value={baseLocation}
              onChange={(e) => setBaseLocation(e.target.value)}
              placeholder="e.g. Flemington, VIC"
            />
          </div>

          {/* ── Started Year (role-adaptive label) ── */}
          <div className="space-y-1.5">
            <Label htmlFor="party-started-year" className="text-xs uppercase tracking-[0.1em] font-semibold text-muted-foreground">
              {startedYearLabel}
            </Label>
            <Input
              id="party-started-year"
              type="number"
              min={1900}
              max={CURRENT_YEAR}
              value={startedYear}
              onChange={(e) => {
                setStartedYear(e.target.value);
                setErrors((prev) => { const n = { ...prev }; delete n.started_year; return n; });
              }}
              placeholder={`e.g. ${CURRENT_YEAR - 10}`}
              className={cn(errors.started_year && 'border-destructive ring-destructive')}
              aria-invalid={!!errors.started_year}
              aria-describedby={errors.started_year ? 'party-started-year-error' : undefined}
            />
            {startedYear && !errors.started_year && (
              <p className="text-[11px] text-muted-foreground">
                {CURRENT_YEAR - parseInt(startedYear, 10)} years in the industry
              </p>
            )}
            {errors.started_year && (
              <p id="party-started-year-error" className="text-xs text-destructive mt-1">{errors.started_year}</p>
            )}
          </div>

          {/* ── Photo Upload (person only) ── */}
          {partyType === 'person' && (
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-[0.1em] font-semibold text-muted-foreground">
                Photo <span className="text-destructive">*</span>
              </Label>
              <p className="text-[11px] text-muted-foreground -mt-1">
                A clear headshot is required for all individuals. JPEG, PNG or WebP, max {MAX_FILE_SIZE_MB} MB.
              </p>

              {photoPreview ? (
                /* Preview state */
                <div className="relative inline-flex group">
                  <img
                    src={photoPreview}
                    alt="Photo preview"
                    crossOrigin="anonymous"
                    className="h-32 w-32 rounded-md object-cover border border-border/60 shadow-sm"
                  />
                  <div className="absolute inset-0 rounded-md bg-foreground/0 group-hover:bg-foreground/20 transition-colors" />
                  {/* Change / Remove controls */}
                  <div className="absolute -top-2 -right-2 flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="Change photo"
                      onClick={() => fileInputRef.current?.click()}
                      className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow hover:bg-primary/90 transition-colors"
                    >
                      <Camera size={13} />
                    </button>
                    <button
                      type="button"
                      aria-label="Remove photo"
                      onClick={removePhoto}
                      className="h-7 w-7 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow hover:bg-destructive/90 transition-colors"
                    >
                      <X size={13} />
                    </button>
                  </div>
                  {photoFile && (
                    <p className="absolute -bottom-5 left-0 text-[10px] text-muted-foreground truncate max-w-[128px]">
                      {photoFile.name}
                    </p>
                  )}
                </div>
              ) : (
                /* Drop-zone state */
                <div
                  ref={dropZoneRef}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  aria-label="Upload photo — click or drag and drop"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
                  }}
                  className={cn(
                    'flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-8 cursor-pointer transition-all',
                    dragOver
                      ? 'border-primary bg-primary/8 scale-[1.01]'
                      : errors.photo
                      ? 'border-destructive bg-destructive/5 hover:border-destructive/70'
                      : 'border-border/60 bg-muted/20 hover:border-primary/50 hover:bg-primary/5'
                  )}
                >
                  <div
                    className={cn(
                      'flex h-12 w-12 items-center justify-center rounded-full transition-colors',
                      dragOver ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                    )}
                  >
                    <Upload size={20} />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">
                      Click to upload or drag &amp; drop
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      JPEG, PNG, WebP or GIF — max {MAX_FILE_SIZE_MB} MB
                    </p>
                  </div>
                </div>
              )}

              {errors.photo && (
                <p className="text-xs text-destructive mt-1">{errors.photo}</p>
              )}

              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_IMAGE_TYPES.join(',')}
                className="sr-only"
                aria-hidden="true"
                tabIndex={-1}
                onChange={handleFileInputChange}
              />
            </div>
          )}
        </div>

        {/* ── Sticky footer ── */}
        <DialogFooter className="px-6 py-4 border-t border-border/60 flex-shrink-0 flex items-center justify-between gap-3">
          <DialogClose asChild>
            <Button variant="outline" type="button" disabled={saving}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="min-w-[110px]"
          >
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Party'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
