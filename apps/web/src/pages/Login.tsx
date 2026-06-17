import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Mail, ArrowRight, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

type Step = 'email' | 'otp';

export default function Login() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [otpPreview, setOtpPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [otpError, setOtpError] = useState('');

  const requestLoginOtp = useAuthStore((s) => s.requestLoginOtp);
  const verifyOtp = useAuthStore((s) => s.verifyOtp);
  const navigate = useNavigate();

  const digitRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus first OTP input when step changes
  useEffect(() => {
    if (step === 'otp') {
      setTimeout(() => digitRefs.current[0]?.focus(), 80);
    }
  }, [step]);

  const validateEmail = () => {
    if (!email.trim()) return 'An email address is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email address.';
    return '';
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateEmail();
    if (err) {
      setEmailError(err);
      toast.error(err);
      return;
    }
    setEmailError('');
    setLoading(true);
    const result = await requestLoginOtp(email.trim());
    setLoading(false);
    if (result.ok) {
      setOtpPreview(result.devCode ?? null);
      if (result.devCode) setOtpDigits(result.devCode.slice(0, 6).split(''));
      setStep('otp');
      toast.success('Verification code sent. Check your inbox.');
    } else {
      toast.error(result.error ?? 'Something went wrong. Please try again.');
      setEmailError(result.error ?? '');
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
    // Auto-submit when all 6 filled
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
    const result = await requestLoginOtp(email.trim());
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
            The most important race is the one you understand.
          </h2>
          <p className="text-sm text-primary-foreground/60 leading-relaxed max-w-sm">
            Prestige racing journalism, horse profiles, expert tipping, and a community of turf
            correspondents who take the form seriously.
          </p>
        </div>
        <div className="border-t border-primary-foreground/10 pt-6">
          <p className="text-xs text-primary-foreground/40 italic font-[family-name:var(--font-display)]">
            "The form is everything. The rest is conversation."
          </p>
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

          {/* Step: Email */}
          {step === 'email' && (
            <>
              <div className="mb-8">
                <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground mb-1">
                  Welcome back
                </h2>
                <div className="h-px w-full bg-foreground/10 mt-3 mb-4" />
                <p className="text-sm text-muted-foreground">
                  Enter your email and we'll send you a one-time sign-in code.
                </p>
              </div>

              <form onSubmit={handleEmailSubmit} noValidate className="space-y-5">
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
                        if (emailError) setEmailError('');
                      }}
                      autoComplete="email"
                      placeholder="you@example.com"
                      className={cn(
                        'pl-9',
                        emailError ? 'border-destructive focus-visible:ring-destructive' : ''
                      )}
                      aria-describedby={emailError ? 'email-error' : undefined}
                    />
                  </div>
                  {emailError && (
                    <p id="email-error" className="text-xs text-destructive mt-1">
                      {emailError}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
                >
                  {loading ? 'Sending code…' : 'Send My Code'}
                  {!loading && <ArrowRight size={15} />}
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                Not yet a member?{' '}
                <Link
                  to="/signup"
                  className="text-foreground font-medium hover:text-primary transition-colors underline underline-offset-2"
                >
                  Create your account
                </Link>
              </p>
            </>
          )}

          {/* Step: OTP */}
          {step === 'otp' && (
            <>
              <div className="mb-8">
                <button
                  type="button"
                  onClick={() => {
                    setStep('email');
                    setOtpDigits(['', '', '', '', '', '']);
                    setOtpError('');
                  }}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                >
                  <ArrowRight size={12} className="rotate-180" />
                  Back
                </button>
                <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground mb-1">
                  Check your inbox
                </h2>
                <div className="h-px w-full bg-foreground/10 mt-3 mb-4" />
                <p className="text-sm text-muted-foreground">
                  We sent a 6-digit code to{' '}
                  <span className="font-medium text-foreground">{email}</span>. Enter it below to
                  sign in.
                </p>
                {otpPreview && (
                  <div className="mt-3 px-3 py-2 rounded bg-primary/8 border border-primary/20 flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-[0.12em] text-primary/70 font-semibold">
                      Dev preview
                    </span>
                    <span className="text-sm font-mono font-bold text-primary tracking-widest">
                      {otpPreview}
                    </span>
                  </div>
                )}
              </div>

              <form onSubmit={handleOtpSubmit} noValidate className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">
                    Verification Code
                  </Label>
                  <div
                    className="flex gap-2 justify-between"
                    onPaste={handleOtpPaste}
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
                        onChange={(e) => handleOtpDigitChange(i, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(i, e)}
                        aria-label={`Digit ${i + 1}`}
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
                    <p className="text-xs text-destructive mt-1">{otpError}</p>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={loading || otpDigits.some((d) => d === '')}
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {loading ? 'Verifying…' : 'Sign In'}
                </Button>
              </form>

              <button
                type="button"
                onClick={handleResend}
                disabled={loading}
                className="mt-5 w-full flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                <RotateCcw size={13} />
                Resend code
              </button>

              <p className="mt-4 text-center text-sm text-muted-foreground">
                Not yet a member?{' '}
                <Link
                  to="/signup"
                  className="text-foreground font-medium hover:text-primary transition-colors underline underline-offset-2"
                >
                  Create your account
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
