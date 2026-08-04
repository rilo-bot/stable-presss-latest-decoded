// ---------------------------------------------------------------------------
// /invite/:token — the page an invite email links to.
//
// ONE CLICK, IN THE EMAIL. Opening the link signs you in: the page redeems the
// token on mount, creating the account if it is new, applying the role, and
// landing you wherever the invite pointed. There is no second email, no code to
// type and no button to press — receiving the link is the proof of mailbox
// control, which is all the OTP ever established here.
//
// ALREADY SIGNED IN? The link does nothing and says so. Redeeming would have to
// either silently swap the session for a different account, or apply the invite
// to whoever happens to be logged in — both are worse than a plain message. A
// sign-out escape is offered because the alternative is a dead end when the
// invite is for a different address than the open session.
//
// THE COST OF AUTO-REDEEM, since it is a real trade-off and not an oversight:
// mail security products follow links in a headless browser to scan them, and a
// scanner that executes the page's JavaScript will consume the one-time token
// before the recipient clicks. They then see "invalid or expired" and need a
// resend. Chosen deliberately over a confirm button for the smoother path.
//
// Someone who ignores the link and signs up normally still lands in the right
// role — the pending-grant path in routes/auth.ts applies it at first sign-in.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, Loader2, LogOut } from 'lucide-react';
import { apiUrl } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
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

type Stage = 'working' | 'invalid' | 'signed-in';

export default function InviteAccept() {
  const { token = '' } = useParams();
  const navigate = useNavigate();

  const currentUser = useAuthStore((s) => s.currentUser);
  const acceptInvite = useAuthStore((s) => s.acceptInvite);
  const logout = useAuthStore((s) => s.logout);

  // Captured once, on the first render, so signing IN mid-flow doesn't flip the
  // page into its own "already signed in" branch the moment redemption succeeds.
  const wasSignedIn = useRef(!!currentUser);

  const [stage, setStage] = useState<Stage>(wasSignedIn.current ? 'signed-in' : 'working');
  const [invite, setInvite] = useState<Invite | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (wasSignedIn.current) return;
    let cancelled = false;

    (async () => {
      // Read the invite first, purely so the success toast and the "expired"
      // message can name the role and the inviter. A failure here is the same
      // failure as a bad token.
      let found: Invite | null = null;
      try {
        const res = await fetch(apiUrl(`/api/invites/${encodeURIComponent(token)}`));
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error ?? 'This invitation link is invalid or has expired.');
          setStage('invalid');
          return;
        }
        found = data.invite as Invite;
        setInvite(found);
      } catch {
        if (!cancelled) {
          setError('Could not reach the server. Please try again.');
          setStage('invalid');
        }
        return;
      }

      const result = await acceptInvite(token);
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error ?? 'This invitation could not be accepted.');
        setStage('invalid');
        return;
      }
      toast.success(`Welcome to Stable Press — you're set up as ${found?.role.label ?? 'staff'}.`);
      // The server sanitized this; re-validated because it drives a navigation.
      navigate(safeRedirect(result.redirectTo ?? found?.redirectTo, '/production-system'), {
        replace: true,
      });
    })();

    return () => {
      cancelled = true;
    };
    // `token` only — acceptInvite/navigate are stable, and re-running this would
    // spend a second token.
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Already signed in ──────────────────────────────────────────────────────
  if (stage === 'signed-in') {
    return (
      <Shell>
        <div className="mb-5 flex items-start gap-3">
          <AlertCircle size={20} className="mt-0.5 flex-shrink-0 text-destructive" />
          <div>
            <h1 className="mb-1.5 font-[family-name:var(--font-display)] text-2xl font-bold text-foreground">
              You're already signed in
            </h1>
            <p className="text-sm text-muted-foreground">
              This invitation link can't be used while you're signed in as{' '}
              <span className="font-medium text-foreground">{currentUser?.email}</span>.
            </p>
          </div>
        </div>
        <p className="mb-5 text-sm text-muted-foreground">
          If the invitation was meant for you, it has already been applied — check{' '}
          <Link to="/production-system" className="font-medium text-primary hover:underline">
            the Campaign Engine
          </Link>
          . If it was meant for someone else, forward them the email.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate('/production-system')} className="gap-2">
            Go to the Campaign Engine <ArrowRight size={15} />
          </Button>
          {/* Not a dead end: the invite may be for a different address than the
              session that happens to be open in this browser. */}
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              logout();
              window.location.reload();
            }}
          >
            <LogOut size={15} /> Sign out and use this link
          </Button>
        </div>
      </Shell>
    );
  }

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
            <p className="text-sm text-muted-foreground">{error}</p>
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

  // ── Working: reading the invite, then redeeming it ──────────────────────────
  const accent = invite?.role.color || 'hsl(var(--primary))';
  return (
    <Shell>
      <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        You've been invited
      </p>
      <h1 className="mb-4 font-[family-name:var(--font-display)] text-2xl font-bold text-foreground">
        Signing you in…
      </h1>

      {invite && (
        <div
          className="mb-5 flex items-start gap-3 rounded-sm border p-4"
          style={{ borderColor: `${accent}40`, background: `${accent}0a` }}
        >
          <span style={{ color: accent }} className="mt-0.5 flex-shrink-0">
            {roleIcon(invite.role.icon, 18)}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{invite.role.label}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {invite.invitedByName ? `${invite.invitedByName} invited ` : 'Invitation for '}
              <span className="font-medium text-foreground">{invite.email}</span>
            </p>
          </div>
        </div>
      )}

      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 size={15} className="animate-spin" /> Setting up your access…
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
