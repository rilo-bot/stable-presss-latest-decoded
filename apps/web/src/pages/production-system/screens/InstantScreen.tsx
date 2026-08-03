import { InstantWorkspace } from '@/pages/instant/InstantWorkspace';

/**
 * Instant — /production-system/instant.
 *
 * The screen is a thin mount, like BlogsScreen: the module itself lives in
 * `pages/instant/` so the capture flow isn't tangled into the production
 * system's shell.
 */
export default function InstantScreen() {
  return <InstantWorkspace />;
}
