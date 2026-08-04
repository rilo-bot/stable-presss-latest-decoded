/**
 * Website customisation — which of the six public sections the site shows.
 *
 * MIRRORS apps/server/src/lib/siteSettings.ts. There is no shared package in this
 * repo, so the key list exists on both sides, the same way MODULE_CATALOGUE
 * mirrors SIDE_NAV. Adding a seventh section means touching:
 *
 *   1. this file                                   (key + label + path)
 *   2. apps/server/src/lib/siteSettings.ts         (PUBLIC_NAV_KEYS)
 *   3. apps/web/src/components/navbar/config.tsx   (the NAV_SECTIONS entry's `key`)
 *   4. apps/web/src/App.tsx                        (wrap its routes in <PublicSection>)
 *
 * DEFAULT IS ON, everywhere and at every layer — an unwritten setting, a failed
 * request and an unknown key all mean visible. A toggle that has never been
 * touched must not be able to take a section off the public site.
 */

export const PUBLIC_NAV_KEYS = ['news', 'blog', 'horses', 'directory', 'podcast', 'bulletins'] as const;

export type PublicNavKey = (typeof PUBLIC_NAV_KEYS)[number];

export type PublicNavVisibility = Record<PublicNavKey, boolean>;

export const DEFAULT_PUBLIC_NAV: PublicNavVisibility = {
  news: true,
  blog: true,
  horses: true,
  directory: true,
  podcast: true,
  bulletins: true,
};

/**
 * What each switch governs, for the Settings screen. `paths` is every public
 * route that disappears with the section — spelled out because "hide Horses"
 * also takes down every individual horse dossier, and an admin should read that
 * on the switch rather than discover it from a reader.
 */
export interface PublicNavSectionMeta {
  key: PublicNavKey;
  label: string;
  /** The nav tab's own destination. */
  path: string;
  paths: string[];
  description: string;
}

export const PUBLIC_NAV_SECTIONS: PublicNavSectionMeta[] = [
  {
    key: 'news',
    label: 'News',
    path: '/news',
    paths: ['/news', '/articles/:id'],
    description: 'The news index and every published story, including the six category cuts in its dropdown.',
  },
  {
    key: 'blog',
    label: 'Blog',
    path: '/blog',
    paths: ['/blog', '/blog/:slug'],
    description: 'The blog index and every published post.',
  },
  {
    key: 'horses',
    label: 'Horses',
    path: '/horses',
    paths: ['/horses', '/horses/:id'],
    description: 'The horse register and every individual horse dossier.',
  },
  {
    key: 'directory',
    label: 'Directory',
    path: '/parties',
    paths: ['/parties', '/parties/:id'],
    description: 'The people directory — owners, trainers, jockeys — and their profile pages.',
  },
  {
    key: 'podcast',
    label: 'Podcast',
    path: '/podcast',
    paths: ['/podcast'],
    description: 'The podcast hub and its published episodes.',
  },
  {
    key: 'bulletins',
    label: 'Bulletins',
    path: '/bulletins',
    paths: ['/bulletins', '/bulletins/:id'],
    description: 'The bulletin newsstand and every published edition.',
  },
];

/** Coerce any payload into a complete map; unknown keys dropped, gaps default on. */
export function normalisePublicNav(raw: unknown): PublicNavVisibility {
  const source = (raw ?? {}) as Record<string, unknown>;
  const out = { ...DEFAULT_PUBLIC_NAV };
  for (const key of PUBLIC_NAV_KEYS) {
    if (source[key] === false) out[key] = false;
  }
  return out;
}
