/**
 * RBAC — route guards.
 *
 * Replace the binary ProtectedRoute with role/tier-aware gates. Each works both
 * as a layout route (renders <Outlet/>) and as a wrapper (renders children).
 */
import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import type { PermissionAction } from '@/lib/permissions';
import type { SubscriptionTier } from '@/rbac/entitlement';
import { tierAtLeast } from '@/rbac/entitlement';
import { loginUrlFor } from '@/lib/safeRedirect';

interface GuardProps {
  children?: ReactNode;
  /** Where to send a signed-in user who lacks the requirement. Default '/'. */
  redirect?: string;
}

function render(children?: ReactNode) {
  return children ? <>{children}</> : <Outlet />;
}

/**
 * The sign-in URL for wherever the visitor was actually trying to go.
 *
 * Without this, an emailed deep link (a shared magazine, say) bounced an
 * anonymous visitor to /login and then dropped them on the home page — the
 * destination was simply lost, and the link may as well not have pointed
 * anywhere in particular.
 */
function useLoginUrl(): string {
  const { pathname, search, hash } = useLocation();
  return loginUrlFor(pathname, search, hash);
}

/** Must be signed in (any role). Anonymous → /login, remembering where. */
export function RequireAuth({ children }: GuardProps) {
  const user = useAuthStore((s) => s.currentUser);
  const loginUrl = useLoginUrl();
  if (!user) return <Navigate to={loginUrl} replace />;
  return render(children);
}

/**
 * Must hold a specific permission. Anonymous → /login; otherwise → redirect.
 *
 * Replaces the old `RequireRole roles={[...]}`, which matched hardcoded slugs
 * and so could never be satisfied by a role a superadmin defined at runtime.
 */
export function RequirePermission({
  permission,
  children,
  redirect = '/',
}: GuardProps & { permission: PermissionAction }) {
  const user = useAuthStore((s) => s.currentUser);
  const allowed = useAuthStore(
    (s) => s.currentUser?.access?.permissions.includes(permission) ?? false,
  );
  const loginUrl = useLoginUrl();
  if (!user) return <Navigate to={loginUrl} replace />;
  if (!allowed) return <Navigate to={redirect} replace />;
  return render(children);
}

/**
 * Must be able to reach newsroom tooling — i.e. must be staff.
 *
 * Still spelled as the `newsroom.access` permission, but that is no longer a
 * checkbox anyone can grant or withhold: the server emits it for every account
 * holding a staff role and for nobody else (see `toClientUser`). Being on the team
 * IS Campaign Engine access; the role decides only what is inside. Kept as a
 * permission check so there is one way to ask, rather than the browser learning a
 * second test for the same fact.
 */
export function RequireStaff({ children, redirect = '/' }: GuardProps) {
  return (
    <RequirePermission permission="newsroom.access" redirect={redirect}>
      {children}
    </RequirePermission>
  );
}

/** Must meet a minimum subscription tier (entitlement gate for premium pages). */
export function RequireTier({
  tier,
  children,
  redirect = '/',
}: GuardProps & { tier: SubscriptionTier }) {
  const have = useAuthStore((s) => s.currentUser?.subscriptionTier);
  if (!tierAtLeast(have, tier)) return <Navigate to={redirect} replace />;
  return render(children);
}
