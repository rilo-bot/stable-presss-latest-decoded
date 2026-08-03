import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ArrowRight, Check, Upload, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PARTY_ROLES, PARTY_ROLE_LABELS } from '@/types/party';
import type { PartyRole } from '@/types/party';

interface StepClaimProps {
  selectedRoles: PartyRole[];
  evidenceName: string | null;
  uploadingEvidence: boolean;
  loading: boolean;
  onToggleRole: (role: PartyRole) => void;
  onEvidenceFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: () => void;
  onSkip: () => void;
}

export default function StepClaim({
  selectedRoles,
  evidenceName,
  uploadingEvidence,
  loading,
  onToggleRole,
  onEvidenceFile,
  onSubmit,
  onSkip,
}: StepClaimProps) {
  return (
    <>
      <div className="mb-8">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground mb-1">
          Claim your racing role
        </h2>
        <div className="h-px w-full bg-foreground/10 mt-3 mb-4" />
        <p className="text-sm text-muted-foreground">
          Select the role(s) you hold. Each claim is reviewed by an administrator before it
          becomes active — until then it stays <span className="font-medium text-foreground">pending</span> and read-only.
        </p>
      </div>

      <div className="space-y-5">
        <div className="space-y-2">
          <Label className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">
            Your role(s)
          </Label>
          <div className="grid grid-cols-2 gap-2">
            {PARTY_ROLES.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => onToggleRole(role)}
                aria-pressed={selectedRoles.includes(role)}
                className={cn(
                  'flex items-center justify-between gap-2 px-3 py-2 rounded-md border text-sm transition-colors',
                  selectedRoles.includes(role)
                    ? 'border-primary bg-primary/10 text-primary font-semibold'
                    : 'border-input hover:border-primary/50 text-foreground',
                )}
              >
                <span className="truncate">{PARTY_ROLE_LABELS[role]}</span>
                {selectedRoles.includes(role) && <Check size={14} className="flex-shrink-0" />}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">
            Evidence (optional)
          </Label>
          <label className="flex items-center gap-2 px-3 py-2.5 rounded-md border border-dashed border-input hover:border-primary/50 cursor-pointer text-sm text-muted-foreground transition-colors">
            {uploadingEvidence
              ? <Loader2 size={15} className="flex-shrink-0 animate-spin" />
              : <Upload size={15} className="flex-shrink-0" />}
            <span className="truncate">
              {uploadingEvidence
                ? 'Uploading…'
                : evidenceName ?? 'Attach a licence or document (image/PDF, ≤4 MB)'}
            </span>
            <input
              type="file"
              className="hidden"
              accept="image/*,application/pdf"
              disabled={uploadingEvidence}
              onChange={onEvidenceFile}
            />
          </label>
        </div>

        <Button
          type="button"
          onClick={onSubmit}
          disabled={loading || selectedRoles.length === 0}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
        >
          {loading ? (
            <>
              <Loader2 size={15} className="animate-spin" /> Submitting…
            </>
          ) : (
            <>
              Submit for verification <ArrowRight size={15} />
            </>
          )}
        </Button>

        <button
          type="button"
          onClick={onSkip}
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip for now — I&rsquo;ll do this later
        </button>
      </div>
    </>
  );
}
