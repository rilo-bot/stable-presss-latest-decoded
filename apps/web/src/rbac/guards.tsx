/**
 * RBAC — route guards.
 *
 * Replace the binary ProtectedRoute with role/tier-aware gates. Each works both
 * as a layout route (renders <Outlet/>) and as a wrapper (renders children).
 */
import type { ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import type { PermissionAction } from '@/lib/permissions';
import type { SubscriptionTier } from '@/rbac/entitlement';
import { tierAtLeast } from '@/rbac/entitlement';

interface GuardProps {
  children?: ReactNode;
  /** Where to send a signed-in user who lacks the requirement. Default '/'. */
  redirect?: string;
}

function render(children?: ReactNode) {
  return children ? <>{children}</> : <Outlet />;
}

/** Must be signed in (any role). Anonymous → /login. */
export function RequireAuth({ children }: GuardProps) {
  const user = useAuthStore((s) => s.currentUser);
  if (!user) return <Navigate to="/login" replace />;
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
  if (!user) return <Navigate to="/login" replace />;
  if (!allowed) return <Navigate to={redirect} replace />;
  return render(children);
}

/**
 * Must be able to reach newsroom tooling. Was "holds any staff role"; now the
 * `newsroom.access` permission, which a superadmin controls per role.
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
