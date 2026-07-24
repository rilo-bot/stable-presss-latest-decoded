// ---------------------------------------------------------------------------
// Magazine Builder v2 — editorial LAYOUT ARCHETYPES (inspiration, not templates).
//
// A curated library of proven premium-magazine page skeletons, distilled from
// real reference issues (e.g. the "Stamp Press" record) plus general editorial
// practice. Each entry is a STRUCTURAL RECIPE in prose — what regions, devices
// and hierarchy the page uses — NOT a copyable frame-tree. The art-director is
// shown a rotating, kind-tailored subset as INSPIRATION and must compose its own
// LayoutSpec: this gives rich, varied, modern pages WITHOUT the model copying a
// fixed example (which is exactly what made every page identical before).
//
// Every recipe uses only devices the engine can render: rows / cols / stacks of
// text (kicker, headline, subhead, byline, body, pullquote, figure, label,
// entry, caption), image, qr, icon, and shape used as a scrim OR a CARD/PANEL
// BACKGROUND WITH CONTENT STACKED ON IT (never a blank block).
//
// Pure data + string helpers — no DOM, no LLM, no I/O.
// ---------------------------------------------------------------------------

import type { PageTemplateKind } from './templates.js';

export interface LayoutArchetype {
  id: string;
  name: string;
  /** Page kinds this skeleton suits (the planner assigns kinds; we steer per kind). */
  kinds: PageTemplateKind[];
  /** A remixable structural recipe — regions + devices + hierarchy, never a tree. */
  recipe: string;
}

// The library. Names/roles map to the DSL leaf roles the copywriter fills.
export const LAYOUT_ARCHETYPES: LayoutArchetype[] = [
  {
    id: 'centered-masthead-cover',
    name: 'Centered masthead cover',
    kinds: ['cover'],
    recipe:
      'A centred column on a generous field: a small emblem/icon, a tracked KICKER (accent), a DOMINANT two-tone ' +
      'masthead headline (stack two short headline leaves, the second in accent) across nearly the full width, a ' +
      'one-line tagline (subhead), a centred hero image with a small caption under it, then a footer row of three ' +
      '"in this issue" items (each a bold figure page-number + a label) and a small qr+label in a corner.',
  },
  {
    id: 'full-bleed-cover',
    name: 'Full-bleed photographic cover',
    kinds: ['cover'],
    recipe:
      'A stack: full-page hero image, a bottom-anchored scrim, then a padded col — kicker (accent), a big short ' +
      'headline (bg colour), a tagline, and a footer row with a qr+label ("Scan to subscribe"). Bold, one focal image.',
  },
  {
    id: 'editors-letter',
    name: "Editor's letter with stat cards",
    kinds: ['two-column-article', 'feature-full-bleed'],
    recipe:
      'A dark section-header band at the top (a stack: shape in primary + a padded row holding a kicker and the ' +
      'issue/date). Below: a large headline on the left with a small author block (byline) aligned right. A hero ' +
      'image with a caption. A two-column body (two body leaves in a row). A bordered PULL-QUOTE with an attribution. ' +
      'A closing row of three STAT CARDS — each a stack (shape panel + col of icon, figure, label).',
  },
  {
    id: 'data-market-report',
    name: 'Data / market report',
    kinds: ['stat-infographic', 'two-column-article'],
    recipe:
      'A big title, then a narrow left column (a portrait image + caption) beside a dense body. A "price table" band ' +
      '— a col of rows, each row a label on the left and a figure on the right (alternate row tint with thin shape ' +
      'bars). A row of three small ICON CARDS (icon + label + caption). A closing row of three STAT figures + labels.',
  },
  {
    id: 'feature-well-sidebars',
    name: 'Feature well with sidebars',
    kinds: ['feature-full-bleed', 'two-column-article'],
    recipe:
      'Kicker, a big headline, a deck (subhead), a byline. A large hero image (full-bleed or a wide band). A ' +
      'two-column body beside ONE or TWO filled SIDEBAR BOXES (each a stack: shape panel + a padded col with a small ' +
      'heading label and body — e.g. "KEY FACTS", "FOR THE SPECIALIST"). A pull-quote to break the columns.',
  },
  {
    id: 'investigation-band',
    name: 'Serialized investigation',
    kinds: ['two-column-article', 'photo-grid'],
    recipe:
      'Kicker, title, a one-line subhead. A BAND of three images in a row, each with its own small caption below. A ' +
      'two-column body. Two footer CALLOUT BOXES side by side (each a stack: shape panel + col of a heading label + ' +
      'body), like "The Geography of…" and "How to spot…".',
  },
  {
    id: 'catalogue-lots',
    name: 'Catalogue / featured lots',
    kinds: ['photo-grid', 'two-column-article'],
    recipe:
      'A title, then three or four repeating LOT ROWS. Each row: a thumbnail image on the left, and a col holding a ' +
      'label (lot no.), a figure (the price/estimate, in accent), a bold sub-label (the item name) and a body ' +
      'description. Thin rules between rows. A qr+label in the footer.',
  },
  {
    id: 'gallery-grid',
    name: 'Gallery grid',
    kinds: ['photo-grid'],
    recipe:
      'A title + deck, then a 2–3 column GRID of items. Each cell is a col: an image, a short caption, and a figure ' +
      '(price) in accent. Even gaps, aligned baselines — a clean catalogue wall.',
  },
  {
    id: 'spec-sheet',
    name: 'Spec sheet / featured rarity',
    kinds: ['stat-infographic', 'feature-full-bleed'],
    recipe:
      'A title and deck. On the left a small GRID of labelled thumbnails (image + tiny label each). On the right a ' +
      'SPECIFICATION panel (a stack: shape panel + a col of label→figure rows). A qr+label. A supporting body block.',
  },
  {
    id: 'statement-pullquote',
    name: 'Statement / pull-quote spread',
    kinds: ['pull-quote'],
    recipe:
      'A stack: a full-bleed image, a scrim, then a centred col with an optional kicker, an OVERSIZED pull-quote ' +
      '(display), and an attribution byline. Lots of air; one line that lands hard.',
  },
  {
    id: 'cta-back-cover',
    name: 'CTA back cover',
    kinds: ['back-cover'],
    recipe:
      'A dark field (bg in primary/text). A centred emblem, a big title, a CTA subhead. A row of one or two qr codes ' +
      'each with a label. A row (or 2×2) of FEATURE CARDS — each a stack (shape panel + col of icon, a heading ' +
      'label, and body). A stat trio. A contact footer: a row of social icons over a caption line.',
  },
];

/** The archetypes suited to a page kind (falls back to the versatile feature well). */
export function archetypesForKind(kind: PageTemplateKind): LayoutArchetype[] {
  const hits = LAYOUT_ARCHETYPES.filter((a) => a.kinds.includes(kind));
  return hits.length ? hits : LAYOUT_ARCHETYPES.filter((a) => a.id === 'feature-well-sidebars');
}

/**
 * A per-page STEER: pick one suitable archetype, rotating by page position so
 * consecutive same-kind pages diverge (and the choice is deterministic, so a
 * resume/rerun is stable). Returned as a short instruction to drop into the
 * art-director's user prompt — inspiration to remix, never a spec to copy.
 */
export function archetypeSteer(kind: PageTemplateKind, pageNumber: number): string {
  const options = archetypesForKind(kind);
  const pick = options[Math.abs(pageNumber - 1) % options.length]!;
  return `Lean toward a "${pick.name}" treatment for this page, but ADAPT and remix it to the intent — ${pick.recipe} Make it visibly different from the other pages.`;
}

/** The whole library rendered as a prompt block (shown as inspiration, not specs). */
export function archetypeLibraryText(): string {
  return LAYOUT_ARCHETYPES.map((a) => `• ${a.name} — ${a.recipe}`).join('\n');
}
