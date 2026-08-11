/**
 * RBAC — route guards.
 *
 * Each works both as a layout route (renders <Outlet/>) and as a wrapper
 * (renders children).
 */
import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import type { PermissionAction } from '@/lib/permissions';
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
 * The sign-in URL for wherever the visitor was actually trying to go, so an
 * emailed deep link survives the bounce through /login.
 */
function useLoginUrl(): string {
  const { pathname, search, hash } = useLocation();
  return loginUrlFor(pathname, search, hash);
}

/** Must be signed in. Anonymous → /login, remembering where. */
export function RequireAuth({ children }: GuardProps) {
  const user = useAuthStore((s) => s.currentUser);
  const loginUrl = useLoginUrl();
  if (!user) return <Navigate to={loginUrl} replace />;
  return render(children);
}

/** Must hold a specific permission. Anonymous → /login; otherwise → redirect. */
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
 * Must hold an admin role — the gate on all Campaign Engine tooling.
 *
 * This asked for a `newsroom.access` PERMISSION until the server removed it
 * from the catalogue. Nothing could satisfy it after that, not even a
 * superadmin, so the whole admin app was unreachable. Holding a role IS access;
 * the role decides only what is inside.
 */
export function RequireAdmin({ children, redirect = '/' }: GuardProps) {
  const user = useAuthStore((s) => s.currentUser);
  const loginUrl = useLoginUrl();
  if (!user) return <Navigate to={loginUrl} replace />;
  if (!user.isAdmin) return <Navigate to={redirect} replace />;
  return render(children);
}
