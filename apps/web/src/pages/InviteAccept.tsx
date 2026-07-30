// ---------------------------------------------------------------------------
// /invite/:token — the page an invite email links to.
//
// The token is NOT a way in. It carries context (which email, which role) so
// this page can greet someone properly and pre-fill their address; the actual
// sign-in is the normal OTP flow, which requires control of the mailbox. So a
// forwarded link shows the reader a nice page and nothing more.
//
// The role itself is applied server-side by the pending-grant path at first
// sign-in — there is no "accept" call. That means someone who ignores the link
// and signs up normally still lands in the right role.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, Loader2, MailCheck } from 'lucide-react';
import { apiUrl } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { roleIcon } from '@/lib/roleDisplay';
import { safeRedirect } from '@/lib/safeRedirect';
import { toast } from 'sonner';

interface InviteRole {
  slug: string;
  label: string;
  description?: string;
  color?: string;
  icon?: string;
}

interface Invite {
  email: string;
  hasAccount: boolean;
  expiresAt?: string;
  invitedByName?: string;
  /** Optional deep link — e.g. the magazine they were invited to work on. */
  redirectTo?: string;
  role: InviteRole;
}

type Stage = 'loading' | 'invalid' | 'intro' | 'otp';

export default function InviteAccept() {
  const { token = '' } = useParams();
  const navigate = useNavigate();

  const requestLoginOtp = useAuthStore((s) => s.requestLoginOtp);
  const requestSignupOtp = useAuthStore((s) => s.requestSignupOtp);
  const verifyOtp = useAuthStore((s) => s.verifyOtp);

  const [stage, setStage] = useState<Stage>('loading');
  const [invite, setInvite] = useState<Invite | null>(null);
  const [loadError, setLoadError] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [devCode, setDevCode] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(apiUrl(`/api/invites/${encodeURIComponent(token)}`));
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(data?.error ?? 'This invitation link is invalid or has expired.');
          setStage('invalid');
          return;
        }
        setInvite(data.invite);
        setStage('intro');
      } catch {
        if (!cancelled) {
          setLoadError('Could not reach the server. Please try again.');
          setStage('invalid');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const sendCode = async () => {
    if (!invite) return;
    if (!invite.hasAccount && !displayName.trim()) {
      setError('Please enter your name.');
      return;
    }
    setBusy(true);
    setError('');
    const result = invite.hasAccount
      ? await requestLoginOtp(invite.email)
      : await requestSignupOtp(invite.email, displayName.trim());
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'Could not send a code. Please try again.');
      return;
    }
    setDevCode(result.devCode);
    setStage('otp');
  };

  const submitCode = async () => {
    if (!invite) return;
    setBusy(true);
    setError('');
    const result = await verifyOtp(invite.email, code);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'Verification failed. Please try again.');
      return;
    }
    toast.success(`Welcome to Stable Press — you're set up as ${invite.role.label}.`);
    // Land them wherever the invite pointed (a shared magazine, say) rather
    // than the newsroom home. Re-validated client-side even though the server
    // already sanitized it — this drives a navigation.
    navigate(safeRedirect(invite.redirectTo, '/production-system'), { replace: true });
  };

  // ── Invalid / expired ──────────────────────────────────────────────────────
  if (stage === 'invalid') {
    return (
      <Shell>
        <div className="flex items-start gap-3 mb-6">
          <AlertCircle size={20} className="text-destructive flex-shrink-0 mt-0.5" />
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground mb-1.5">
              This invitation isn't valid
            </h1>
            <p className="text-sm text-muted-foreground">{loadError}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Invitation links expire, and each one can only be used once. Ask whoever invited you to
          send a new one — or{' '}
          <Link to="/login" className="text-primary font-medium hover:underline">
            sign in
          </Link>{' '}
          if you already have an account.
        </p>
      </Shell>
    );
  }

  if (stage === 'loading' || !invite) {
    return (
      <Shell>
        <p className="flex items-center gap-2 text-sm text-muted-foreground py-6">
          <Loader2 size={15} className="animate-spin" /> Checking your invitation…
        </p>
      </Shell>
    );
  }

  const accent = invite.role.color || 'hsl(var(--primary))';

  // ── OTP step ───────────────────────────────────────────────────────────────
  if (stage === 'otp') {
    return (
      <Shell>
        <button
          type="button"
          onClick={() => { setStage('intro'); setCode(''); setError(''); }}
          className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors mb-5"
        >
          <ArrowRight size={12} className="rotate-180" /> Back
        </button>

        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground mb-2">
          Check your email
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          We sent a 6-digit code to <span className="font-medium text-foreground">{invite.email}</span>.
          Enter it to finish joining as {invite.role.label}.
        </p>

        {devCode && (
          <p className="text-[12px] text-muted-foreground bg-muted/40 border border-border/60 rounded-sm px-3 py-2 mb-4">
            Dev preview — your code is <span className="font-mono font-bold">{devCode}</span>
          </p>
        )}

        <div className="space-y-1.5 mb-5">
          <Label htmlFor="invite-code" className="text-[12px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">
            Verification code
          </Label>
          <Input
            id="invite-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={(e) => e.key === 'Enter' && code.length === 6 && void submitCode()}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            className="text-center text-2xl font-mono tracking-[0.4em]"
            autoFocus
          />
        </div>

        {error && (
          <p className="flex items-start gap-2 text-sm text-destructive mb-4">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> {error}
          </p>
        )}

        <Button onClick={submitCode} disabled={busy || code.length !== 6} className="w-full gap-2">
          {busy ? <Loader2 size={15} className="animate-spin" /> : null}
          {busy ? 'Verifying…' : 'Join the newsroom'}
        </Button>

        <button
          type="button"
          onClick={sendCode}
          disabled={busy}
          className="w-full text-[12px] text-muted-foreground hover:text-foreground transition-colors mt-3"
        >
          Didn't get it? Send another code
        </button>
      </Shell>
    );
  }

  // ── Intro ──────────────────────────────────────────────────────────────────
  return (
    <Shell>
      <p className="text-[12px] uppercase tracking-[0.14em] font-bold text-muted-foreground mb-2">
        You've been invited
      </p>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-foreground mb-3">
        Join the Stable Press newsroom
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        {invite.invitedByName ? (
          <>
            <span className="font-medium text-foreground">{invite.invitedByName}</span> invited{' '}
          </>
        ) : (
          'This invitation is for '
        )}
        <span className="font-medium text-foreground">{invite.email}</span>.
      </p>

      {/* The role they're getting */}
      <div
        className="flex items-start gap-3 p-4 rounded-sm border mb-6"
        style={{ borderColor: `${accent}40`, background: `${accent}0a` }}
      >
        <span style={{ color: accent }} className="flex-shrink-0 mt-0.5">
          {roleIcon(invite.role.icon, 18)}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{invite.role.label}</p>
          {invite.role.description && (
            <p className="text-sm text-muted-foreground mt-0.5">{invite.role.description}</p>
          )}
        </div>
      </div>

      {!invite.hasAccount && (
        <div className="space-y-1.5 mb-5">
          <Label htmlFor="invite-name" className="text-[12px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">
            Your name
          </Label>
          <Input
            id="invite-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void sendCode()}
            placeholder="Jane Fitzgerald"
            maxLength={80}
            autoFocus
          />
          <p className="text-[12px] text-muted-foreground/70">
            This is the byline shown on anything you publish.
          </p>
        </div>
      )}

      {error && (
        <p className="flex items-start gap-2 text-sm text-destructive mb-4">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> {error}
        </p>
      )}

      <Button onClick={sendCode} disabled={busy} className="w-full gap-2">
        {busy ? <Loader2 size={15} className="animate-spin" /> : <MailCheck size={15} />}
        {busy ? 'Sending…' : 'Accept invitation'}
        {!busy && <ArrowRight size={15} />}
      </Button>

      <p className="text-[12px] text-muted-foreground/70 mt-3 text-center">
        We'll email a one-time code to {invite.email} to confirm it's you.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-background">
      <div className="w-full max-w-md border border-border/60 rounded-sm bg-card p-7">{children}</div>
    </div>
  );
}
