import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useClaimStore } from '@/stores/claimStore';
import { useOrgStore } from '@/stores/orgStore';
import { PARTY_ROLES, PARTY_ROLE_LABELS } from '@/types/party';
import type { PartyRole } from '@/types/party';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Mail, ArrowRight, RotateCcw, BookOpen, Star, Building2, Check, Upload, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Step = 'details' | 'otp' | 'claim' | 'org';
type AccountType = 'reader' | 'individual' | 'organisation';

export default function Signup() {
  const [step, setStep] = useState<Step>('details');

  // Step 1 state
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('reader');
  const [fieldErrors, setFieldErrors] = useState<{
    displayName?: string;
    email?: string;
  }>({});

  // Step 2 state
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [otpPreview, setOtpPreview] = useState<string | null>(null);
  const [otpError, setOtpError] = useState('');

  // Step 3 (claim) state — individuals claim one or more racing roles.
  const [selectedRoles, setSelectedRoles] = useState<PartyRole[]>([]);
  const [evidenceDataUrl, setEvidenceDataUrl] = useState<string | undefined>();
  const [evidenceName, setEvidenceName] = useState<string | null>(null);

  // Step 3 (org) state — organisations create an org and become its owner.
  const [orgName, setOrgName] = useState('');
  const [orgLocation, setOrgLocation] = useState('');

  const [loading, setLoading] = useState(false);

  const requestSignupOtp = useAuthStore((s) => s.requestSignupOtp);
  const verifyOtp = useAuthStore((s) => s.verifyOtp);
  const createClaim = useClaimStore((s) => s.createClaim);
  const createOrg = useOrgStore((s) => s.createOrg);
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
      // Every account is created as a reader. Individuals continue to claim their
      // racing role(s); organisations set up their org; readers are done.
      if (accountType === 'individual') {
        toast.success('Account created. Now claim your racing role.');
        setStep('claim');
      } else if (accountType === 'organisation') {
        toast.success('Account created. Now set up your organisation.');
        setStep('org');
      } else {
        toast.success('Your account is ready. Welcome to Stable Press.');
        navigate('/dashboard');
      }
    } else {
      toast.error(result.error ?? 'Verification failed. Please try again.');
      setOtpError(result.error ?? '');
      setOtpDigits(['', '', '', '', '', '']);
      setTimeout(() => digitRefs.current[0]?.focus(), 80);
    }
  };

  const toggleRole = (role: PartyRole) => {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  };

  const handleEvidenceFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      toast.error('Please choose a file under 4 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setEvidenceDataUrl(typeof reader.result === 'string' ? reader.result : undefined);
      setEvidenceName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleClaimSubmit = async () => {
    if (selectedRoles.length === 0) {
      toast.error('Select at least one role to claim.');
      return;
    }
    setLoading(true);
    const results = await Promise.all(
      selectedRoles.map((role) => createClaim(role, { evidenceUrl: evidenceDataUrl })),
    );
    setLoading(false);
    const failed = results.filter((r) => !r.ok);
    if (failed.length === 0) {
      toast.success('Claim submitted. An administrator will review and verify it shortly.');
    } else {
      toast.error(failed[0].error ?? 'Some claims could not be submitted.');
    }
    navigate('/');
  };

  const handleOrgSubmit = async () => {
    if (!orgName.trim()) {
      toast.error('Enter your organisation name.');
      return;
    }
    setLoading(true);
    const result = await createOrg({ name: orgName.trim(), base_location: orgLocation.trim() || undefined });
    setLoading(false);
    if (result.ok && result.id) {
      toast.success('Organisation created. You are its owner.');
      navigate(`/orgs/${result.id}`);
    } else {
      toast.error(result.error ?? 'Could not create the organisation.');
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

          {/* Step 3: Claim racing role(s) — individuals only */}
          {step === 'claim' && (
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
                        onClick={() => toggleRole(role)}
                        aria-pressed={selectedRoles.includes(role)}
                        className={cn(
                          'flex items-center justify-between gap-2 px-3 py-2 rounded-md border text-sm transition-colors',
                          selectedRoles.includes(role)
                            ? 'border-primary bg-primary/8 text-primary font-semibold'
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
                    <Upload size={15} className="flex-shrink-0" />
                    <span className="truncate">
                      {evidenceName ?? 'Attach a licence or document (image/PDF, ≤4 MB)'}
                    </span>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*,application/pdf"
                      onChange={handleEvidenceFile}
                    />
                  </label>
                </div>

                <Button
                  type="button"
                  onClick={handleClaimSubmit}
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
                  onClick={() => navigate('/')}
                  className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Skip for now — I&rsquo;ll do this later
                </button>
              </div>
            </>
          )}

          {/* Step 3: Create organisation — organisations only */}
          {step === 'org' && (
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
                  onClick={handleOrgSubmit}
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
          )}
        </div>
      </div>
    </div>
  );
}
