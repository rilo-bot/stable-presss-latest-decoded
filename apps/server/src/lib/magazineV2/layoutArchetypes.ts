// ---------------------------------------------------------------------------
// Magazine Builder v2 — editorial LAYOUT ARCHETYPES (inspiration, not templates).
//
// A curated library of proven magazine page skeletons, one shelf per PAGE TYPE
// (pageTypes.ts), written in the art-director's device vocabulary (layoutSpec.ts:
// grid spans, bleed, overlap, place, panels, rules, drop caps, numerals). Each entry
// is a STRUCTURAL RECIPE in prose — never a frame-tree — so the model composes its own
// tree instead of copying one.
//
// VARIETY IS DECIDED HERE, NOT LEFT TO CHANCE. "All magazines look like the same
// template" had a mechanical cause: every page of a kind was steered to the same
// archetype list in the same order, and Claude given the same prompt converges. So the
// steer for a page is computed from the issue and the page's place in it:
//   • an ISSUE SEED (a hash of the issue's title and concept) decides which recipe of
//     the type's shelf an issue starts on — two issues do not open the same way;
//   • the OCCURRENCE of the type within the issue rotates the shelf — the second
//     feature article in an issue is steered to a different recipe from the first;
//   • the style FAMILY (the Creative Director's concept) adds a sentence on how this
//     issue's pages behave — margins, density, which devices it leans on.
//
// Pure data + string helpers — no DOM, no LLM, no I/O.
// ---------------------------------------------------------------------------

import type { PageTemplateKind } from './templates.js';
import { PAGE_TYPES, pageTypeFor } from './pageTypes.js';

export interface LayoutArchetype {
  id: string;
  name: string;
  /** Page type ids this skeleton suits (pageTypes.ts). */
  types: string[];
  /** Structural kinds, for callers that only know a kind. */
  kinds: PageTemplateKind[];
  /** A remixable structural recipe — regions + devices + hierarchy, never a tree. */
  recipe: string;
}

const A = (id: string, name: string, types: string[], kinds: PageTemplateKind[], recipe: string): LayoutArchetype => ({ id, name, types, kinds, recipe });

export const LAYOUT_ARCHETYPES: LayoutArchetype[] = [
  // ── Covers ──
  A('bleed-masthead-cover', 'Bleed masthead cover', ['cover'], ['cover'],
    'Margin none; a stack: bleed hero photo, masthead 72–110pt caps tracked tight across the FULL width at the top, issue line as a tracked kicker above it; 2–3 cover lines in 7 grid columns anchored at the foot, each with a rule above.'),
  A('framed-cover', 'Framed cover', ['cover'], ['cover'],
    'Paper ground, margin lg; masthead huge across the top; the photo below in all 12 columns with the masthead row overlapping its top edge (overlap ~80px); cover lines in a 3-column grid row under the photo, figures as numerals.'),
  A('split-cover', 'Split colour-band cover', ['cover'], ['cover'],
    'Masthead on a solid colour band (shape, bleed) across the top third; the photo fills the rest edge to edge; one lead cover line placed on a panel over the photo\'s lower-left corner (place x:start y:end w:6).'),

  // ── Contents ──
  A('numbered-contents', 'Numbered contents', ['contents'], ['contents'],
    'Bleed photo band across the top 40%; title in 8 columns; then each entry as a row: page number as a 40–60pt accent figure (or glyph) in 2 columns, the entry in 10, a rule between rows.'),
  A('two-column-contents', 'Ruled two-column contents', ['contents'], ['contents'],
    'Title in 8 columns with a caption in the other 4; a bleed photo band; entries in two 6-column ruled columns (rule:"above" on each).'),
  A('contents-sidebar', 'Contents with photo column', ['contents'], ['contents'],
    'A 7-column photo bleeding off the left and top; title and ruled entries in the 5 columns beside it; an editor\'s note on a tinted panel at the foot.'),

  // ── Letters ──
  A('letter-portrait', 'Letter beside a portrait', ['editors-letter'], ['two-column-article'],
    'Title block in 5 columns beside a 7-column portrait that bleeds off the top and right; a hairline rule; the letter in 8 columns with a drop cap; signature byline (rule above) and a small ruled quote in the 4-column margin.'),
  A('letter-centred', 'Centred letter', ['editors-letter'], ['two-column-article'],
    'Generous margins; a centred kicker and headline; the letter in 8 columns centred on the grid (spacer spans either side) with a drop cap; a small square portrait placed on a panel; signature at the foot.'),

  // ── Openers ──
  A('panel-over-photo', 'Panel riding over the photo', ['feature-opener', 'profile', 'sidebar-feature'], ['feature-full-bleed'],
    'A bleed photo takes most of the page; under it a row whose 8–9 column panel (stack: bg-coloured shape + padded col of kicker, 48–60pt headline, deck, byline) OVERLAPS the photo\'s foot by 150–250px; the remaining columns are a spacer so the photo shows beside the panel.'),
  A('headline-on-photo', 'Headline on the photograph', ['feature-opener', 'photo-essay'], ['feature-full-bleed'],
    'Margin none; full-bleed photo; an oversized headline placed over the calm part of the picture (place x:start y:end w:8 h:content inset:xl), standfirst under it; text on a photo gets its scrim automatically.'),
  A('split-opener', 'Split opener', ['feature-opener', 'long-read'], ['feature-full-bleed', 'two-column-article'],
    'Grid row: a 7-column photo bleeding off the left, top and bottom; a 5-column text column with the headline set huge and pushed to the foot (justify end), deck and byline under a rule.'),

  // ── Articles ──
  A('article-band', 'Article with photo band', ['feature-article', 'sidebar-feature'], ['two-column-article'],
    'Title row on the grid (headline 8 columns, deck 4 columns aligned to the foot); a bleed photo band; caption; two 6-column text columns, the first with a drop cap, the second ending in an inline pull quote with rule:"both".'),
  A('article-asymmetric', 'Asymmetric article', ['feature-article', 'long-read', 'profile'], ['two-column-article'],
    'A 7-column photo with its caption placed on a small panel in the photo corner; beside it a 5-column column with kicker, headline and the first body column (drop cap); below, three 4-column columns with a ruled pull quote breaking the middle one.'),
  A('article-colour-band', 'Article over a colour band', ['feature-article', 'news-briefs'], ['two-column-article'],
    'Photo across the top; a colour band (shape, bleed) holding the kicker and headline OVERLAPS the photo\'s foot; two text columns below with a drop cap; a tinted fact box in the last third of the second column.'),
  A('three-column-read', 'Three-column read', ['long-read'], ['two-column-article'],
    'Kicker, headline, a deck with a rule below; three 4-column text columns, a drop cap on the first, a small spot photo with caption in the middle column, a subhead breaking the third.'),
  A('margin-notes', 'Text with margin notes', ['long-read', 'editors-letter'], ['two-column-article'],
    'Body in two 4-column columns; a 4-column margin carrying a pull quote (rule:"left"), a small photo with caption and a tinted note panel; headline spans 8 columns over the body.'),

  // ── Portraits & conversations ──
  A('portrait-sidebar', 'Portrait with fact box', ['profile'], ['two-column-article'],
    'A 7-column portrait bleeding off the left, top and bottom; the 5-column story: kicker, name as headline, deck, body, then a tinted KEY FACTS sidebar (stack with pad: shape + label + 3–5 entries).'),
  A('portrait-numbers', 'Portrait with numbers', ['profile', 'interview-qa'], ['two-column-article'],
    'Portrait across the top 45%; the name as a huge headline overlapping the portrait\'s foot on a panel; a row of 3 figures with labels (rule above each); body in two 6-column columns.'),
  A('qa-two-column', 'Two-column Q&A', ['interview-qa'], ['two-column-article'],
    'Title beside a 5-column portrait that bleeds off the top and right; a standout quote on an accent-tint panel with rule:"left"; Q&A pairs in two 6-column columns, questions bold in the accent colour.'),
  A('qa-portrait-column', 'Q&A beside a portrait', ['interview-qa'], ['two-column-article'],
    'A huge quote-mark glyph and the standout quote across the top; a 5-column portrait full height on the left; questions and answers in the 7 columns beside it, each pair ruled above.'),

  // ── Pictures ──
  A('single-image', 'Single image', ['photo-essay'], ['feature-full-bleed'],
    'Margin none; one bleed photograph fills the page; title and caption placed in one corner (place w:6–7 h:content inset:xl) — the words small, the picture everything.'),
  A('image-with-band', 'Photo over a caption band', ['photo-essay', 'back-cover'], ['feature-full-bleed', 'back-cover'],
    'A bleed photo over ~80% of the page; a solid colour band (bleed) at the foot with the title in 7 columns and the caption in 5.'),
  A('mosaic-7-5', 'Asymmetric mosaic', ['mosaic-gallery'], ['photo-grid'],
    'Small gutters (sm); a 7-column dominant photo beside two stacked photos in 5 columns; a lower row of 4 + 5 column photos and a 3-column ruled caption column; title row on the grid above.'),
  A('mosaic-collage', 'Collage', ['mosaic-gallery', 'quote-wall'], ['photo-grid', 'pull-quote'],
    'Photos of different sizes slightly tilted (rotate −3…3) and OVERLAPPING one another a little (overlap 40–80px) on a paper ground; caption labels placed on small panels over the photos; for playful or fashion issues.'),
  A('even-grid', 'Even grid', ['photo-grid', 'spotlight'], ['photo-grid'],
    'Title and deck; a regular 2×2 (or 3×2) grid on the 12-column grid with even gutters; a caption (or name + figure) under every photo.'),
  A('grid-with-lead', 'Lead photo and strip', ['photo-grid', 'mosaic-gallery'], ['photo-grid'],
    'One 12-column lead photo that bleeds off both sides; a strip of three 4-column photos under it with captions; title in 8 columns at the top.'),

  // ── Quotes ──
  A('quote-under-photo', 'Quote under a photograph', ['pull-quote'], ['pull-quote'],
    'A bleed photo over the top 55%; a giant quote-mark glyph (120–180pt, accent) in 2 columns and the quote at 28–36pt in 10; attribution with a rule above.'),
  A('quote-on-photo', 'Quote on the photograph', ['pull-quote'], ['pull-quote'],
    'Margin none; full-bleed photo; the quote placed centre-low over it (place x:center y:end w:10 h:content inset:xl) at 30–40pt; the attribution under it.'),
  A('staggered-quotes', 'Staggered voices', ['quote-wall'], ['pull-quote'],
    'Three or four quotes at different sizes alternating with photos across 7+5 / 5+7 grid rows; the biggest on a tinted panel with rule:"left", one on an accent-tint panel, the smallest ruled above.'),

  // ── Numbers ──
  A('numbers-tiles', 'Figures on ruled tiles', ['stat-infographic'], ['stat-infographic'],
    'Title and deck; a bleed photo band; a 2×3 grid of figures at 44–60pt, each tile with a rule above and a short label under it.'),
  A('numbers-band', 'Numbers on a colour band', ['stat-infographic', 'data-spread'], ['stat-infographic'],
    'A colour band (shape, bleed) holding a row of 3–4 huge numerals with labels; under it the explanation in 5 columns beside a 7-column photo.'),
  A('bar-chart', 'Bars drawn as shapes', ['data-spread'], ['stat-infographic'],
    'Each value a row: label in 3 columns, then a bar — a stack of a shape panel and the value placed at its end — whose fr weight is the value, a spacer taking the rest; the explanation beside a photo below.'),
  A('tinted-rows', 'Tinted table rows', ['results-table'], ['stat-infographic'],
    'Title row on the grid; a bleed photo band; then table rows alternating a tint panel (shape at opacity 0.08–0.14) and plain: the position as an accent numeral glyph in 1 column, name and result in 11.'),
  A('milestone-cards', 'Milestone cards', ['timeline'], ['stat-infographic'],
    'A 4-column photo bleeding off the left with a caption; beside it a 2-column grid of tinted cards in reading order, each with a rule above, a 28–36pt year figure and a one-line label.'),
  A('rule-timeline', 'Ruled timeline', ['timeline'], ['stat-infographic'],
    'A bleed photo band at the top; below, a thick vertical rule (shape thickness 4) beside a list of year figures and labels spread down the page (justify between).'),
  A('date-blocks', 'Date blocks', ['calendar'], ['stat-infographic'],
    'A bleed photo band; each event a row on a tint panel: a 3-column accent date block (figure on a shape) beside the event and its venue line in 9 columns.'),

  // ── Service pages ──
  A('numbered-key', 'Photo with numbered key', ['guide', 'how-to'], ['two-column-article'],
    'A 7-column photo bleeding off the left, top and bottom; in the other 5 columns the title, an intro and a key of numbered items — a numeral glyph beside each entry.'),
  A('big-steps', 'Big step numbers', ['how-to', 'guide'], ['two-column-article'],
    'Intro in 5 columns beside a 7-column photo; then the steps in a 2×2 grid, each a 40–60pt numeral glyph in the accent colour beside its entry.'),
  A('modular-briefs', 'Modular briefs', ['news-briefs'], ['two-column-article'],
    'Section title with a rule below; a lead item (7-column photo + 5-column headline and body); then three 4-column briefs, each with its title ruled above.'),
  A('sidebar-right', 'Columns and a sidebar', ['sidebar-feature'], ['two-column-article'],
    'A bleed photo band across the top; kicker, headline and deck; two 4-column text columns (drop cap on the first) and a 4-column tinted sidebar with a label and 3–5 entries.'),
  A('cards', 'Card grid', ['spotlight'], ['photo-grid'],
    'Title; a 2×2 (or 3-up) grid of equal cards — photo, a name/description entry and a key figure under it.'),
  A('ad-panel', 'Advertisement', ['sponsor'], ['feature-full-bleed'],
    'Margin none; a bleed image; the brand line placed at the top; a call-to-action panel placed across the foot (stack with pad: bg shape + the message, the CTA label and a QR with its label).'),
  A('band-signoff', 'Sign-off band', ['back-cover'], ['back-cover'],
    'Margin none; a calm bleed photo over most of the page; a colour band at the foot holding the sign-off in 8 columns and a QR with its label in 4.'),
];

/** The archetypes suited to a page type (falls back to the type's structural kind). */
export function archetypesForType(typeId: string, kind: PageTemplateKind): LayoutArchetype[] {
  const hits = LAYOUT_ARCHETYPES.filter((a) => a.types.includes(typeId));
  return hits.length ? hits : archetypesForKind(kind);
}

/** The archetypes suited to a page kind (falls back to the versatile article band). */
export function archetypesForKind(kind: PageTemplateKind): LayoutArchetype[] {
  const hits = LAYOUT_ARCHETYPES.filter((a) => a.kinds.includes(kind));
  return hits.length ? hits : LAYOUT_ARCHETYPES.filter((a) => a.id === 'article-band');
}

/** A small stable string hash (FNV-1a) — the issue seed. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface SteerPlan {
  title: string;
  concept?: { name?: string; family?: string };
  pages: { kind: PageTemplateKind; pageType?: string }[];
}

/**
 * The archetype a page is steered to, plus the alternatives on its shelf.
 *
 * Deterministic: the same issue gets the same steer on a retry (the art-director is
 * asked to fix ITS layout, not handed a new brief), while a different issue — or the
 * second page of the same type in this one — is steered elsewhere on the shelf.
 */
export function archetypeForPage(plan: SteerPlan, page: { kind: PageTemplateKind; pageType?: string }, pageNumber: number): { primary: LayoutArchetype; others: LayoutArchetype[] } {
  // Walk the issue in order so each page also avoids the composition the page BEFORE it
  // was steered to (two neighbours of different types can share a recipe — a feature
  // opener and a profile both ride a panel over a photo).
  let prev: LayoutArchetype | null = null;
  let shelf: LayoutArchetype[] = [];
  let primary: LayoutArchetype | null = null;
  const n = Math.max(1, pageNumber);
  for (let i = 1; i <= n; i++) {
    const p = i === n ? page : plan.pages[i - 1];
    if (!p) continue;
    const type = pageTypeFor(p);
    shelf = archetypesForType(type.id, p.kind);
    const seed = hash(`${plan.title}|${plan.concept?.name ?? ''}|${plan.concept?.family ?? ''}|${type.id}`);
    const before = plan.pages.slice(0, i - 1).filter((q) => pageTypeFor(q).id === type.id).length;
    let k = (seed + before) % shelf.length;
    if (shelf.length > 1 && shelf[k] === prev) k = (k + 1) % shelf.length;
    primary = shelf[k]!;
    prev = primary;
  }
  return { primary: primary!, others: shelf.filter((a) => a !== primary) };
}

/**
 * The per-page STEER, in words: the composition this page should start from, the
 * alternatives, and a reminder that it must not look like its neighbours.
 */
export function archetypeSteerForPage(plan: SteerPlan, page: { kind: PageTemplateKind; pageType?: string }, pageNumber: number): string {
  const { primary, others } = archetypeForPage(plan, page, pageNumber);
  const alt = others.length ? ` Other treatments for this type: ${others.map((a) => `"${a.name}"`).join(', ')}.` : '';
  return (
    `START FROM THIS COMPOSITION — "${primary.name}": ${primary.recipe}${alt} ` +
    `Adapt it to this page's intent and copy; you may change it if the content asks for something better, but keep it clearly different from the neighbouring pages.`
  );
}

/** The neighbouring pages' types, so the art-director can make this one look different. */
export function neighbourNote(plan: SteerPlan, pageNumber: number): string {
  const name = (n: number) => {
    const p = plan.pages[n - 1];
    return p ? `p${n} ${pageTypeFor(p).label}` : null;
  };
  const near = [name(pageNumber - 1), name(pageNumber + 1)].filter(Boolean);
  return near.length ? `Neighbouring pages: ${near.join(', ')} — give this page a different skeleton, focal point and rhythm.` : '';
}

// ── Style families → how pages of this issue behave ──────────────────────────

const FAMILY_STEER: Record<string, string> = {
  'luxury-editorial': 'Generous margins (lg–xl) and lots of air; asymmetric 12-column spans (7+5, 8+4, offset columns via spacer spans); hairline rules; small tracked capitals; one bleed photo per spread at most; no rotation.',
  'bold-sport': 'Tight gutters (sm), bleeds on every photo-led page, oversized numerals, thick colour bands (shape, bleed), panels overlapping photos; headlines huge and condensed; slight rotation allowed on collage pages only.',
  'heritage-racing': 'Classical symmetrical columns, framed panels (stack with pad on a tint), rules above and below (rule:"both"), drop caps on every article, dates set as display figures; centred titling on openers.',
  'modern-minimal': 'Strict 12-column grid with aligned edges, wide white space, thin rules, numbered sections; one solid colour block per page at most; no rotation, no ornament.',
  'community-club': 'Cards and tinted panels with clear sections, icon rows with labels, name-and-role captions under photos; friendly, even rhythm; no rotation.',
  'high-fashion': 'Broken grid: type overlapping photos, oversized letterforms, extreme scale contrast, flat colour blocks, extreme whitespace; slight rotation allowed on collage pages.',
  'annual-report': 'Rigorous 12-column grid with data panels, big numerals, bar shapes, colour-coded section bands; tight hierarchy, no rotation.',
  'outdoor-rural': 'Big landscape bleeds, wide columns, captions placed on photos, earthy colour bands; calm rhythm.',
  newsroom: 'Multi-column grid with rules between columns, modular blocks, tight gutters, many short items; photos cropped tight.',
  'playful-youth': 'Cards and badges on a loose grid, bright colour panels, rotation and overlaps welcome on collage pages, big numerals.',
};

/** How this issue's pages behave, from the Creative Director's family (keyword fallback). */
export function familyLayoutSteer(concept: { family?: string; name?: string; mood?: string } | undefined): string {
  if (!concept) return '';
  const own = concept.family ? FAMILY_STEER[concept.family] : undefined;
  if (own) return own;
  const words = `${concept.family ?? ''} ${concept.name ?? ''} ${concept.mood ?? ''}`.toLowerCase();
  if (/lux|elegan|prestig|refined/.test(words)) return FAMILY_STEER['luxury-editorial']!;
  if (/sport|bold|energ|kinetic|race day/.test(words)) return FAMILY_STEER['bold-sport']!;
  if (/herit|vintage|classic|histor|tradition/.test(words)) return FAMILY_STEER['heritage-racing']!;
  if (/minimal|clean|modern/.test(words)) return FAMILY_STEER['modern-minimal']!;
  if (/fashion|glam|style/.test(words)) return FAMILY_STEER['high-fashion']!;
  if (/report|data|annual/.test(words)) return FAMILY_STEER['annual-report']!;
  if (/club|community|member/.test(words)) return FAMILY_STEER['community-club']!;
  return '';
}

// ── Back-compat (callers that only know a kind) ───────────────────────────────

/** A per-kind shortlist, rotated by page number. Kept for callers without a plan. */
export function archetypeSteer(kind: PageTemplateKind, pageNumber: number): string {
  const options = archetypesForKind(kind);
  const offset = Math.abs(pageNumber - 1) % options.length;
  const rotated = [...options.slice(offset), ...options.slice(0, offset)];
  const names = rotated.map((a) => `"${a.name}"`).join(', ');
  return (
    `Treatments that suit this KIND of page, most-suggested first: ${names}. ` +
    `Choose whichever fits THIS page's intent — or invent a better one — then adapt it; never reproduce one ` +
    `verbatim, and make this page visibly different from the others in the issue.`
  );
}

/** The whole library rendered as a prompt block (shown as inspiration, not specs). */
export function archetypeLibraryText(): string {
  return LAYOUT_ARCHETYPES.map((a) => `• ${a.name} — ${a.recipe}`).join('\n');
}

/** Every page type has at least one archetype of its own (pinned by a test). */
export function typesWithoutArchetype(): string[] {
  return PAGE_TYPES.filter((t) => !LAYOUT_ARCHETYPES.some((a) => a.types.includes(t.id))).map((t) => t.id);
}
