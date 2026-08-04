/**
 * Where an Overview link actually goes.
 *
 * The old dashboard navigated by handing raw string tokens to `pathForModule`,
 * which returns `PS_BASE` for anything it doesn't recognise — and `PS_BASE`
 * redirects to the user's first module. So five links looked live and quietly
 * bounced you back to where you already were:
 *
 *   'drafts'              — a SIDE_NAV row commented out when the 12-status
 *                           workflow collapsed to 5 stages. Two of the server's
 *                           `needsAttention` items pointed here, plus the
 *                           'create-draft' quick action.
 *   'review'             — same, deleted with the separate editorial/legal/
 *                           compliance queues. One `needsAttention` item and the
 *                           'review-story' quick action pointed here.
 *   'bulletin-templates' — the v1 Magazine Studio, gone. The "Bulletins in
 *                           progress" item still pointed at it.
 *
 * Everything on the Overview now resolves through `resolveWhere`, which maps the
 * legacy tokens onto the screen that holds that work TODAY, and returns null when
 * the caller's role has no such module — an unreachable item is DROPPED rather
 * than rendered as a dead end.
 */
import { canOpenModule } from '@/lib/permissions';

import { SIDE_NAV, navPath } from '../../newsroom/constants';

/** Legacy token → the module id that owns that work now. */
const WHERE_ALIAS: Record<string, string> = {
  // Your own drafts and revisions live in the Draft column of the board.
  drafts: 'workflow',
  // The one review queue is the Editor Hub's.
  review: 'editor-hub',
  // v1 Magazine Studio → the Magazine Builder.
  'bulletin-templates': 'magazine-v2',
};

/**
 * Tokens that leave the production system entirely, so they resolve to an
 * absolute route rather than a module. Claim verification is a platform-admin
 * screen on the public app; the server only emits this item for admins.
 */
const EXTERNAL_ROUTES: Record<string, string> = {
  claims: '/claims',
};

/**
 * The route for a dashboard `where` token, or null if this user cannot get there.
 * Fails closed on the module axis, the same way the sidebar does.
 */
export function resolveWhere(where: string): string | null {
  const external = EXTERNAL_ROUTES[where];
  if (external) return external;

  const moduleId = WHERE_ALIAS[where] ?? where;
  const item = SIDE_NAV.find((i) => i.id === moduleId);
  if (!item) return null;
  if (!canOpenModule(moduleId)) return null;
  return navPath(item);
}
