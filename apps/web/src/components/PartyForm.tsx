import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { toast } from 'sonner';
import { Calendar, RotateCcw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { loadDraft, useFormDraft } from '@/hooks/useFormDraft';
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
import { usePeopleStore } from '@/stores/peopleStore';
import { uploadImage } from '@/lib/upload';
import type { PartyRole, PersonnelSubtype, Person } from '@/types/party';
import { getStartedYearLabel } from '@/types/party';
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_FILE_SIZE_MB,
  calcAge,
  CURRENT_YEAR,
  type PartyFormProps,
} from './party-form/helpers';
import { PhotoUpload } from './party-form/PhotoUpload';
import { RolePicker } from './party-form/RolePicker';
import type { RegisterPerson } from '@/lib/register';

interface PartyDraft {
  name: string;
  roles: PartyRole[];
  imageUrl?: string;
  profession: string;
  dateOfBirth: string;
  countryOfBirth: string;
  baseLocation: string;
  startedYear: string;
  personnelSubtypes: PersonnelSubtype[];
}

/* ─────────────────────────────────────────────
   Component
───────────────────────────────────────────── */
export function PartyForm({ open, onOpenChange, party, defaultRole, onSaved }: PartyFormProps) {
  // The PROFILE is a person; the ROLES are edges. Two stores, one form.
  const addPerson = usePeopleStore((s) => s.addPerson);
  const updatePerson = usePeopleStore((s) => s.updatePerson);
  const addParty = usePartyStore((s) => s.addParty);
  const removeParty = usePartyStore((s) => s.removeParty);
  const isEdit = !!party;

  /* ── Form state ── (parties are always individuals; orgs live in their own collection) */
  const [name, setName] = useState(party?.name ?? '');
  // In create mode, honour defaultRole as the initial selection
  const [roles, setRoles] = useState<PartyRole[]>(
    party?.roles ?? (defaultRole ? [defaultRole] : [])
  );
  const [photo, setPhoto] = useState<string | undefined>(party?.imageUrl);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | undefined>(party?.imageUrl);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);

  // Drafting is scoped to the entry point (e.g. "Add Owner" vs "Add Trainer").
  const draftKey = `party:${defaultRole ?? 'global'}`;

  /* ── New field state ── */
  const [profession, setProfession] = useState(party?.profession ?? '');
  const [dateOfBirth, setDateOfBirth] = useState(party?.dateOfBirth ?? '');
  const [countryOfBirth, setCountryOfBirth] = useState(party?.countryOfBirth ?? '');
  const [baseLocation, setBaseLocation] = useState(party?.baseLocation ?? '');
  const [startedYear, setStartedYear] = useState<string>(
    party?.startedYear ? String(party.startedYear) : ''
  );
  const [personnelSubtypes, setPersonnelSubtypes] = useState<PersonnelSubtype[]>(
    party?.personnelSubtype ?? []
  );

  /* ── Derived: auto-calculated age ── */
  const calculatedAge = useMemo(() => calcAge(dateOfBirth), [dateOfBirth]);

  /* ── Derived: adaptive started-year label ── */
  const startedYearLabel = useMemo(() => getStartedYearLabel(roles), [roles]);

  /* ── Derived: show personnel subtype picker ── */
  const showPersonnelSubtype = roles.includes('personnel');

  /* ── Reset form to blank (with optional defaultRole) when the dialog opens ── */
  const resetForm = useCallback(() => {
    setName(party?.name ?? '');
    // In create mode, re-apply the defaultRole; in edit mode, restore existing roles
    setRoles(party?.roles ?? (defaultRole ? [defaultRole] : []));
    setPhoto(party?.imageUrl);
    setPhotoFile(null);
    setPhotoPreview(party?.imageUrl);
    setErrors({});
    setSaving(false);
    setProfession(party?.profession ?? '');
    setDateOfBirth(party?.dateOfBirth ?? '');
    setCountryOfBirth(party?.countryOfBirth ?? '');
    setBaseLocation(party?.baseLocation ?? '');
    setStartedYear(party?.startedYear ? String(party.startedYear) : '');
    setPersonnelSubtypes(party?.personnelSubtype ?? []);
  }, [party, defaultRole]);

  /*
   * When the dialog opens AND we are in create mode, sync the defaultRole
   * into the form in case it changed between opens (e.g. the user clicked
   * "Add Owner" then "Add Trainer" without ever submitting).
   */
  useEffect(() => {
    if (open && !isEdit) {
      // Restore an in-progress draft if one was saved from a previous session.
      const draft = loadDraft<PartyDraft>(draftKey);
      setDraftRestored(!!draft);
      setRoles(draft?.roles ?? (defaultRole ? [defaultRole] : []));
      setName(draft?.name ?? '');
      setPhoto(draft?.imageUrl);
      setPhotoFile(null);
      setPhotoPreview(draft?.imageUrl);
      setErrors({});
      setSaving(false);
      setProfession(draft?.profession ?? '');
      setDateOfBirth(draft?.dateOfBirth ?? '');
      setCountryOfBirth(draft?.countryOfBirth ?? '');
      setBaseLocation(draft?.baseLocation ?? '');
      setStartedYear(draft?.startedYear ?? '');
      setPersonnelSubtypes(draft?.personnelSubtypes ?? []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultRole]);

  // Auto-save an in-progress draft so an accidental close doesn't lose work.
  const { clearDraft } = useFormDraft<PartyDraft>(
    draftKey,
    {
      name, roles, profession, dateOfBirth, countryOfBirth, baseLocation, startedYear,
      personnelSubtypes,
      // Skip transient data: URLs (preview blobs) — they can blow the localStorage quota.
      imageUrl: photo?.startsWith('data:') ? undefined : photo,
    },
    {
      enabled: open && !isEdit,
      // Roles default to the entry-point role, so don't count them as "real" input.
      isEmpty: (d) =>
        !d.name.trim() && !d.profession.trim() && !d.dateOfBirth &&
        !d.countryOfBirth.trim() && !d.baseLocation.trim() && !d.startedYear && !d.imageUrl,
    },
  );

  const discardDraft = () => {
    clearDraft();
    setRoles(defaultRole ? [defaultRole] : []);
    setName('');
    setPhoto(undefined);
    setPhotoFile(null);
    setPhotoPreview(undefined);
    setProfession('');
    setDateOfBirth('');
    setCountryOfBirth('');
    setBaseLocation('');
    setStartedYear('');
    setPersonnelSubtypes([]);
    setDraftRestored(false);
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
    // Show a full-res preview immediately for good UX while the upload runs.
    const previewReader = new FileReader();
    previewReader.onload = (e) => setPhotoPreview(e.target?.result as string);
    previewReader.readAsDataURL(file);
    try {
      // Compress to a small JPEG and upload to S3; store the returned URL.
      const { url } = await uploadImage(file, { kind: 'party', maxDim: 320, quality: 0.6 });
      setPhotoFile(file);
      setPhoto(url);
      setErrors((prev) => { const n = { ...prev }; delete n.imageUrl; return n; });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not upload the image. Please try again.');
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
    if (startedYear) {
      const yr = parseInt(startedYear, 10);
      if (isNaN(yr) || yr < 1900 || yr > CURRENT_YEAR) {
        next.startedYear = `Enter a valid year between 1900 and ${CURRENT_YEAR}.`;
      }
    }
    if (dateOfBirth) {
      const d = new Date(dateOfBirth);
      if (isNaN(d.getTime())) {
        next.dateOfBirth = 'Enter a valid date.';
      } else if (d > new Date()) {
        next.dateOfBirth = 'Date of birth cannot be in the future.';
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
      const payload: Omit<Person, 'id'> = {
        name: name.trim(),
        imageUrl: photo,
        profession: profession.trim() || undefined,
        dateOfBirth: dateOfBirth || undefined,
        countryOfBirth: countryOfBirth.trim() || undefined,
        baseLocation: baseLocation.trim() || undefined,
        startedYear: startedYear ? parseInt(startedYear, 10) : undefined,
        personnelSubtype: showPersonnelSubtype ? personnelSubtypes : [],
      };
      if (isEdit && party) {
        await updatePerson(party.id, payload);
        // Roles are edges, so a role change is an add/remove, not a field write.
        // Only edges with no horse are touched: one attached to a horse is a
        // real connection and is not this form's to delete.
        const held = new Set(party.roles);
        const wanted = new Set(roles);
        for (const role of roles) {
          if (!held.has(role)) await addParty({ personId: party.id, role });
        }
        for (const edge of party.edges) {
          if (!wanted.has(edge.role) && !edge.horseId) await removeParty(edge.id);
        }
        toast.success('Profile updated.');
        onSaved?.(party.id);
      } else {
        const id = await addPerson(payload);
        if (!id) return;
        // ONE EDGE PER ROLE — that is what makes them findable in the register.
        for (const role of roles) await addParty({ personId: id, role });
        clearDraft();
        setDraftRestored(false);
        toast.success('Added to the register.');
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
            {isEdit ? 'Edit Profile' : 'Add to the Register'}
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Register an individual or organisation connected to the racing industry.
          </p>
        </DialogHeader>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {draftRestored && !isEdit && (
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

          {/* ── Name ── */}
          <div className="space-y-1.5">
            <Label htmlFor="party-name" className="text-xs uppercase tracking-[0.1em] font-semibold text-muted-foreground">
              Full Name{' '}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id="party-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (e.target.value.trim()) setErrors((prev) => { const n = { ...prev }; delete n.name; return n; });
              }}
              placeholder="e.g. Ciaron Maher"
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
              placeholder="e.g. Thoroughbred Trainer"
            />
          </div>

          {/* ── Roles + Personnel Subtype ── */}
          <RolePicker
            roles={roles}
            toggleRole={toggleRole}
            rolesError={errors.roles}
            showPersonnelSubtype={showPersonnelSubtype}
            personnelSubtypes={personnelSubtypes}
            togglePersonnelSubtype={togglePersonnelSubtype}
          />

          {/* ── Date of Birth + Auto Age ── */}
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
                      setErrors((prev) => { const n = { ...prev }; delete n.dateOfBirth; return n; });
                    }}
                    className={cn('pl-9', errors.dateOfBirth && 'border-destructive ring-destructive')}
                    aria-invalid={!!errors.dateOfBirth}
                    aria-describedby={errors.dateOfBirth ? 'party-dob-error' : undefined}
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
              {errors.dateOfBirth && (
                <p id="party-dob-error" className="text-xs text-destructive mt-1">{errors.dateOfBirth}</p>
              )}
          </div>

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
                setErrors((prev) => { const n = { ...prev }; delete n.startedYear; return n; });
              }}
              placeholder={`e.g. ${CURRENT_YEAR - 10}`}
              className={cn(errors.startedYear && 'border-destructive ring-destructive')}
              aria-invalid={!!errors.startedYear}
              aria-describedby={errors.startedYear ? 'party-started-year-error' : undefined}
            />
            {startedYear && !errors.startedYear && (
              <p className="text-[11px] text-muted-foreground">
                {CURRENT_YEAR - parseInt(startedYear, 10)} years in the industry
              </p>
            )}
            {errors.startedYear && (
              <p id="party-started-year-error" className="text-xs text-destructive mt-1">{errors.startedYear}</p>
            )}
          </div>

          {/* ── Photo Upload ── */}
          <PhotoUpload
            photoPreview={photoPreview}
            photoFile={photoFile}
            photoError={errors.imageUrl}
            dragOver={dragOver}
            fileInputRef={fileInputRef}
            dropZoneRef={dropZoneRef}
            removePhoto={removePhoto}
            handleDrop={handleDrop}
            handleDragOver={handleDragOver}
            handleDragLeave={handleDragLeave}
            handleFileInputChange={handleFileInputChange}
          />
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
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add to Register'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
