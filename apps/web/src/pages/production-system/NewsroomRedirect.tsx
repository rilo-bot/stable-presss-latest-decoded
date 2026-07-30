import { Navigate, useLocation } from 'react-router-dom';
import { PS_BASE } from '../newsroom/constants';

/**
 * `/newsroom/*` → `/production-system/*`.
 *
 * Not cosmetic: `WEB_PUBLIC_URL/newsroom` is baked into staff-invite emails
 * (server `staff.ts`) and `/newsroom/magazine[-v2]/:id` into magazine-share
 * emails (server `invites.ts`). Those messages are already sent, so the old
 * prefix has to keep resolving. Search and hash are preserved because share
 * links can carry both.
 *
 * TODO(2027-01): drop this once the outstanding invite links have expired.
 */
export default function NewsroomRedirect() {
  const { pathname, search, hash } = useLocation();
  const rest = pathname.replace(/^\/newsroom/, '');
  return <Navigate to={`${PS_BASE}${rest}${search}${hash}`} replace />;
}
