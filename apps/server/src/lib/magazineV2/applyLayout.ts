// ---------------------------------------------------------------------------
// Magazine Builder v2 — put an EXISTING page into a layout read from a reference
// (P2 of docs/MAGAZINE-V2-LAYOUT-FROM-REFERENCE.md).
//
// The value of "take this layout" is not a blank skeleton — it is *my page, that
// layout*. So this REFLOWS what the page already holds into the new tree: the
// headline becomes the headline, the photos go in the picture boxes biggest-first,
// the prose fills the body. Nothing is retyped, and nothing is invented.
//
// It is the deterministic tail of the existing AI path, in the same order and with
// the same guardrails: reflow → prune → SOLVE → compose → normalize → QA. The solver
// stays the sole pixel authority, so a layout read off a photograph cannot produce
// an overlap or an off-page box.
//
// Never throws: it returns either a page or the reason there isn't one.
// ---------------------------------------------------------------------------

import { PAGE_H, PAGE_W } from './config.js';
import { normalizeLayoutSpec } from './layoutSpec.js';
import type { LayoutReading } from './layoutReading.js';
import { readingToSpec, specContentRefs } from './readingToSpec.js';
import { measureFidelity, type Fidelity } from './layoutFidelity.js';
import { pruneLayoutSpec } from './pruneSpec.js';
import { solveLayout } from './solveLayout.js';
import { makeMeasureLeaf } from './measureLeaf.js';
import { composeFromSolved, type LeafFill, type ResolvedContent } from './composeFromSolved.js';
import { charBudget } from './fitReport.js';
import { validatePageLayout } from './layoutValidate.js';
import { normalizeElements } from './writePipeline.js';
import { TEXT_ROLES } from './roleScale.js';
import { FURNITURE_IDS, refurnish, type RefurnishContext } from './pageFurniture.js';
import type { GenFonts, GenPalette } from './templates.js';
import type { MagazineElement } from './model.js';

export interface AppliedPage {
  background: { type: 'color' | 'image'; value: string };
  elements: MagazineElement[];
  /** Content that had nowhere to go — reported, never dropped in silence. */
  leftOver: { text: number; images: number };
  /** How close the built page actually came to the reference (P3). Measured, not
   *  claimed: the caller shows this instead of asserting a match. */
  fidelity: Fidelity;
  /** Slots whose copy does not fit at a readable size, with the numbers. Empty is the
   *  normal case. The page is still built — see the QA split in applyReadingToPage. */
  tight: TightSlot[];
}
/** One slot that holds less copy than it was given, in characters the user can act on. */
export interface TightSlot {
  role: string;
  /** Roughly what the box holds at the size it settled on. */
  holds: number;
  /** What this page actually has for it. */
  has: number;
}
export interface ApplyResult {
  page: AppliedPage | null;
  /** Why there is no page. '' on success. Shown to the user. */
  why: string;
}

/**
 * REFERENCE-FILL — content supplied by the caller for slots the page itself
 * cannot fill (freshly drafted copy, photos from the magazine's media library).
 *
 * The page's own content ALWAYS goes in first (passes 1 and 2 of reflowContent);
 * these are a THIRD pass, touching only slots that are still empty after both.
 * Without this, an unfilled slot was pruned and the survivors stretched over the
 * hole — "3 boxes from the reference had nothing to put in them, so the rest
 * grew to fill the page" — which is a warning where the user wanted a page.
 * Extras are never counted in `leftOver` (that reports the USER's content) and
 * unused extras are simply dropped.
 */
export interface ExtraContent {
  /** Drafted copy, one per still-empty text slot, matched by exact leaf role. */
  texts?: { role: string; text: string }[];
  /** Library photos, used only when the page's own image pool has run dry. */
  images?: { url: string; assetId?: string; alt?: string }[];
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const hexOr = (v: unknown, fallback: string) => (typeof v === 'string' && HEX.test(v) ? v : fallback);

/** Rough per-role copy budgets (chars), shared by the reference-fill shopping list
 *  (unfilledSlots) and pass 2's cram limit. Estimates, not law: the composer still
 *  shrinks-to-fit and the tight-slot report still fires. */
const ROLE_CHAR_CAP: Record<string, number> = {
  headline: 90, subhead: 140, kicker: 48, byline: 60, caption: 180,
  label: 36, pullquote: 200, figure: 24, entry: 260, body: 1200, qrLabel: 40,
};

/** Slots that hold a line or two, where the SHORTEST spare copy is the best guess.
 *  Putting a 300-word paragraph in a caption box is worse than leaving it out. */
const TERSE_SLOTS = new Set(['caption', 'label', 'byline', 'kicker']);

/** How far over a terse slot's budget spare copy may run before a DRAFTED
 *  alternative is preferred (pass 2's cram limit; unfilledSlots must use the
 *  same number so the draft actually exists when the limit fires). */
const CRAM_AT = 3;

// ── Legibility ───────────────────────────────────────────────────────────────
// A derived palette can be arithmetically correct and still unreadable, and one
// combination destroyed pages: white type over a dark photograph. The ink derives to
// #ffffff — CORRECTLY, the words really are white — and the ground falls through to
// #ffffff too, because `background.type === 'color'` is false when the background is an
// image. Consume the photo into a box that is not full-bleed and the rest of the sheet
// is painted white with white words on it: the page comes out blank, and the fidelity
// score called it a match.
//
// Guarding `bg !== text` alone would only fix the example. Captions resolve through
// `secondary` and kickers through `accent` (roleScale), so the FAMILY is "any ink that
// resolves against the ground", and all of them are checked here.

const DARK_GROUND = '#141414';
const LIGHT_GROUND = '#ffffff';

/**
 * The contrast at or below which a colour has not been chosen badly — it has DISAPPEARED.
 *
 * Deliberately NOT WCAG AA (4.5, or 3 for large text). Enforcing AA here would repaint
 * every magazine in the product: its gold accents sit at about 2.1:1 on white BY DESIGN,
 * and grey body copy on white lands near 3.5:1 — both legible, both deliberate, neither
 * this function's business. Raising them is a real piece of work with its own document
 * (docs/THEME-REVIEW.md) and a token that already exists for it (`--brand-accent-ink`).
 *
 * What this guard exists for is the case where the arithmetic produces a colour that is
 * the ground: white type on a white page, where nothing is visible at all. 1.6 catches a
 * colour within a hair of its background and leaves every plausible design choice alone.
 */
const INVISIBLE_AT = 1.6;

/** WCAG relative luminance of #rrggbb. */
function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Plain text length, for ranking prose. Existing copy is inline HTML. */
const textOf = (el: MagazineElement): string => (el.text?.content ?? '').replace(/<[^>]*>/g, ' ').trim();

/**
 * The resolved look of a page: the palette and the two faces to compose in.
 *
 * This is a SEPARATE INPUT to `applyReadingToPage` rather than something it derives,
 * and that is the whole point — see the note on that function. Produce one with
 * `themeForPage`, from the page as it stands BEFORE any blanking.
 */
export interface PageStyle {
  palette: GenPalette;
  fonts: GenFonts;
}

/**
 * The theme to compose in.
 *
 * `genTheme` is the magazine's stated design intent and wins when it exists. When it
 * does not — a PDF import, or a magazine older than genTheme — the theme is DERIVED
 * FROM THE PAGE ITSELF rather than synthesised by a model call. That is both cheaper
 * and more honest: applying a layout should change a page's STRUCTURE, not repaint
 * it in colours it never had.
 *
 * THE PAGE PASSED HERE MUST BE THE ONE THE USER CAN SEE. Everything below reads the
 * page's own text elements — the ink most words are set in, the face of the largest
 * line, the commonest family — so a page that has been emptied first tallies nothing
 * and every value falls through to a hardcoded default. That is not hypothetical: it
 * is what shipped, and what the two DIAGNOSIS tests in applyLayout.test.ts pin down.
 */
export function themeForPage(
  genTheme: { palette?: Partial<GenPalette>; fonts?: Partial<GenFonts> } | null,
  page: { background?: { type?: string; value?: string }; elements: MagazineElement[] },
): PageStyle {
  const p = genTheme?.palette ?? {};
  const f = genTheme?.fonts ?? {};
  const texts = page.elements.filter((e) => e.type === 'text' && e.text);

  // Ink = the colour most of the words are already in. Frequency, not the first one
  // found: a single coloured kicker must not become the whole page's text colour.
  const inkTally = new Map<string, number>();
  for (const t of texts) {
    const c = (t.text?.color ?? '').toLowerCase();
    if (HEX.test(c)) inkTally.set(c, (inkTally.get(c) ?? 0) + 1);
  }
  const byCount = [...inkTally.entries()].sort((a, b) => b[1] - a[1]);
  const ink = byCount[0]?.[0] ?? '#1a1a1a';
  // The accent is the page's SECOND colour if it has one — the emphasis it already
  // uses. Falling back to the ink keeps a monochrome page monochrome.
  const second = byCount[1]?.[0] ?? ink;

  const pageBg = page.background?.type === 'color' ? hexOr(page.background.value, '#ffffff') : '#ffffff';

  // display = the font of the LARGEST text on the page (that is what a display face
  // is for); body = the font most of the words are set in.
  const biggest = [...texts].sort((a, b) => (b.text?.fontSize ?? 0) - (a.text?.fontSize ?? 0))[0];
  const familyTally = new Map<string, number>();
  for (const t of texts) {
    const fam = (t.text?.fontFamily ?? '').trim();
    if (fam) familyTally.set(fam, (familyTally.get(fam) ?? 0) + 1);
  }
  const commonFamily = [...familyTally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  // THE GROUND MOVES, NOT THE INK. White type exists because it sat on a photograph, so
  // repainting the words dark would be legible and would throw away the page's design.
  // Moving the ground keeps white-on-dark, which is what the reference actually was.
  let bg = hexOr(p.bg, pageBg);
  let text = hexOr(p.text, ink);
  if (contrastRatio(text, bg) <= INVISIBLE_AT) {
    bg = contrastRatio(text, DARK_GROUND) >= contrastRatio(text, LIGHT_GROUND) ? DARK_GROUND : LIGHT_GROUND;
    // A mid-tone ink that reads on neither ground cannot be saved by moving the ground,
    // and being visible outranks provenance — so then, and only then, the ink moves.
    if (contrastRatio(text, bg) <= INVISIBLE_AT) {
      text = contrastRatio(DARK_GROUND, bg) >= contrastRatio(LIGHT_GROUND, bg) ? DARK_GROUND : LIGHT_GROUND;
    }
  }
  /** An accent that has vanished into the ground falls back to the ink, which is now
   *  guaranteed to be visible against it. */
  const onGround = (c: string) => (contrastRatio(c, bg) > INVISIBLE_AT ? c : text);

  return {
    palette: {
      bg,
      text,
      primary: onGround(hexOr(p.primary, second)),
      secondary: onGround(hexOr(p.secondary, ink)),
      accent: onGround(hexOr(p.accent, second)),
    },
    fonts: {
      display: (typeof f.display === 'string' && f.display) || biggest?.text?.fontFamily || commonFamily || 'Playfair Display, Georgia, serif',
      body: (typeof f.body === 'string' && f.body) || commonFamily || 'Inter, Arial, sans-serif',
    },
  };
}

/**
 * Fill the spec's content slots from the page's existing elements.
 *
 * Matching is BY ROLE first — a headline should land in the headline box — and only
 * then by whatever is left, longest prose to the biggest prose slot. Photos go
 * biggest-first, because the reference's hero box wants the page's hero photo.
 *
 * Anything with nowhere to go is COUNTED and returned. A layout with fewer slots
 * than the page has content is a normal outcome (a reference with one photo, a page
 * with four), and the user has to be told rather than left to spot the loss.
 */
export function reflowContent(
  slots: { ref: string; role: string }[],
  elements: MagazineElement[],
  /**
   * The page's BACKGROUND image, when it has one.
   *
   * This is not an edge case — it is how every PDF-imported page holds its
   * photography. `processPage` rasterises the page, erases the text, and stores the
   * result as `background: { type: 'image', … }`, so such a page has real imagery and
   * ZERO image elements. Reading only `elements` left the hero slot empty, pruning
   * deleted it, the page re-partitioned, and the compose step then overwrote the
   * background with a flat colour: the photograph was destroyed and the layout with
   * it. It goes in FIRST because it is, by definition, the biggest image on the page.
   */
  backgroundImage?: string,
  /** Caller-supplied fill for slots the page cannot cover — see ExtraContent. */
  extra?: ExtraContent,
): { content: ResolvedContent; leftOver: { text: number; images: number }; usedBackground: boolean } {
  const content: ResolvedContent = {};
  // Kept OUTSIDE the page's own pools so they never count as the user's content
  // (leftOver) and never join the spare-prose glue at the bottom.
  const extraTexts = [...(extra?.texts ?? [])];
  const extraImages = [...(extra?.images ?? [])];

  // Pools, each ordered so the FIRST one taken is the most important.
  //
  // FURNITURE IS NOT CONTENT, and it has to be excluded HERE rather than trusted to
  // behave. `pageFurniture` stamps the running head, the masthead and the folio with
  // `role: 'other'` and a comment saying they therefore never count as content — true
  // of pageDensity, which filters on these same ids, and false of this function, which
  // treats every 'other' as spare editorial prose. The measured result was a page whose
  // body copy ended "…nobody minded.\n7", the masthead promoted to a standfirst, and a
  // fidelity report of 81% "matched" over the top of it. Worse, the folio was then gone
  // for good: restampFolio finds it by id, so renumberFolios could never repair that
  // page again. Chrome is re-derived from the new layout after QA instead.
  const byRole = new Map<string, MagazineElement[]>();
  const loose: MagazineElement[] = [];
  const editorial = elements.filter((e) => !FURNITURE_IDS.includes(e.id));
  for (const el of editorial.filter((e) => e.type === 'text' && textOf(e))) {
    const role = el.text?.role ?? 'other';
    if (role === 'other') { loose.push(el); continue; }
    const list = byRole.get(role) ?? [];
    list.push(el);
    byRole.set(role, list);
  }
  for (const list of byRole.values()) list.sort((a, b) => textOf(b).length - textOf(a).length);
  loose.sort((a, b) => textOf(b).length - textOf(a).length);

  const BACKGROUND = '\u0000background';
  const images: { url: string; assetId: string; alt: string; key?: string }[] = editorial
    .filter((e) => e.type === 'image' && e.image?.url)
    .sort((a, b) => b.w * b.h - a.w * a.h)
    .map((e) => ({ url: e.image!.url, assetId: e.image!.assetId ?? '', alt: e.image!.alt ?? '' }));
  if (backgroundImage) images.unshift({ url: backgroundImage, assetId: '', alt: '', key: BACKGROUND });
  let usedBackground = false;

  const icons = editorial.filter((e) => e.type === 'icon' && (e.icon?.name || e.icon?.src));
  const qrs = editorial.filter((e) => e.type === 'qr' && e.qr?.url);

  // The element model's text roles are coarser than the DSL's leaf roles, so a
  // `kicker` slot looks for a `subhead`, a `figure` for a `headline`, and so on. This
  // mirrors ROLE_SCALE's own textRole mapping.
  const wantedTextRole: Record<string, string> = {
    headline: 'headline', figure: 'headline', pullquote: 'pullquote', subhead: 'subhead',
    kicker: 'subhead', byline: 'byline', caption: 'caption', label: 'caption',
    body: 'body', entry: 'body',
  };

  /** Pass 1: a slot's own role, then unroled copy. Nothing speculative. */
  const takeMatching = (leafRole: string): MagazineElement | undefined => {
    const want = wantedTextRole[leafRole] ?? 'body';
    const list = byRole.get(want);
    if (list && list.length > 0) return list.shift();
    return loose.shift();
  };

  /**
   * Pass 2: copy of ANY role, for slots pass 1 could not fill.
   *
   * An unfilled slot is not a small loss — pruneSpec deletes it and the page
   * RE-PARTITIONS, which throws away the arrangement we were asked to reproduce. So
   * real copy in roughly the right place beats a hole in the layout.
   *
   * It has to be a SECOND PASS, though. Doing this inline would let an early headline
   * slot steal the body paragraph that the body slot two lines later matches exactly —
   * every slot gets its own role first, and only what is genuinely spare gets moved.
   *
   * THE CRAM LIMIT (`maxLen`): a terse slot may refuse copy wildly over its budget —
   * but ONLY when the caller has a drafted alternative (pass 3) waiting. Measured on a
   * real cover apply: the page's 1,345-character body paragraph beat the drafted
   * caption into a 272-character caption strip — words preserved, page ruined. With a
   * draft available the long copy is left in the pool instead, where the spare-prose
   * glue or the leftOver count picks it up; with NO draft, cramming still wins,
   * because real words in the wrong box beat a hole in the layout.
   */
  const takeAny = (leafRole: string, maxLen = Infinity): MagazineElement | undefined => {
    const pools = [...byRole.values()].filter((v) => v.length > 0);
    if (pools.length === 0) return undefined;
    const spare = pools.flat().sort((a, b) => textOf(a).length - textOf(b).length);
    const pick = TERSE_SLOTS.has(leafRole) ? spare[0]! : spare[spare.length - 1]!;
    if (TERSE_SLOTS.has(leafRole) && textOf(pick).length > maxLen) return undefined;
    for (const v of pools) {
      const at = v.indexOf(pick);
      if (at >= 0) { v.splice(at, 1); break; }
    }
    return pick;
  };

  for (const slot of slots) {
    const fill: LeafFill = {};
    if (slot.role === 'image') {
      // The page's own photos first, biggest slot to biggest photo; the media
      // library only covers slots the page itself cannot.
      const img = images.shift() ?? extraImages.shift();
      if (img) {
        fill.image = { url: img.url, assetId: (img as { assetId?: string }).assetId ?? '', alt: (img as { alt?: string }).alt ?? '' };
        if ((img as { key?: string }).key === BACKGROUND) usedBackground = true;
      }
    } else if (slot.role === 'qr') {
      const qr = qrs.shift();
      if (qr?.qr) fill.qrUrl = qr.qr.url;
    } else if (slot.role === 'icon') {
      const icon = icons.shift();
      if (icon?.icon?.name) fill.iconName = icon.icon.name;
      if (icon?.icon?.src) fill.iconSrc = icon.icon.src;
      if (icon?.icon?.color) fill.iconColor = icon.icon.color;
    } else if (TEXT_ROLES.has(slot.role)) {
      const el = takeMatching(slot.role);
      if (el?.text?.content) fill.text = el.text.content;
    }
    // `shape` slots are intentionally left unfilled: they are scrims and panels,
    // painted from the palette by composeFromSolved, never carried content.
    if (Object.keys(fill).length > 0) content[slot.ref] = fill;
  }

  // Pass 2 — text slots still empty, filled from whatever copy is genuinely spare.
  // A terse slot with a drafted alternative refuses copy over CRAM_AT× its budget
  // (see takeAny); without one, anything beats a hole.
  for (const slot of slots) {
    if (content[slot.ref] || !TEXT_ROLES.has(slot.role) || slot.role === 'shape') continue;
    const hasDraft = extraTexts.some((t) => t.role === slot.role && t.text.trim());
    const cramLimit = hasDraft ? (ROLE_CHAR_CAP[slot.role] ?? 200) * CRAM_AT : Infinity;
    const el = takeAny(slot.role, cramLimit);
    if (el?.text?.content) content[slot.ref] = { text: el.text.content };
  }

  // Pass 3 — DRAFTED copy for slots the page could not fill at all, matched by
  // exact leaf role (the caller drafted one per missing slot). Only after both
  // passes above, so the user's own words always win a slot before invented ones.
  for (const slot of slots) {
    if (content[slot.ref] || !TEXT_ROLES.has(slot.role) || slot.role === 'shape') continue;
    const at = extraTexts.findIndex((t) => t.role === slot.role && t.text.trim());
    if (at < 0) continue;
    content[slot.ref] = { text: extraTexts[at]!.text };
    extraTexts.splice(at, 1);
  }

  // Prose that found no slot joins the LARGEST body slot rather than vanishing —
  // losing a paragraph of someone's writing to a layout change is not acceptable.
  const spare = [...loose, ...[...byRole.values()].flat()].filter((e) => textOf(e));
  if (spare.length > 0) {
    const bodySlot = slots.find((s) => s.role === 'body' || s.role === 'entry');
    if (bodySlot) {
      const existing = content[bodySlot.ref]?.text ?? '';
      const added = spare.map((e) => e.text?.content ?? '').filter(Boolean).join('\n');
      content[bodySlot.ref] = { ...content[bodySlot.ref], text: existing ? `${existing}\n${added}` : added };
      spare.length = 0;
    }
  }

  return { content, leftOver: { text: spare.length, images: images.length }, usedBackground };
}

/**
 * Reading + page → a laid-out page, or the reason it could not be done.
 *
 * Pure apart from the imports: the caller persists the result. That is deliberate —
 * a function that both composes and writes cannot be tested without a database.
 */
export function applyReadingToPage(
  reading: LayoutReading,
  /**
   * The SKELETON the reflow runs against — the elements that may claim a slot.
   *
   * Callers are allowed to hand over less than the real page: "use this layout" is a
   * RECREATE and passes a furniture-only blank so no old copy can claim a slot. That is
   * why `style` is a separate parameter and not derived from this.
   */
  page: { width?: number; height?: number; background?: { type?: string; value?: string }; elements: MagazineElement[] },
  /**
   * The page's resolved look — SEPARATE from `page` on purpose.
   *
   * This used to be the magazine's `genTheme`, and the theme was derived in here from
   * whatever `page` happened to contain. That coupling was the bug: when the caller
   * started passing a blanked page (RECREATE, 2026-08-17) the derivation silently ran
   * over nothing, and every imported page came back as #1a1a1a on #ffffff in Playfair
   * and Inter — no type error, no failing test, no warning. Taking the resolved style
   * as an argument means the caller must say WHERE the look came from, and passing a
   * blanked page can no longer quietly answer that question.
   *
   * Build it with `themeForPage(genTheme, <the page as the user sees it>)`.
   */
  style: PageStyle,
  /** Who this page is, so its running head and folio can be put back after the rebuild.
   *  Optional: omitted, the page simply comes back without chrome. */
  furnitureCtx?: RefurnishContext,
  /** Reference-fill: drafted copy + library photos for slots the page cannot cover. */
  extra?: ExtraContent,
): ApplyResult {
  const converted = readingToSpec(reading);
  if (!converted) return { page: null, why: 'That layout could not be turned into a page structure.' };
  // Through the trust boundary even though we built it ourselves: it is the one place
  // the DSL's caps are enforced, and it must never be bypassed just because the
  // author was local code rather than a model.
  const spec = normalizeLayoutSpec(converted.spec);
  if (!spec) return { page: null, why: 'That layout could not be turned into a page structure.' };

  const dims = { width: Number(page.width) || PAGE_W, height: Number(page.height) || PAGE_H };
  const theme = style;
  const bgImage = page.background?.type === 'image' && page.background.value ? String(page.background.value) : '';
  const { content, leftOver, usedBackground } = reflowContent(specContentRefs(spec), page.elements, bgImage || undefined, extra);

  // keepWhitespace: the reference's empty space is its design. Without this, pruning
  // promotes a content-sized track to `fr` to stop a strip trailing — correct for the
  // generator, which must fill the page, and catastrophic here: it stretched a cover's
  // tagline over two thirds of the sheet.
  /**
   * AN IMAGE SLOT WITH NO PHOTOGRAPH KEEPS ITS BOX.
   *
   * A magazine with fewer photos than its reference is the ordinary case, not an edge
   * one, and the old outcome was the worst available: the empty leaf was pruned, the
   * page RE-PARTITIONED, and the type spread across the sheet — so asking for a
   * photo-led layout you could not fill gave you a page that resembled nothing. The
   * band is 45% of a cover; losing it is not losing a detail.
   *
   * `shapeFill` is the same fallback the generator uses for a photo it could not
   * source (curateFills), and composeFromSolved already paints it as a tinted block.
   * The colour is `secondary`, which `themeForPage` has already guaranteed to be
   * visible against this ground.
   *
   * Real photography still wins every time: this only ever fills a slot that reflow
   * and reference-fill both left empty.
   */
  for (const slot of specContentRefs(spec)) {
    if (slot.role !== 'image') continue;
    if (content[slot.ref]?.image?.url) continue;
    content[slot.ref] = { ...content[slot.ref], shapeFill: theme.palette.secondary };
  }

  const pruned = pruneLayoutSpec(spec, content, { keepWhitespace: true, keepImagePlaceholders: true });
  if (!pruned) {
    return { page: null, why: 'This page has no content to put into that layout yet — add a headline, some text or a photo first.' };
  }
  const solved = solveLayout(pruned, dims, { measureLeaf: makeMeasureLeaf(content, theme.fonts) });
  const composed = composeFromSolved(solved, content, theme);
  const elements = normalizeElements(composed.elements, dims) as MagazineElement[];
  /**
   * QA, SPLIT BY WHAT THE USER CAN DO ABOUT IT.
   *
   * Overlap and out-of-bounds are correctness: the solver guarantees against both, so
   * either one means something is genuinely wrong and refusing is right.
   *
   * OVERFLOW IS NOT IN THAT CLASS, and treating it as if it were is what made this
   * feature start refusing ordinary work. Bringing the prose floor up to 8pt (right —
   * the pages that "used to build" set body copy at 6.7pt at 150 DPI) meant a page whose
   * copy no longer fitted at a READABLE size became a 422 rather than a page: measured on
   * a photo-led reference, 2,200 characters built and 2,400 refused, and what the user
   * saw was "fails layout QA — overflow: text d9fe643f-…", an element id that appears
   * nowhere in their magazine, after a confirm that already warned the change could not
   * be undone. Refusing is the one outcome they cannot act on.
   *
   * So the page is built and the shortfall is REPORTED, in characters, per role. The
   * floor stays; the silence goes.
   */
  const report = validatePageLayout(elements, dims);
  const fatal = report.issues.filter((i) => i.kind !== 'overflow');
  if (fatal.length > 0) {
    return { page: null, why: `The page that layout produces fails layout QA — ${fatal.map((i) => `${i.kind}: ${i.detail}`).join('; ')}` };
  }
  const tight = tightSlots(report.issues, elements);
  // Measured against the SOLVED boxes, which is where the reference's proportions
  // either survived or didn't. Measuring the composed elements instead would fold in
  // text auto-fit and image cropping — real, but not what "did we match the layout"
  // is asking.
  // The reference's own shape goes in: a landscape reference on a portrait page is an
  // adaptation however well the bands happened to line up, and the score is the only
  // place the user is told so.
  const fidelity = measureFidelity(solved, converted.origin, dims, { aspect: reading.aspect });

  /**
   * Keep a background IMAGE we did not take.
   *
   * composeFromSolved always returns a painted colour, and writing that over a
   * background photo deletes it — the page's only picture, gone, on a layout change
   * the user expected to rearrange things rather than throw them away. If the photo
   * became a full-bleed element instead, the colour is right (the element covers it).
   */
  const background = bgImage && !usedBackground
    ? { type: 'image' as const, value: bgImage }
    : composed.background;

  /**
   * Re-derive the page's chrome against the NEW layout.
   *
   * Furniture is deliberately not carried through the reflow (see reflowContent), so a
   * rearranged page would otherwise come back with no running head and no folio — and
   * an absent folio is not merely cosmetic: `restampFolio` finds it by id, so a page
   * that loses it can never be renumbered again by a later reorder.
   *
   * `refurnish` re-derives the boxes against the new layout and takes the wording from
   * the chrome the page already had. Same rule as generate.ts — furniture lands AFTER
   * layout QA, so chrome can neither rescue a bad page nor fail a good one.
   *
   * Without a context the caller gets a bare page, which is correct: this function
   * cannot invent a page number.
   */
  const furniture = furnitureCtx
    ? refurnish(page.elements, { background, elements }, furnitureCtx)
    : [];
  const withChrome = furniture.length > 0 ? [...elements, ...furniture] : elements;
  return { page: { background, elements: withChrome, leftOver, fidelity, tight }, why: '' };
}

/**
 * Turn the QA's overflow issues into numbers a writer can act on.
 *
 * "text d9fe643f-… overflows its box" tells the user nothing they can use: the id is
 * internal and the box is one they never drew. "the body holds about 2,200 characters at
 * a readable size, and this page has 2,600" tells them to cut 400 characters or pick a
 * different reference — which is the whole difference between a report and a complaint.
 */
function tightSlots(issues: { kind: string; detail: string }[], elements: MagazineElement[]): TightSlot[] {
  const out: TightSlot[] = [];
  for (const issue of issues) {
    if (issue.kind !== 'overflow') continue;
    // The detail carries the element id; the numbers come from the element itself.
    const el = elements.find((e) => e.type === 'text' && !!e.text && issue.detail.includes(e.id));
    if (!el?.text) continue;
    const holds = charBudget({
      boxW: el.w,
      boxH: el.h,
      fontSize: el.text.fontSize,
      lineHeight: el.text.lineHeight,
      fontFamily: el.text.fontFamily,
      fontWeight: el.text.fontWeight,
    });
    out.push({ role: el.text.role ?? 'other', holds, has: textOf(el).length });
  }
  return out;
}

/**
 * Which of the reading's slots the page CANNOT fill from its own content — the
 * caller's shopping list for reference-fill (draft this copy, find these photos)
 * before it calls applyReadingToPage with the result as `extra`.
 *
 * Runs the same conversion and the same two reflow passes as the real apply, so
 * the empty set here is exactly the set pass 3 will be asked to cover — the two
 * cannot drift because they are the same code. Pure and model-free: the DRAFTING
 * of the fill is the caller's business (it needs a model); knowing what to draft
 * is layout arithmetic and belongs here where it can be tested.
 *
 * `approxChars` is a budget estimate from the reference's own box (fractions of
 * the page): enough for a drafter to write to. The composer still shrinks-to-fit
 * and the tight-slot report still fires, so a rough number is safe.
 */
export function unfilledSlots(
  reading: LayoutReading,
  page: { width?: number; height?: number; background?: { type?: string; value?: string }; elements: MagazineElement[] },
): { texts: { role: string; approxChars: number; hint?: string }[]; images: number } | null {
  const converted = readingToSpec(reading);
  if (!converted) return null;
  const spec = normalizeLayoutSpec(converted.spec);
  if (!spec) return null;
  const slots = specContentRefs(spec);
  const bgImage = page.background?.type === 'image' && page.background.value ? String(page.background.value) : '';
  const { content } = reflowContent(slots, page.elements, bgImage || undefined);

  // The vision's note for the region a slot came from ("masthead 'THE HORSE'") —
  // it tells the drafter WHAT the reference said there, so the fresh copy is this
  // magazine's version of the same thing rather than generic filler. Matched back
  // through `origin` (the slot's source box IS the region's box); a slot with no
  // one-to-one region (a split body, a synthesized band) simply gets no hint.
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  const hintFor = (ref: string, role: string): string | undefined => {
    const box = converted.origin[ref];
    if (!box) return undefined;
    const region = reading.regions.find(
      (g) => g.role === role && near(g.box.x, box.x) && near(g.box.y, box.y) && near(g.box.w, box.w) && near(g.box.h, box.h),
    );
    const note = region?.note?.trim();
    return note || undefined;
  };

  const dims = { width: Number(page.width) || PAGE_W, height: Number(page.height) || PAGE_H };
  // ~1 character per 45px² at body sizes on the 150-DPI sheet — deliberately
  // conservative; short-line display roles are capped by ROLE_CHAR_CAP.
  const texts: { role: string; approxChars: number; hint?: string }[] = [];
  let images = 0;
  for (const slot of slots) {
    if (slot.role === 'image') { if (!content[slot.ref]) images += 1; continue; }
    if (!TEXT_ROLES.has(slot.role) || slot.role === 'shape') continue;
    // A slot needs a draft when it is EMPTY — or when pass 2 filled a terse slot
    // by cramming copy far over its budget (the 1,345-char caption case). Listing
    // the crammed slot here is what makes the draft EXIST at apply time, which is
    // the condition pass 2's cram limit needs before it will refuse the cram.
    const filled = content[slot.ref]?.text ?? '';
    const cap = ROLE_CHAR_CAP[slot.role] ?? 120;
    const crammed = TERSE_SLOTS.has(slot.role) && filled.replace(/<[^>]*>/g, ' ').trim().length > cap * CRAM_AT;
    if (filled && !crammed) continue;
    const box = converted.origin[slot.ref];
    const area = box ? box.w * dims.width * (box.h * dims.height) : 0;
    const byArea = area > 0 ? Math.round(area / 45) : 80;
    const hint = hintFor(slot.ref, slot.role);
    texts.push({ role: slot.role, approxChars: Math.max(16, Math.min(cap, byArea)), ...(hint ? { hint } : {}) });
  }
  return { texts, images };
}

/** The shortfall as one sentence, for a caller that needs to show it. */
export function tightSummary(tight: TightSlot[]): string {
  if (tight.length === 0) return '';
  const worst = [...tight].sort((a, b) => b.has - b.holds - (a.has - a.holds))[0]!;
  const rest = tight.length - 1;
  const tail = rest > 0 ? ` (and ${rest} other slot${rest === 1 ? '' : 's'})` : '';
  return `The ${worst.role} holds about ${worst.holds} characters at a readable size, and this page has ${worst.has}${tail}. The text is on the page but some of it is cut — shorten it, or try a layout with more room.`;
}
