/**
 * Website customisation — the six public-section switches.
 *
 * THREE THINGS MAKE THIS FAIL OPEN, and they are the whole design:
 *
 *   1. Defaults are all-on, so an unwritten setting shows everything.
 *   2. A failed request marks itself decided with whatever we already had —
 *      never with "everything is hidden". An API blip must not black out the
 *      public site.
 *   3. `decided` gates the ROUTE guard, not the nav. Until we have an answer,
 *      pages render normally rather than blanking, because a slow cold start
 *      would otherwise show every reader an empty screen.
 *
 * The last-known map is cached in localStorage and seeded synchronously on
 * import. That is what stops a returning reader seeing a hidden tab flash into
 * existence and back out while the fetch lands — on a repeat visit the answer is
 * already there at first paint.
 */

import { create } from 'zustand';
import { toast } from 'sonner';
import { authFetch } from '@/lib/api';
import {
  DEFAULT_PUBLIC_NAV,
  normalisePublicNav,
  type PublicNavKey,
  type PublicNavVisibility,
} from '@/types/siteSettings';

const CACHE_KEY = 'sp.publicNav';

/** Last known map, read at import. Never throws — a bad cache is just no cache. */
function readCache(): PublicNavVisibility | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return normalisePublicNav(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeCache(nav: PublicNavVisibility): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(nav));
  } catch {
    // Private mode / quota. The store still works; only the no-flash trick is lost.
  }
}

const cached = readCache();

interface SiteSettingsState {
  publicNav: PublicNavVisibility;
  /** Do we have an answer worth acting on — cache seeded, or the fetch settled? */
  decided: boolean;
  loading: boolean;
  saving: boolean;
  fetchSiteSettings: () => Promise<void>;
  /** Write the whole map. Optimistic, rolls back on failure. */
  savePublicNav: (next: PublicNavVisibility) => Promise<boolean>;
}

export const useSiteSettingsStore = create<SiteSettingsState>()((set, get) => ({
  publicNav: cached ?? DEFAULT_PUBLIC_NAV,
  decided: cached !== null,
  loading: false,
  saving: false,

  // Always refetches (there is no `loaded` short-circuit): a cache-seeded store
  // is already `decided`, and the point of the call is to correct it against the
  // server. Re-entry is the only thing guarded.
  fetchSiteSettings: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const res = await authFetch('/api/site-settings');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { publicNav?: unknown };
      const publicNav = normalisePublicNav(body.publicNav);
      writeCache(publicNav);
      set({ publicNav, decided: true, loading: false });
    } catch {
      // Fail OPEN: keep whatever we have (cache, or all-on defaults) and call it
      // decided. No toast — this runs on the public site for signed-out readers,
      // who cannot act on it and should not be told the CMS is unreachable.
      set({ decided: true, loading: false });
    }
  },

  savePublicNav: async (next) => {
    const previous = get().publicNav;
    set({ publicNav: next, saving: true });
    try {
      const res = await authFetch('/api/site-settings/public-nav', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicNav: next }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { publicNav?: unknown };
      const publicNav = normalisePublicNav(body.publicNav);
      writeCache(publicNav);
      set({ publicNav, decided: true, saving: false });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save website settings';
      set({ publicNav: previous, saving: false });
      toast.error(message);
      return false;
    }
  },
}));

/** Reactive: is this public section switched on? Defaults to yes. */
export function usePublicSectionVisible(key: PublicNavKey): boolean {
  return useSiteSettingsStore((s) => s.publicNav[key] !== false);
}
