/**
 * Magazine starter templates — the choices shown in the "New Magazine" gallery.
 *
 * A template is a named, ordered arrangement of the existing locked page
 * blueprints plus default title/edition text. Picking one assembles those pages
 * (see `createPagesFromTypes`) and drops the user into the same builder flow.
 *
 * PURE DATA (no React) so it can be imported by the store and the gallery alike.
 */

import type { PageTypeKey } from '@/types/magazine';
import { BLUEPRINTS } from './blueprints';

export interface MagazineTemplate {
  id: string;
  name: string;
  /** One-line pitch shown on the gallery card. */
  description: string;
  /** Seed magazine title. */
  title: string;
  /** Seed edition subtitle. */
  edition: string;
  /** Ordered page types assembled into the new document. */
  pageTypes: PageTypeKey[];
}

const FULL_BULLETIN_PAGES = BLUEPRINTS.map((b) => b.pageType);

// Only one template ships today (the full bulletin). More will be added later —
// just append another entry here (any ordered list of existing page types) and
// the gallery picks it up automatically.
export const MAGAZINE_TEMPLATES: MagazineTemplate[] = [
  {
    id: 'full-bulletin',
    name: 'Full NZTROF Bulletin',
    description: 'The complete multi-section edition — every page, ready to edit.',
    title: 'NZTROF Bulletin',
    edition: 'Advanced Bulletin · Prototype Issue',
    pageTypes: FULL_BULLETIN_PAGES,
  },
  {
    id: 'premium-bulletin',
    name: 'Premium Owner Experience',
    description: 'The polished, icon-rich house design — gold iconography, navy feature spreads and infographics. (Flagship pages live; more rolling out.)',
    title: 'NZTROF Bulletin',
    edition: 'Premium Owner Experience Edition',
    pageTypes: [
      'cover-px', 'president-px', 'editor-px', 'discussion-px', 'headline-px', 'young-owners-px',
      'women-in-racing-px', 'regional-north-px', 'regional-south-px', 'owners-lounge-px',
      'karaka-sales-px', 'celebration-wall-px', 'future-together-px', 'breeder-feature-px',
      'horse-welfare-px', 'business-owners-px', 'leaderboards-px', 'gamification-px',
      'predictions-px', 'predictions-followup-px', 'ownership-education-px', 'winning-moments-px',
      'owners-voice-px', 'back-cover-px',
    ],
  },
];

export const TEMPLATE_BY_ID: Record<string, MagazineTemplate> = Object.fromEntries(
  MAGAZINE_TEMPLATES.map((t) => [t.id, t]),
);
