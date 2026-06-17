import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowRight, Loader2 } from 'lucide-react';

interface StepOrgProps {
  orgName: string;
  setOrgName: (value: string) => void;
  orgLocation: string;
  setOrgLocation: (value: string) => void;
  loading: boolean;
  onSubmit: () => void;
}

export default function StepOrg({
  orgName,
  setOrgName,
  orgLocation,
  setOrgLocation,
  loading,
  onSubmit,
}: StepOrgProps) {
  return (
    <>
      <div className="mb-8">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground mb-1">
          Set up your organisation
        </h2>
        <div className="h-px w-full bg-foreground/10 mt-3 mb-4" />
        <p className="text-sm text-muted-foreground">
          You&rsquo;ll become its owner — add members, manage horses, and control parties from
          your organisation dashboard.
        </p>
      </div>

      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label
            htmlFor="orgName"
            className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-semibold"
          >
            Organisation Name
          </Label>
          <Input
            id="orgName"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="Karaka Bloodstock"
          />
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="orgLocation"
            className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-semibold"
          >
            Base Location <span className="text-muted-foreground/60 normal-case">(optional)</span>
          </Label>
          <Input
            id="orgLocation"
            value={orgLocation}
            onChange={(e) => setOrgLocation(e.target.value)}
            placeholder="Auckland, New Zealand"
          />
        </div>

        <Button
          type="button"
          onClick={onSubmit}
          disabled={loading || !orgName.trim()}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
        >
          {loading ? (
            <>
              <Loader2 size={15} className="animate-spin" /> Creating…
            </>
          ) : (
            <>
              Create organisation <ArrowRight size={15} />
            </>
          )}
        </Button>
      </div>
    </>
  );
}
