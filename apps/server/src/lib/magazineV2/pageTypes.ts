// ---------------------------------------------------------------------------
// Magazine Builder v2 — the page-type registry (2026-11-12).
//
// A PAGE TYPE is what the reader would call the page: an interview, a timeline,
// a results table, a photo essay. There are ~25 of them, so issues stop being
// assembled from the same eight shapes.
//
// Every type maps onto one of the eight structural `PageTemplateKind`s
// (`baseKind`). All the existing kind-keyed machinery (template fallback, seeds,
// density floors, page furniture) keeps working off the base kind, while the
// planner, copywriter, art director and editor-in-chief read the richer type.
//
// Owners: the Creative Director/planner + copywriter read `purpose`/`copyGuide`;
// the Art Director reads `layoutGuide`; the Editor-in-Chief reads `density` and
// `position` for issue rhythm. Plans stored before this file have no pageType —
// `pageTypeFor(page)` falls back to the base kind's default type.
// ---------------------------------------------------------------------------

import type { PageTemplateKind } from './templates.js';

export type PageDensity = 'airy' | 'balanced' | 'dense';

export interface PageTypeDef {
  id: string;
  label: string;
  baseKind: PageTemplateKind;
  /** For the planner: what this page is for and when to choose it. */
  purpose: string;
  /** For the copywriter: what copy this page needs. */
  copyGuide: string;
  /** For the art director: how this type of page is usually designed. */
  layoutGuide: string;
  /** Issue rhythm: airy pages breathe, dense pages carry the reading. */
  density: PageDensity;
  /** Where it may sit: 'first'/'last' are fixed slots, 'front' = early in the issue. */
  position: 'first' | 'last' | 'front' | 'any';
}

export const PAGE_TYPES: PageTypeDef[] = [
  {
    id: 'cover', label: 'Cover', baseKind: 'cover', density: 'airy', position: 'first',
    purpose: 'The front cover: masthead, one dominant image, two to four cover lines.',
    copyGuide: 'Masthead title, a short issue line (date/edition), 2-4 punchy cover lines, each teasing a real story in this issue by its subject. No page numbers.',
    layoutGuide: 'Margin none, one bleed hero photo; the masthead dominant across the full width at the top (60-110pt, short); 2-4 cover lines in 6-8 grid columns on the calm side, ruled; text on the photo gets an automatic scrim.',
  },
  {
    id: 'contents', label: 'Contents', baseKind: 'contents', density: 'balanced', position: 'front',
    purpose: 'The table of contents listing the real pages in this issue.',
    copyGuide: 'One entry per real page after the contents (never the cover or back cover): its real page number, its title, a one-line teaser.',
    layoutGuide: 'Entries with large page numbers (accent figures or glyphs) on a 12-column grid, rules between; a photo band or column (bleed); title in 8 columns.',
  },
  {
    id: 'editors-letter', label: "Editor's letter", baseKind: 'two-column-article', density: 'balanced', position: 'front',
    purpose: 'A personal welcome from the editor setting up the issue theme.',
    copyGuide: 'Warm first-person letter, 150-260 words, naming what is inside this issue; sign off with a role (a name only if the brief gives one).',
    layoutGuide: 'One generous 8-column text column with a drop cap; a portrait (bleed) beside the title; the signature byline ruled above in the margin column, optionally a small ruled quote.',
  },
  {
    id: 'feature-opener', label: 'Feature opener', baseKind: 'feature-full-bleed', density: 'airy', position: 'any',
    purpose: 'The dramatic opening page of a major story.',
    copyGuide: 'A big headline, a standfirst of 1-2 sentences, a byline; little body copy.',
    layoutGuide: 'A bleed photo over most of the page; an oversized headline either placed on the photo or on a panel that overlaps the foot of the photo (overlap 150-250px); standfirst and byline beside it.',
  },
  {
    id: 'feature-article', label: 'Feature article', baseKind: 'two-column-article', density: 'dense', position: 'any',
    purpose: 'The main body of a story, with a photo and a pull quote.',
    copyGuide: 'Headline, standfirst, 300-500 words of body, one pull quote, photo caption.',
    layoutGuide: 'Title row on the 12-column grid (headline 8, deck 4); a photo spanning columns or bleeding across; two or three text columns with a drop cap on the first and an inline pull quote with rule both.',
  },
  {
    id: 'long-read', label: 'Long read', baseKind: 'two-column-article', density: 'dense', position: 'any',
    purpose: 'A text-led in-depth piece for readers who want detail.',
    copyGuide: 'Headline, standfirst, 450-650 words of body in short paragraphs, subheads.',
    layoutGuide: 'Three 4-column text columns under a ruled head, drop cap, a small spot photo with caption inside one column, subheads breaking the columns; few images, lots of reading.',
  },
  {
    id: 'profile', label: 'Profile', baseKind: 'two-column-article', density: 'balanced', position: 'any',
    purpose: 'A portrait of one person, horse, stable or business.',
    copyGuide: 'The subject as headline (its real name when the brief or source gives one), a one-line description, 250-400 words, 3-5 key facts.',
    layoutGuide: 'A large portrait (7 columns, bleeding) beside the story in 5 columns; a tinted fact sidebar (panel with pad: label + entries); or the portrait across the top with the name overlapping it.',
  },
  {
    id: 'interview-qa', label: 'Interview (Q&A)', baseKind: 'two-column-article', density: 'dense', position: 'any',
    purpose: 'A question-and-answer interview.',
    copyGuide: 'Headline, intro of 1-2 sentences, 4-6 questions with answers; the subject identified by name only when the brief or source names them, otherwise by role.',
    layoutGuide: 'A portrait beside or above the title; one standout quote on a tint panel or with rules; Q&A pairs in two 6-column columns, questions bold in the accent colour, answers in body type.',
  },
  {
    id: 'photo-essay', label: 'Photo essay', baseKind: 'feature-full-bleed', density: 'airy', position: 'any',
    purpose: 'A single striking photograph carrying the story with a short caption.',
    copyGuide: 'A short title and a 1-3 sentence caption; no body copy.',
    layoutGuide: 'Margin none, one bleed photo filling the page; title and caption small, placed in a corner (place w 6-7, h content) or set on a colour band at the foot.',
  },
  {
    id: 'mosaic-gallery', label: 'Mosaic gallery', baseKind: 'photo-grid', density: 'airy', position: 'any',
    purpose: 'Several photos of different sizes telling a visual story.',
    copyGuide: 'A title, a short intro, a caption per photo.',
    layoutGuide: 'An asymmetric mosaic on the 12-column grid with small gutters: one dominant photo (7 columns) and 3-5 smaller of varied shapes; captions in a ruled column or placed on the photos; playful issues may tilt and overlap prints slightly.',
  },
  {
    id: 'photo-grid', label: 'Photo grid', baseKind: 'photo-grid', density: 'balanced', position: 'any',
    purpose: 'An even grid of photos, e.g. a day at the races or a stable tour.',
    copyGuide: 'A title, a short intro, a caption per photo.',
    layoutGuide: 'A regular 2x2 or 3x2 grid on the 12-column grid with even gutters and a caption under each photo; or one lead photo with a strip of three beneath.',
  },
  {
    id: 'pull-quote', label: 'Quote page', baseKind: 'pull-quote', density: 'airy', position: 'any',
    purpose: 'One powerful quote given a page of its own.',
    copyGuide: 'One quote (12-35 words) and the speaker by role (a name only when the source quotes them).',
    layoutGuide: 'One huge display quote (28-40pt) hung on an oversized quote-mark glyph in the accent colour; attribution small with a rule; a bleed photo above it or behind it.',
  },
  {
    id: 'quote-wall', label: 'Quote wall', baseKind: 'pull-quote', density: 'balanced', position: 'any',
    purpose: 'Several short voices on one topic.',
    copyGuide: 'A title and 3-5 short quotes, each attributed by role (names only when the source gives them).',
    layoutGuide: 'Three or four quotes staggered at different sizes across 7+5 / 5+7 grid rows, alternating tint panels and photos; one with rule left.',
  },
  {
    id: 'stat-infographic', label: 'Numbers page', baseKind: 'stat-infographic', density: 'balanced', position: 'any',
    purpose: 'Key figures at a glance.',
    copyGuide: 'A title, 3-6 figures each with a short label, a one-line context note. Figures from the brief or source; never invent precise statistics.',
    layoutGuide: 'Large display numerals (44-60pt) on ruled tiles in a strong 3-column grid, labels beneath; a bleed photo band or a colour band holding the numbers.',
  },
  {
    id: 'data-spread', label: 'Data story', baseKind: 'stat-infographic', density: 'balanced', position: 'any',
    purpose: 'A trend or comparison told with simple bars and numbers.',
    copyGuide: 'A title, a 2-3 sentence explanation, 4-8 labelled values taken from the brief or source.',
    layoutGuide: 'Horizontal bars drawn as shape panels whose fr weights follow the values, the value placed at the end of each bar; labels in 3 columns; an explanation column beside a photo.',
  },
  {
    id: 'results-table', label: 'Results / rankings', baseKind: 'stat-infographic', density: 'dense', position: 'any',
    purpose: 'Race results, rankings, standings or a leaderboard.',
    copyGuide: 'A title, 5-10 rows of position, name and result from the brief or source (never invented results), a short note.',
    layoutGuide: 'Clean table rows alternating tint panels (opacity 0.08-0.14) and plain rows; position numbers as accent glyphs in 1 column, name and result in 11; a photo band above.',
  },
  {
    id: 'timeline', label: 'Timeline', baseKind: 'stat-infographic', density: 'balanced', position: 'any',
    purpose: 'A history or season told in dated steps.',
    copyGuide: 'A title, 4-7 dated milestones each with one sentence.',
    layoutGuide: 'Dated milestones in reading order: tinted cards with a rule above and a large year figure, or a thick vertical rule (shape thickness 4) beside the dates; a photo column or band.',
  },
  {
    id: 'calendar', label: 'Calendar / fixtures', baseKind: 'stat-infographic', density: 'balanced', position: 'any',
    purpose: 'Upcoming events, race days or fixtures.',
    copyGuide: 'A title, 4-8 dated events each with venue and a short note, from the brief or source where given.',
    layoutGuide: 'Accent date blocks (a figure on a shape panel, 2-3 columns) with the event and venue beside them, each row on a tint; a bleed photo band.',
  },
  {
    id: 'guide', label: 'Guide / map', baseKind: 'two-column-article', density: 'balanced', position: 'any',
    purpose: 'A guide to places, venues or a region.',
    copyGuide: 'A title, an intro, 4-6 numbered places each with a one-line description.',
    layoutGuide: 'A large photo (7 columns, bleeding) beside a numbered key: an accent numeral glyph beside each entry; intro above the key.',
  },
  {
    id: 'news-briefs', label: 'News in brief', baseKind: 'two-column-article', density: 'dense', position: 'any',
    purpose: 'Several short news items on one page.',
    copyGuide: 'A section title and 3-5 short items, each with its own headline and 40-80 words.',
    layoutGuide: 'Modular blocks of different sizes separated by rules: a lead item with a 7-column photo, then three 4-column briefs each ruled above.',
  },
  {
    id: 'sidebar-feature', label: 'Feature with sidebar', baseKind: 'two-column-article', density: 'dense', position: 'any',
    purpose: 'An article with a boxed panel of extra facts or tips.',
    copyGuide: 'Headline, 250-400 words of body, a sidebar with a title and 3-5 bullet facts.',
    layoutGuide: 'A photo band across the top (bleed); two text columns (drop cap) plus a 4-column tinted sidebar box with a label and 3-5 entries.',
  },
  {
    id: 'how-to', label: 'How-to / tips', baseKind: 'two-column-article', density: 'balanced', position: 'any',
    purpose: 'Practical numbered steps or tips.',
    copyGuide: 'A title, an intro, 4-7 numbered steps each with a short heading and one or two sentences.',
    layoutGuide: 'Big step numbers (accent numeral glyphs, 40-60pt) beside each step in a 2x2 grid or a column; intro beside a supporting photo.',
  },
  {
    id: 'spotlight', label: 'Spotlight / showcase', baseKind: 'photo-grid', density: 'balanced', position: 'any',
    purpose: 'Showcase of products, horses for sale, services or members.',
    copyGuide: 'A title and 3-4 items each with a name, one-line description and a key detail.',
    layoutGuide: 'A card grid of equal weight (2x2 or 3-up): each card a photo, a name/description entry and a key figure.',
  },
  {
    id: 'sponsor', label: 'Sponsor / advert', baseKind: 'feature-full-bleed', density: 'airy', position: 'any',
    purpose: 'A sponsor or partner page in an advertising style.',
    copyGuide: 'A brand line, one short message, a call to action and contact or web address.',
    layoutGuide: 'Margin none, a bleed image; a strong brand line placed at the top; a call-to-action panel placed across the foot with a QR and its label if a link is given.',
  },
  {
    id: 'back-cover', label: 'Back cover', baseKind: 'back-cover', density: 'airy', position: 'last',
    purpose: 'The closing back cover.',
    copyGuide: 'A sign-off line, contact details or web address, optionally a QR code.',
    layoutGuide: 'A calm bleed photo or colour field; the sign-off and contacts on a colour band low on the page, a QR with its label beside them.',
  },
];

const BY_ID = new Map(PAGE_TYPES.map((t) => [t.id, t]));

export function getPageType(id: string | undefined | null): PageTypeDef | undefined {
  return id ? BY_ID.get(id) : undefined;
}

/** The default type for a structural kind (the first registered with that base). */
export function defaultPageTypeForKind(kind: PageTemplateKind): PageTypeDef {
  // Prefer a general-purpose type: the first registered two-column type is the
  // editor's letter (position 'front'), which is the wrong default for an
  // ordinary article page that simply has no pageType (older plans, ad-hoc pages).
  return (
    PAGE_TYPES.find((t) => t.baseKind === kind && t.position === 'any') ??
    PAGE_TYPES.find((t) => t.baseKind === kind) ??
    PAGE_TYPES[0]
  );
}

/** A plan page's type: its own pageType when valid, else its kind's default. */
export function pageTypeFor(page: { kind: PageTemplateKind; pageType?: string }): PageTypeDef {
  const own = getPageType(page.pageType);
  return own && own.baseKind === page.kind ? own : own ?? defaultPageTypeForKind(page.kind);
}

/** Validate a model-supplied type id; unknown ids become undefined (caller falls back). */
export function normalizePageType(raw: unknown): string | undefined {
  return typeof raw === 'string' && BY_ID.has(raw.trim()) ? raw.trim() : undefined;
}

/** The menu the planner chooses from, one line per type. */
export function pageTypeMenu(): string {
  return PAGE_TYPES.map((t) => `- ${t.id} (${t.label}; ${t.density}): ${t.purpose}`).join('\n');
}
