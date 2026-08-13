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
import { validatePageLayout } from './layoutValidate.js';
import { normalizeElements } from './writePipeline.js';
import { TEXT_ROLES } from './roleScale.js';
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
}
export interface ApplyResult {
  page: AppliedPage | null;
  /** Why there is no page. '' on success. Shown to the user. */
  why: string;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const hexOr = (v: unknown, fallback: string) => (typeof v === 'string' && HEX.test(v) ? v : fallback);

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
 * The theme to compose in.
 *
 * `genTheme` is the magazine's stated design intent and wins when it exists. When it
 * does not — a PDF import, or a magazine older than genTheme — the theme is DERIVED
 * FROM THE PAGE ITSELF rather than synthesised by a model call. That is both cheaper
 * and more honest: applying a layout should change a page's STRUCTURE, not repaint
 * it in colours it never had.
 */
export function themeForPage(
  genTheme: { palette?: Partial<GenPalette>; fonts?: Partial<GenFonts> } | null,
  page: { background?: { type?: string; value?: string }; elements: MagazineElement[] },
): { palette: GenPalette; fonts: GenFonts } {
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
): { content: ResolvedContent; leftOver: { text: number; images: number }; usedBackground: boolean } {
  const content: ResolvedContent = {};

  // Pools, each ordered so the FIRST one taken is the most important.
  const byRole = new Map<string, MagazineElement[]>();
  const loose: MagazineElement[] = [];
  for (const el of elements.filter((e) => e.type === 'text' && textOf(e))) {
    const role = el.text?.role ?? 'other';
    if (role === 'other') { loose.push(el); continue; }
    const list = byRole.get(role) ?? [];
    list.push(el);
    byRole.set(role, list);
  }
  for (const list of byRole.values()) list.sort((a, b) => textOf(b).length - textOf(a).length);
  loose.sort((a, b) => textOf(b).length - textOf(a).length);

  const BACKGROUND = ' background';
  const images: { url: string; assetId: string; alt: string; key?: string }[] = elements
    .filter((e) => e.type === 'image' && e.image?.url)
    .sort((a, b) => b.w * b.h - a.w * a.h)
    .map((e) => ({ url: e.image!.url, assetId: e.image!.assetId ?? '', alt: e.image!.alt ?? '' }));
  if (backgroundImage) images.unshift({ url: backgroundImage, assetId: '', alt: '', key: BACKGROUND });
  let usedBackground = false;

  const icons = elements.filter((e) => e.type === 'icon' && (e.icon?.name || e.icon?.src));
  const qrs = elements.filter((e) => e.type === 'qr' && e.qr?.url);

  // The element model's text roles are coarser than the DSL's leaf roles, so a
  // `kicker` slot looks for a `subhead`, a `figure` for a `headline`, and so on. This
  // mirrors ROLE_SCALE's own textRole mapping.
  const wantedTextRole: Record<string, string> = {
    headline: 'headline', figure: 'headline', pullquote: 'pullquote', subhead: 'subhead',
    kicker: 'subhead', byline: 'byline', caption: 'caption', label: 'caption',
    body: 'body', entry: 'body',
  };

  /** Slots that hold a line or two, where the SHORTEST spare copy is the best guess.
   *  Putting a 300-word paragraph in a caption box is worse than leaving it out. */
  const TERSE_SLOTS = new Set(['caption', 'label', 'byline', 'kicker']);

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
   */
  const takeAny = (leafRole: string): MagazineElement | undefined => {
    const pools = [...byRole.values()].filter((v) => v.length > 0);
    if (pools.length === 0) return undefined;
    const spare = pools.flat().sort((a, b) => textOf(a).length - textOf(b).length);
    const pick = TERSE_SLOTS.has(leafRole) ? spare[0]! : spare[spare.length - 1]!;
    for (const v of pools) {
      const at = v.indexOf(pick);
      if (at >= 0) { v.splice(at, 1); break; }
    }
    return pick;
  };

  for (const slot of slots) {
    const fill: LeafFill = {};
    if (slot.role === 'image') {
      const img = images.shift();
      if (img) {
        fill.image = { url: img.url, assetId: img.assetId, alt: img.alt };
        if (img.key === BACKGROUND) usedBackground = true;
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
  for (const slot of slots) {
    if (content[slot.ref] || !TEXT_ROLES.has(slot.role) || slot.role === 'shape') continue;
    const el = takeAny(slot.role);
    if (el?.text?.content) content[slot.ref] = { text: el.text.content };
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
  page: { width?: number; height?: number; background?: { type?: string; value?: string }; elements: MagazineElement[] },
  genTheme: { palette?: Partial<GenPalette>; fonts?: Partial<GenFonts> } | null,
): ApplyResult {
  const converted = readingToSpec(reading);
  if (!converted) return { page: null, why: 'That layout could not be turned into a page structure.' };
  // Through the trust boundary even though we built it ourselves: it is the one place
  // the DSL's caps are enforced, and it must never be bypassed just because the
  // author was local code rather than a model.
  const spec = normalizeLayoutSpec(converted.spec);
  if (!spec) return { page: null, why: 'That layout could not be turned into a page structure.' };

  const dims = { width: Number(page.width) || PAGE_W, height: Number(page.height) || PAGE_H };
  const theme = themeForPage(genTheme, page);
  const bgImage = page.background?.type === 'image' && page.background.value ? String(page.background.value) : '';
  const { content, leftOver, usedBackground } = reflowContent(specContentRefs(spec), page.elements, bgImage || undefined);

  // keepWhitespace: the reference's empty space is its design. Without this, pruning
  // promotes a content-sized track to `fr` to stop a strip trailing — correct for the
  // generator, which must fill the page, and catastrophic here: it stretched a cover's
  // tagline over two thirds of the sheet.
  const pruned = pruneLayoutSpec(spec, content, { keepWhitespace: true });
  if (!pruned) {
    return { page: null, why: 'This page has no content to put into that layout yet — add a headline, some text or a photo first.' };
  }
  const solved = solveLayout(pruned, dims, { measureLeaf: makeMeasureLeaf(content, theme.fonts) });
  const composed = composeFromSolved(solved, content, theme);
  const elements = normalizeElements(composed.elements, dims) as MagazineElement[];
  const report = validatePageLayout(elements, dims);
  if (!report.ok) {
    // The same QA the generator runs. Naming what failed matters: these issues used
    // to be computed and thrown away, which made every fallback unexplained.
    return { page: null, why: `The page that layout produces fails layout QA — ${report.issues.map((i) => `${i.kind}: ${i.detail}`).join('; ')}` };
  }
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
  return { page: { background, elements, leftOver, fidelity }, why: '' };
}
