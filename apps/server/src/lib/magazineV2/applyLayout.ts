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

  return {
    palette: {
      bg: hexOr(p.bg, pageBg),
      text: hexOr(p.text, ink),
      primary: hexOr(p.primary, second),
      secondary: hexOr(p.secondary, ink),
      accent: hexOr(p.accent, second),
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
): { content: ResolvedContent; leftOver: { text: number; images: number } } {
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

  const images = elements
    .filter((e) => e.type === 'image' && e.image?.url)
    .sort((a, b) => b.w * b.h - a.w * a.h);

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

  const takeText = (leafRole: string): MagazineElement | undefined => {
    const want = wantedTextRole[leafRole] ?? 'body';
    const list = byRole.get(want);
    if (list && list.length > 0) return list.shift();
    // Nothing of that role left: take the longest remaining loose copy rather than
    // leaving the slot empty and letting pruneSpec delete a box the reference had.
    return loose.shift();
  };

  for (const slot of slots) {
    const fill: LeafFill = {};
    if (slot.role === 'image') {
      const img = images.shift();
      if (img?.image) fill.image = { url: img.image.url, assetId: img.image.assetId ?? '', alt: img.image.alt ?? '' };
    } else if (slot.role === 'qr') {
      const qr = qrs.shift();
      if (qr?.qr) fill.qrUrl = qr.qr.url;
    } else if (slot.role === 'icon') {
      const icon = icons.shift();
      if (icon?.icon?.name) fill.iconName = icon.icon.name;
      if (icon?.icon?.src) fill.iconSrc = icon.icon.src;
      if (icon?.icon?.color) fill.iconColor = icon.icon.color;
    } else if (TEXT_ROLES.has(slot.role)) {
      const el = takeText(slot.role);
      if (el?.text?.content) fill.text = el.text.content;
    }
    // `shape` slots are intentionally left unfilled: they are scrims and panels,
    // painted from the palette by composeFromSolved, never carried content.
    if (Object.keys(fill).length > 0) content[slot.ref] = fill;
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

  return { content, leftOver: { text: spare.length, images: images.length } };
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
  const { content, leftOver } = reflowContent(specContentRefs(spec), page.elements);

  const pruned = pruneLayoutSpec(spec, content);
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
  const fidelity = measureFidelity(solved, converted.origin, dims);
  return { page: { background: composed.background, elements, leftOver, fidelity }, why: '' };
}
