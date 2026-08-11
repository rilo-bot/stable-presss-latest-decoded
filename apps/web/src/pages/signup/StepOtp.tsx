import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ArrowRight, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StepOtpProps {
  email: string;
  otpDigits: string[];
  otpPreview: string | null;
  otpError: string;
  loading: boolean;
  digitRefs: React.MutableRefObject<(HTMLInputElement | null)[]>;
  onBack: () => void;
  onDigitChange: (index: number, value: string) => void;
  onKeyDown: (index: number, e: React.KeyboardEvent<HTMLInputElement>) => void;
  onPaste: (e: React.ClipboardEvent) => void;
  onSubmit: (e: React.FormEvent) => void;
  onResend: () => void;
}

export default function StepOtp({
  email,
  otpDigits,
  otpPreview,
  otpError,
  loading,
  digitRefs,
  onBack,
  onDigitChange,
  onKeyDown,
  onPaste,
  onSubmit,
  onResend,
}: StepOtpProps) {
  return (
    <>
      <div className="mb-8">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          <ArrowRight size={12} className="rotate-180" />
          Back
        </button>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground mb-1">
          Confirm your email
        </h1>
        <div className="h-px w-full bg-foreground/10 mt-3 mb-4" />
        <p className="text-sm text-muted-foreground">
          We sent a 6-digit code to{' '}
          <span className="font-medium text-foreground">{email}</span>. Enter it below to
          complete your account setup.
        </p>
        {otpPreview && (
          <div className="mt-3 px-3 py-2 rounded bg-primary/10 border border-primary/20 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.12em] text-primary/70 font-semibold">
              Dev preview
            </span>
            <span className="text-sm font-mono font-bold text-primary tracking-widest">
              {otpPreview}
            </span>
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-6">
        <div className="space-y-2">
          <Label className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">
            Verification Code
          </Label>
          <div
            className="flex gap-2 justify-between"
            onPaste={onPaste}
            role="group"
            aria-label="6-digit verification code"
          >
            {otpDigits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { digitRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]"
                maxLength={1}
                value={digit}
                onChange={(e) => onDigitChange(i, e.target.value)}
                onKeyDown={(e) => onKeyDown(i, e)}
                aria-label={`Digit ${i + 1}`}
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                aria-invalid={otpError ? true : undefined}
                aria-describedby={otpError ? 'signup-otp-error' : undefined}
                className={cn(
                  'w-11 h-14 text-center text-xl font-bold font-mono rounded-md border bg-background transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  otpError
                    ? 'border-destructive focus-visible:ring-destructive'
                    : 'border-input hover:border-primary/40 focus:border-primary',
                  digit ? 'text-foreground' : 'text-muted-foreground'
                )}
              />
            ))}
          </div>
          {otpError && (
            <p id="signup-otp-error" role="alert" className="text-xs text-destructive mt-1">
              {otpError}
            </p>
          )}
        </div>

        <Button
          type="submit"
          disabled={loading || otpDigits.some((d) => d === '')}
          aria-busy={loading}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {loading ? 'Creating your account…' : 'Verify & Create Account'}
        </Button>
      </form>

      <button
        type="button"
        onClick={onResend}
        disabled={loading}
        className="mt-5 w-full flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
      >
        <RotateCcw size={13} />
        Resend code
      </button>

      <p className="mt-4 text-center text-sm text-muted-foreground">
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
