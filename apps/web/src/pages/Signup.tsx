import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import type { UserRole } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Mail, ArrowRight, RotateCcw, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type Step = 'details' | 'otp';

const ROLE_OPTIONS: { value: UserRole; label: string; description: string }[] = [
  {
    value: 'contributor',
    label: 'Contributor',
    description: 'Write and submit stories for editorial review',
  },
  {
    value: 'editor',
    label: 'Editor',
    description: 'Review, revise, and approve editorial content',
  },
  {
    value: 'legal_reviewer',
    label: 'Legal Reviewer',
    description: 'Assess content for legal compliance before publishing',
  },
  {
    value: 'podcast_producer',
    label: 'Podcast Producer',
    description: 'Manage and produce The Gallop Podcast episodes',
  },
  {
    value: 'publisher',
    label: 'Publisher',
    description: 'Schedule and publish content across all channels',
  },
  {
    value: 'administrator',
    label: 'Administrator',
    description: 'Full platform access and team management',
  },
];

export default function Signup() {
  const [step, setStep] = useState<Step>('details');

  // Step 1 state
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole | ''>('');
  const [roleOpen, setRoleOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    displayName?: string;
    email?: string;
    role?: string;
  }>({});

  // Step 2 state
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [otpPreview, setOtpPreview] = useState<string | null>(null);
  const [otpError, setOtpError] = useState('');

  const [loading, setLoading] = useState(false);

  const requestSignupOtp = useAuthStore((s) => s.requestSignupOtp);
  const verifyOtp = useAuthStore((s) => s.verifyOtp);
  const navigate = useNavigate();

  const digitRefs = useRef<(HTMLInputElement | null)[]>([]);

  const selectedRole = ROLE_OPTIONS.find((r) => r.value === role) ?? null;

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
    if (!role) errors.role = 'Please select your role in the newsroom.';
    return errors;
  };

  const handleDetailsSubmit = (e: React.FormEvent) => {
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
    setTimeout(() => {
      const result = requestSignupOtp(email.trim(), displayName.trim(), role as UserRole);
      setLoading(false);
      if (result.ok) {
        setOtpPreview(result.otpPreview ?? null);
        setStep('otp');
        toast.success('Verification code sent. Check your inbox.');
      } else {
        toast.error(result.error ?? 'Something went wrong. Please try again.');
        setFieldErrors({ email: result.error });
      }
    }, 400);
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

  const submitOtp = (code: string) => {
    setLoading(true);
    setTimeout(() => {
      const result = verifyOtp(email.trim(), code);
      setLoading(false);
      if (result.ok) {
        toast.success('Your account is ready. Welcome to Stable Press.');
        navigate('/newsroom');
      } else {
        toast.error(result.error ?? 'Verification failed. Please try again.');
        setOtpError(result.error ?? '');
        setOtpDigits(['', '', '', '', '', '']);
        setTimeout(() => digitRefs.current[0]?.focus(), 80);
      }
    }, 400);
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

  const handleResend = () => {
    setOtpDigits(['', '', '', '', '', '']);
    setOtpError('');
    setLoading(true);
    setTimeout(() => {
      const result = requestSignupOtp(email.trim(), displayName.trim(), role as UserRole);
      setLoading(false);
      if (result.ok) {
        setOtpPreview(result.otpPreview ?? null);
        toast.success('A fresh code has been sent.');
        setTimeout(() => digitRefs.current[0]?.focus(), 80);
      } else {
        toast.error(result.error ?? 'Could not resend. Please try again.');
      }
    }, 400);
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
              'The Gallop Podcast — conversations with the people who know the game',
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--brand-accent))] mt-1.5 flex-shrink-0" />
                <span className="text-sm text-primary-foreground/70 leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="mb-6 border border-primary-foreground/10 rounded-sm p-4">
            <p className="text-[9px] uppercase tracking-[0.18em] text-primary-foreground/40 font-semibold mb-3">
              Newsroom Roles
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {ROLE_OPTIONS.map((r) => (
                <div key={r.value} className="flex items-center gap-1.5">
                  <div className="w-1 h-1 rounded-full bg-[hsl(var(--brand-accent)/0.6)]" />
                  <span className="text-[10px] text-primary-foreground/60">{r.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-primary-foreground/10 pt-6">
            <p className="text-xs text-primary-foreground/40 italic font-[family-name:var(--font-display)]">
              "The form is everything. The rest is conversation."
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
            <>
              <div className="mb-8">
                <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground mb-1">
                  Join the journal
                </h2>
                <div className="h-px w-full bg-foreground/10 mt-3 mb-4" />
                <p className="text-sm text-muted-foreground">
                  Tell us who you are and we'll send a verification code to confirm your email.
                </p>
              </div>

              <form onSubmit={handleDetailsSubmit} noValidate className="space-y-5">
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

                {/* Role */}
                <div className="space-y-1.5">
                  <Label
                    htmlFor="role-btn"
                    className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-semibold"
                  >
                    Newsroom Role
                  </Label>
                  <div className="relative">
                    <button
                      id="role-btn"
                      type="button"
                      onClick={() => setRoleOpen((v) => !v)}
                      className={cn(
                        'w-full flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-md border bg-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        fieldErrors.role
                          ? 'border-destructive focus-visible:ring-destructive'
                          : 'border-input hover:border-primary/50',
                        !selectedRole && 'text-muted-foreground'
                      )}
                      aria-haspopup="listbox"
                      aria-expanded={roleOpen}
                      aria-describedby={fieldErrors.role ? 'role-error' : undefined}
                    >
                      <span
                        className={selectedRole ? 'text-foreground' : 'text-muted-foreground'}
                      >
                        {selectedRole ? selectedRole.label : 'Select your role…'}
                      </span>
                      <ChevronDown
                        size={14}
                        className={cn(
                          'text-muted-foreground transition-transform flex-shrink-0',
                          roleOpen && 'rotate-180'
                        )}
                      />
                    </button>

                    {roleOpen && (
                      <div
                        className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg z-20 overflow-hidden"
                        role="listbox"
                        aria-label="Newsroom role"
                      >
                        {ROLE_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            role="option"
                            aria-selected={role === option.value}
                            onClick={() => {
                              setRole(option.value);
                              setRoleOpen(false);
                              if (fieldErrors.role)
                                setFieldErrors((p) => ({ ...p, role: undefined }));
                            }}
                            className={cn(
                              'w-full flex flex-col items-start px-3 py-2.5 text-left hover:bg-muted/60 transition-colors border-b border-border/30 last:border-b-0 focus-visible:outline-none focus-visible:bg-muted/60',
                              role === option.value && 'bg-primary/8'
                            )}
                          >
                            <span
                              className={cn(
                                'text-sm font-semibold',
                                role === option.value ? 'text-primary' : 'text-foreground'
                              )}
                            >
                              {option.label}
                            </span>
                            <span className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                              {option.description}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {fieldErrors.role && (
                    <p id="role-error" className="text-xs text-destructive mt-1">
                      {fieldErrors.role}
                    </p>
                  )}
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
          )}

          {/* Step 2: OTP */}
          {step === 'otp' && (
            <>
              <div className="mb-8">
                <button
                  type="button"
                  onClick={() => {
                    setStep('details');
                    setOtpDigits(['', '', '', '', '', '']);
                    setOtpError('');
                  }}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                >
                  <ArrowRight size={12} className="rotate-180" />
                  Back
                </button>
                <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground mb-1">
                  Confirm your email
                </h2>
                <div className="h-px w-full bg-foreground/10 mt-3 mb-4" />
                <p className="text-sm text-muted-foreground">
                  We sent a 6-digit code to{' '}
                  <span className="font-medium text-foreground">{email}</span>. Enter it below to
                  complete your account setup.
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
                  {loading ? 'Creating your account…' : 'Verify & Create Account'}
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
                Already a member?{' '}
                <Link
                  to="/login"
                  className="text-foreground font-medium hover:text-primary transition-colors underline underline-offset-2"
                >
                  Sign in here
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
