import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, ArrowRight, BookOpen, Star, Building2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AccountType = 'reader' | 'individual' | 'organisation';

type FieldErrors = {
  displayName?: string;
  email?: string;
};

interface StepDetailsProps {
  displayName: string;
  setDisplayName: (value: string) => void;
  email: string;
  setEmail: (value: string) => void;
  accountType: AccountType;
  setAccountType: (value: AccountType) => void;
  fieldErrors: FieldErrors;
  setFieldErrors: React.Dispatch<React.SetStateAction<FieldErrors>>;
  loading: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

export default function StepDetails({
  displayName,
  setDisplayName,
  email,
  setEmail,
  accountType,
  setAccountType,
  fieldErrors,
  setFieldErrors,
  loading,
  onSubmit,
}: StepDetailsProps) {
  return (
    <>
      <div className="mb-8">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground mb-1">
          Join the journal
        </h2>
        <div className="h-px w-full bg-foreground/10 mt-3 mb-4" />
        <p className="text-sm text-muted-foreground">
          Tell us who you are and we will send a verification code to confirm your email.
        </p>
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {/* Name */}
        <div className="space-y-1.5">
          <Label
            htmlFor="displayName"
            className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-semibold"
          >
            Your Name
          </Label>
          <Input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              if (fieldErrors.displayName)
                setFieldErrors((p) => ({ ...p, displayName: undefined }));
            }}
            autoComplete="name"
            placeholder="James Whitfield"
            className={
              fieldErrors.displayName
                ? 'border-destructive focus-visible:ring-destructive'
                : ''
            }
            aria-describedby={fieldErrors.displayName ? 'name-error' : undefined}
          />
          {fieldErrors.displayName && (
            <p id="name-error" className="text-xs text-destructive mt-1">
              {fieldErrors.displayName}
            </p>
          )}
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <Label
            htmlFor="email"
            className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-semibold"
          >
            Email Address
          </Label>
          <div className="relative">
            <Mail
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldErrors.email)
                  setFieldErrors((p) => ({ ...p, email: undefined }));
              }}
              autoComplete="email"
              placeholder="you@example.com"
              className={cn(
                'pl-9',
                fieldErrors.email
                  ? 'border-destructive focus-visible:ring-destructive'
                  : ''
              )}
              aria-describedby={fieldErrors.email ? 'email-error' : undefined}
            />
          </div>
          {fieldErrors.email && (
            <p id="email-error" className="text-xs text-destructive mt-1">
              {fieldErrors.email}
            </p>
          )}
        </div>

        {/* Account type — everyone is a reader; individuals also claim racing roles */}
        <div className="space-y-2">
          <Label className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">
            How will you use Stable Press?
          </Label>
          <div className="grid gap-2">
            {[
              { value: 'reader' as const, icon: <BookOpen size={15} />, label: 'Reader', desc: 'Follow horses & owners, read editorial, place tips.' },
              { value: 'individual' as const, icon: <Star size={15} />, label: 'Racing individual', desc: 'Owner, trainer, jockey, breeder… claim your role.' },
              { value: 'organisation' as const, icon: <Building2 size={15} />, label: 'Organisation', desc: 'Syndicate, stud, stable or agency with members.' },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setAccountType(opt.value)}
                aria-pressed={accountType === opt.value}
                className={cn(
                  'flex items-start gap-3 px-3 py-2.5 rounded-md border text-left transition-colors',
                  accountType === opt.value
                    ? 'border-primary bg-primary/8'
                    : 'border-input hover:border-primary/50',
                )}
              >
                <span className={cn('mt-0.5', accountType === opt.value ? 'text-primary' : 'text-muted-foreground')}>
                  {opt.icon}
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-foreground">{opt.label}</span>
                  <span className="block text-[11px] text-muted-foreground leading-snug">{opt.desc}</span>
                </span>
                {accountType === opt.value && <Check size={15} className="text-primary mt-0.5" />}
              </button>
            ))}
          </div>
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 gap-2 mt-2"
        >
          {loading ? 'Sending code…' : 'Send Verification Code'}
          {!loading && <ArrowRight size={15} />}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already a member?{' '}
        <Link
          to="/login"
          className="text-foreground font-medium hover:text-primary transition-colors underline underline-offset-2"
        >
          Sign in here
        </Link>
      </p>
    </>
  );
}
