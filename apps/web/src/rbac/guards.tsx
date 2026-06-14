/**
 * RBAC — route guards.
 *
 * Replace the binary ProtectedRoute with role/tier-aware gates. Each works both
 * as a layout route (renders <Outlet/>) and as a wrapper (renders children).
 */
import type { ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import type { Role } from '@/rbac/roles';
import { isStaffRole } from '@/rbac/roles';
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

/** Must hold a staff/editorial role. Anonymous → /login; non-staff → redirect. */
export function RequireStaff({ children, redirect = '/' }: GuardProps) {
  const user = useAuthStore((s) => s.currentUser);
  if (!user) return <Navigate to="/login" replace />;
  if (!user.roles.some(isStaffRole)) return <Navigate to={redirect} replace />;
  return render(children);
}

/** Must hold at least one of the given global roles. */
export function RequireRole({
  roles,
  children,
  redirect = '/',
}: GuardProps & { roles: Role[] }) {
  const user = useAuthStore((s) => s.currentUser);
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.some((r) => user.roles.includes(r))) return <Navigate to={redirect} replace />;
  return render(children);
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
