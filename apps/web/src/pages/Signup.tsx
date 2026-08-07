import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { toast } from 'sonner';
import StepDetails from './signup/StepDetails';
import StepOtp from './signup/StepOtp';

/**
 * Signup is a NAME, an EMAIL, and a code. Nothing else.
 *
 * It used to ask "How will you use Stable Press?" and branch into a role-claim
 * step or an organisation step. Both were dead weight: the server reads only
 * `{ email, name }` from request-otp — every other axis (admin role, racing
 * role, org membership) is granted AFTER an account exists, by someone who
 * already has the right to grant it. The claim step in particular promised an
 * admin review queue that no longer exists and uploaded evidence files it then
 * discarded.
 *
 * Claiming a register entry now happens on the Dashboard, against the live
 * register. Creating an organisation happens from the org pages. Neither
 * belongs in front of a brand-new account that has nothing yet.
 */
type Step = 'details' | 'otp';

export default function Signup() {
  const [step, setStep] = useState<Step>('details');

  // Step 1 — email may be prefilled from the landing-page membership form.
  const [searchParams] = useSearchParams();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState(() => searchParams.get('email') ?? '');
  const [fieldErrors, setFieldErrors] = useState<{
    displayName?: string;
    email?: string;
  }>({});

  // Step 2
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [otpPreview, setOtpPreview] = useState<string | null>(null);
  const [otpError, setOtpError] = useState('');

  const [loading, setLoading] = useState(false);

  const requestSignupOtp = useAuthStore((s) => s.requestSignupOtp);
  const verifyOtp = useAuthStore((s) => s.verifyOtp);
  const navigate = useNavigate();

  const digitRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (step === 'otp') {
      setTimeout(() => digitRefs.current[0]?.focus(), 80);
    }
  }, [step]);

  const validate = () => {
    const errors: typeof fieldErrors = {};
    if (!displayName.trim()) errors.displayName = 'Please enter your name.';
    if (!email.trim()) errors.email = 'An email address is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errors.email = 'Please enter a valid email address.';
    return errors;
  };

  const handleDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      const first = Object.values(errors)[0];
      if (first) toast.error(first);
      return;
    }
    setFieldErrors({});
    setLoading(true);
    const result = await requestSignupOtp(email.trim(), displayName.trim());
    setLoading(false);
    if (result.ok) {
      setOtpPreview(result.devCode ?? null);
      if (result.devCode) setOtpDigits(result.devCode.slice(0, 6).split(''));
      setStep('otp');
      toast.success('Verification code sent. Check your inbox.');
    } else {
      toast.error(result.error ?? 'Something went wrong. Please try again.');
      setFieldErrors({ email: result.error });
    }
  };

  const handleOtpDigitChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...otpDigits];
    next[index] = digit;
    setOtpDigits(next);
    setOtpError('');
    if (digit && index < 5) {
      digitRefs.current[index + 1]?.focus();
    }
    if (digit && next.every((d) => d !== '') && index === 5) {
      submitOtp(next.join(''));
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      digitRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length > 0) {
      e.preventDefault();
      const next = [...otpDigits];
      for (let i = 0; i < 6; i++) {
        next[i] = pasted[i] ?? '';
      }
      setOtpDigits(next);
      digitRefs.current[Math.min(pasted.length, 5)]?.focus();
      if (pasted.length === 6) {
        submitOtp(pasted);
      }
    }
  };

  const submitOtp = async (code: string) => {
    setLoading(true);
    const result = await verifyOtp(email.trim(), code);
    setLoading(false);
    if (result.ok) {
      toast.success('Your account is ready. Welcome to Stable Press.');
      navigate('/dashboard');
    } else {
      toast.error(result.error ?? 'Verification failed. Please try again.');
      setOtpError(result.error ?? '');
      setOtpDigits(['', '', '', '', '', '']);
      setTimeout(() => digitRefs.current[0]?.focus(), 80);
    }
  };

  const handleOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = otpDigits.join('');
    if (code.length < 6) {
      const err = 'Please enter all 6 digits of your code.';
      setOtpError(err);
      toast.error(err);
      return;
    }
    submitOtp(code);
  };

  const handleResend = async () => {
    setOtpDigits(['', '', '', '', '', '']);
    setOtpError('');
    setLoading(true);
    const result = await requestSignupOtp(email.trim(), displayName.trim());
    setLoading(false);
    if (result.ok) {
      setOtpPreview(result.devCode ?? null);
      if (result.devCode) setOtpDigits(result.devCode.slice(0, 6).split(''));
      toast.success('A fresh code has been sent.');
      setTimeout(() => digitRefs.current[0]?.focus(), 80);
    } else {
      toast.error(result.error ?? 'Could not resend. Please try again.');
    }
  };

  const handleOtpBack = () => {
    setStep('details');
    setOtpDigits(['', '', '', '', '', '']);
    setOtpError('');
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left — brand panel */}
      <div
        className="hidden lg:flex lg:w-1/2 xl:w-5/12 flex-col justify-between p-12 bg-primary"
        aria-hidden="true"
      >
        <div>
          <div className="flex items-center gap-2 mb-16">
            <div className="h-px w-8 bg-[hsl(var(--brand-accent))]" />
            <span className="text-[10px] uppercase tracking-[0.2em] text-primary-foreground/50 font-semibold">
              Stable Press
            </span>
          </div>
          <h2 className="font-[family-name:var(--font-display)] text-4xl xl:text-5xl font-bold text-primary-foreground leading-[1.1] mb-6">
            Every race tells a story. Come read ours.
          </h2>
          <ul className="space-y-4 mt-8">
            {[
              'Longform race reports from our correspondents at every major track',
              'Comprehensive horse profiles with pedigree notes and trainer insight',
              'Expert tipping with a community leaderboard',
              'The Stable Press Podcast — conversations with the people who know the game',
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--brand-accent))] mt-1.5 flex-shrink-0" />
                <span className="text-sm text-primary-foreground/70 leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="border-t border-primary-foreground/10 pt-6">
            <p className="text-xs text-primary-foreground/40 italic font-[family-name:var(--font-display)]">
              &ldquo;The form is everything. The rest is conversation.&rdquo;
            </p>
          </div>
        </div>
      </div>

      {/* Right — form */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 py-12 bg-background">
        <div className="w-full max-w-sm">
          {/* Masthead (mobile) */}
          <div className="lg:hidden text-center mb-8">
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground">
              Stable Press
            </h1>
            <p className="text-xs text-muted-foreground uppercase tracking-[0.12em] mt-1">
              Racing Journal
            </p>
          </div>

          {/* Step 1: Details */}
          {step === 'details' && (
            <StepDetails
              displayName={displayName}
              setDisplayName={setDisplayName}
              email={email}
              setEmail={setEmail}
              fieldErrors={fieldErrors}
              setFieldErrors={setFieldErrors}
              loading={loading}
              onSubmit={handleDetailsSubmit}
            />
          )}

          {/* Step 2: OTP */}
          {step === 'otp' && (
            <StepOtp
              email={email}
              otpDigits={otpDigits}
              otpPreview={otpPreview}
              otpError={otpError}
              loading={loading}
              digitRefs={digitRefs}
              onBack={handleOtpBack}
              onDigitChange={handleOtpDigitChange}
              onKeyDown={handleOtpKeyDown}
              onPaste={handleOtpPaste}
              onSubmit={handleOtpSubmit}
              onResend={handleResend}
            />
          )}
        </div>
      </div>
    </div>
  );
}
