// ---------------------------------------------------------------------------
// /invite/:token — the page an invite email links to.
//
// ONE CLICK. The page reads the invite for context (who invited them, which
// role), then a single Continue button redeems it: the account is created if it
// is new, the role is applied, and they land in the Campaign Engine already
// signed in. There is no second email and no code to type — receiving the link
// IS the proof of mailbox control, which is all the OTP ever established here.
//
// Redemption is deliberately behind that button rather than firing on mount.
// Mail security products open links in a headless browser to scan them; they do
// not click buttons. Auto-redeeming would let a scanner burn the recipient's
// one-time token and leave them with a dead link.
//
// Someone who ignores the link and signs up normally still lands in the right
// role — the pending-grant path in routes/auth.ts applies it at first sign-in.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
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

type Stage = 'loading' | 'invalid' | 'intro';

export default function InviteAccept() {
  const { token = '' } = useParams();
  const navigate = useNavigate();

  const acceptInvite = useAuthStore((s) => s.acceptInvite);

  const [stage, setStage] = useState<Stage>('loading');
  const [invite, setInvite] = useState<Invite | null>(null);
  const [loadError, setLoadError] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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

  const accept = async () => {
    if (!invite || busy) return;
    if (!invite.hasAccount && !displayName.trim()) {
      setError('Please enter your name.');
      return;
    }
    setBusy(true);
    setError('');
    const result = await acceptInvite(token, invite.hasAccount ? undefined : displayName.trim());
    if (!result.ok) {
      setBusy(false);
      setError(result.error ?? 'Could not accept the invitation. Please try again.');
      return;
    }
    // Stay `busy` through the navigation — the button must not flick back to
    // "Continue" on a page that is already signed in and leaving.
    toast.success(`Welcome to Stable Press — you're set up as ${invite.role.label}.`);
    // The server sanitized this; re-validated here because it drives navigation.
    navigate(safeRedirect(result.redirectTo ?? invite.redirectTo, '/production-system'), {
      replace: true,
    });
  };

  // ── Invalid / expired / already used ───────────────────────────────────────
  if (stage === 'invalid') {
    return (
      <Shell>
        <div className="mb-6 flex items-start gap-3">
          <AlertCircle size={20} className="mt-0.5 flex-shrink-0 text-destructive" />
          <div>
            <h1 className="mb-1.5 font-[family-name:var(--font-display)] text-2xl font-bold text-foreground">
              This invitation isn't valid
            </h1>
            <p className="text-sm text-muted-foreground">{loadError}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Invitation links expire, and each one can only be used once. Ask whoever invited you to
          send a new one — or{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
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
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 size={15} className="animate-spin" /> Checking your invitation…
        </p>
      </Shell>
    );
  }

  const accent = invite.role.color || 'hsl(var(--primary))';

  return (
    <Shell>
      <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        You've been invited
      </p>
      <h1 className="mb-3 font-[family-name:var(--font-display)] text-3xl font-bold text-foreground">
        Join the Stable Press newsroom
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
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
        className="mb-6 flex items-start gap-3 rounded-sm border p-4"
        style={{ borderColor: `${accent}40`, background: `${accent}0a` }}
      >
        <span style={{ color: accent }} className="mt-0.5 flex-shrink-0">
          {roleIcon(invite.role.icon, 18)}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{invite.role.label}</p>
          {invite.role.description && (
            <p className="mt-0.5 text-sm text-muted-foreground">{invite.role.description}</p>
          )}
        </div>
      </div>

      {!invite.hasAccount && (
        <div className="mb-5 space-y-1.5">
          <Label
            htmlFor="invite-name"
            className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted-foreground"
          >
            Your name
          </Label>
          <Input
            id="invite-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void accept()}
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
        <p className="mb-4 flex items-start gap-2 text-sm text-destructive">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" /> {error}
        </p>
      )}

      <Button onClick={accept} disabled={busy} className="w-full gap-2">
        {busy ? <Loader2 size={15} className="animate-spin" /> : null}
        {busy ? 'Setting you up…' : invite.hasAccount ? `Continue as ${invite.email}` : 'Join the newsroom'}
        {!busy && <ArrowRight size={15} />}
      </Button>

      <p className="mt-3 text-center text-[12px] text-muted-foreground/70">
        No password needed — this link is your way in, and it works once.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md rounded-sm border border-border/60 bg-card p-7">{children}</div>
    </div>
  );
}
