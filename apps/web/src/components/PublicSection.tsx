/**
 * Route guard for a public section an admin has switched off in Settings →
 * Website Customisation.
 *
 * Hiding a tab from the navbar alone would be theatre: /blog stays in the router,
 * so every existing link, bookmark and search result still lands on a page the
 * site says it does not have. This takes the routes out too — a disabled section
 * redirects home.
 *
 * WHAT IT IS NOT. This is presentation, not access control. The API keeps serving
 * the same published content; switching News off does not unpublish a single
 * story, and anyone reading /api/articles directly still sees them. It is the
 * site's own table of contents, and it is reversible by flipping the switch back.
 *
 * WAITING. Until the settings request settles (`decided`), the page renders
 * normally rather than blanking or bouncing. A cold-starting API would otherwise
 * hold every reader on an empty screen, and the failure mode we want is "the site
 * shows too much for a second", never "the site shows nothing". A returning
 * reader is decided at first paint anyway — the store seeds from localStorage.
 */

import { Navigate } from 'react-router-dom';
import { useSiteSettingsStore } from '@/stores/siteSettingsStore';
import type { PublicNavKey } from '@/types/siteSettings';

interface PublicSectionProps {
  section: PublicNavKey;
  children: React.ReactNode;
}

export function PublicSection({ section, children }: PublicSectionProps) {
  const hidden = useSiteSettingsStore((s) => s.publicNav[section] === false);
  const decided = useSiteSettingsStore((s) => s.decided);

  if (decided && hidden) return <Navigate to="/" replace />;
  return <>{children}</>;
}
