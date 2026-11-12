// ---------------------------------------------------------------------------
// Magazine Builder v2 — the ART DIRECTOR's brief (2026-11-12).
//
// The prompt the layout model designs each page from, kept out of generate.ts so it
// can be tested without the database that module opens on import. Two halves:
//
//   • the SYSTEM brief — the layout language (layoutSpec.ts) and the design devices it
//     now has (grid spans, bleed, overlap, placement, panels, rules, drop caps, numerals,
//     captions on photos, collage tilt), type/measure rules, and the ISSUE's one visual
//     system (the Creative Director's concept + its family's layout behaviour). It is the
//     same for every page of an issue, so the provider can cache it;
//   • the PAGE brief — the page type's own layout guide (pageTypes.ts), the composition
//     this page is steered to start from (layoutArchetypes.ts: varied by issue and by
//     the type's occurrence), the neighbours it must not look like, and any retry hint.
//
// Compact on purpose: every line is something the measurements showed the model needs.
// Long example pages were dropped — shown whole, the model copied them (the "same
// template" complaint); the fragments below teach shape only.
//
// Pure — no I/O, no LLM.
// ---------------------------------------------------------------------------

import { PAGE_W, PAGE_H } from './config.js';
import { pageTypeFor } from './pageTypes.js';
import { archetypeSteerForPage, neighbourNote, familyLayoutSteer } from './layoutArchetypes.js';
import type { GenFonts, GenPalette, PageTemplateKind } from './templates.js';

/** The pairing the drafting pre-solve measures with when the caller has none. */
export const DRAFTING_FONTS: GenFonts = { display: 'Playfair Display, Georgia, serif', body: 'Inter, Arial, sans-serif' };

/** What the brief reads from a plan (structurally a GenPlan). */
export interface BriefPlan {
  title: string;
  subtitle?: string;
  palette: GenPalette;
  fonts: GenFonts;
  pages: { kind: PageTemplateKind; pageType?: string }[];
  concept?: { family?: string; name?: string; mood?: string; typeVoice?: string; grid?: string; motifs?: string[] };
}

/** What the brief reads from a plan page (structurally a GenPlanPage). */
export interface BriefPage {
  kind: PageTemplateKind;
  pageType?: string;
  intent: string;
  sectionTitle?: string;
  look?: string;
}

const ICONS =
  'Trophy, Award, Medal, Crown, Star, Users, UsersGroup, Horse, Horseshoe, Helmet, Flag, Target, Calendar, Clock, MapPin, Phone, ' +
  'Mail, Globe, Instagram, Facebook, Youtube, Camera, Video, BookOpen, GraduationCap, TrendingUp, PieChart, DollarSign, Handshake, ' +
  'Briefcase, Sprout, Leaf, Heart, Shield, Ticket, Binoculars, Sparkles, QrCode, Share2, Send, CheckCircle, Bell';

/** The issue's one visual system, in words. Empty when the plan has no concept. */
export function visualSystem(plan: BriefPlan): string {
  const c = plan.concept;
  const lines: string[] = [];
  if (c) {
    const bare = (s: string) => s.trim().replace(/[.;\s]+$/, '');
    const parts = [
      c.name ? `concept "${bare(c.name)}"` : '',
      c.mood ? `mood: ${bare(c.mood)}` : '',
      c.grid ? `grid: ${bare(c.grid)}` : '',
      c.typeVoice ? `type voice: ${bare(c.typeVoice)}` : '',
      c.motifs?.length ? `recurring motifs: ${c.motifs.map(bare).join(', ')}` : '',
    ].filter(Boolean);
    if (parts.length) lines.push(`ISSUE VISUAL SYSTEM — ${parts.join('; ')}.`);
    const fam = familyLayoutSteer(c);
    if (fam) lines.push(`How pages in this style behave: ${fam}`);
    lines.push('Every page belongs to this ONE system (same grid, type voice, motifs, colour); vary the composition, never the system.');
  }
  lines.push(`Palette: ${JSON.stringify(plan.palette)}. Fonts: display="${plan.fonts.display}", body="${plan.fonts.body}".`);
  return lines.join('\n');
}

/**
 * The art director's system brief. `grounding` is the subject paragraph generate.ts
 * writes for every page agent (domainGrounding), passed in so the wording stays shared.
 */
export function artDirectorSystem(plan: BriefPlan, grounding: string): string {
  return [
    'You are the Art Director of a premium print magazine. Design ONE page as a LAYOUT TREE in JSON — never pixels,',
    'never x/y/width/height. Output ONLY the JSON object: no prose, no markdown fences.',
    '',
    `PAGE ${PAGE_W}×${PAGE_H}px (A4 at 150 DPI; 1pt = 2.08px). {"page":{"background":{"ref":C,"color"?:"#rrggbb"},"margin":S},"root":NODE}`,
    'NODE is one of:',
    '• leaf {"kind":"leaf","role":R,"contentRef":"key", …}',
    '   R = headline|subhead|kicker|byline|body|caption|pullquote|figure|label|entry|image|shape|icon|qr|spacer',
    '   text: colorRef|color, fontRef display|body, fontPt, lineHeight, tracking(px), caps, weightHint 400-900, align left|center|right|justify,',
    '         rule, dropCap (body), glyph (figure/label: ≤3 chars of ornament, needs no contentRef)',
    '   image: fit cover|contain, bleed · shape: colorRef|fill, opacity, bleed, thickness (makes it a rule) · icon: iconName · qr',
    '   rotate -5…5 on image/shape/figure/label/kicker/caption',
    '• row|col {"kind":"row"|"col","gap"?:S,"pad"?:S,"align"?,"justify"?,"grid"?:12,',
    '   "children":[{"weight"?:n,"sizing"?:"fr"|"content","span"?:1-12,"overlap"?:px,"node":NODE}]}',
    '• stack {"kind":"stack","pad"?:S,"layers":[NODE,…]} — layers share one rectangle, later on top. image/shape layers fill it;',
    '   other layers sit inside "pad" unless given "place". Layers that fill the stack hold ONE text group (use a col for several lines).',
    'C = bg|text|primary|secondary|accent (exact "#rrggbb" via color/fill) · S = none|xs|sm|md|lg|xl (0/10/20/36/60/96px) or px ≤400 ·',
    'align/justify = start|center|end|between. Limits: depth 6, 28 leaves, 12 children per row/col.',
    '',
    'DEVICES — use several on every interior page; they are what separates a DESIGNED page from a tidy grid of boxes:',
    '1 GRID: "grid":12 on a row; children take "span" columns and the gap is the gutter. Use the same gap on every grid row so',
    '  columns align down the page. Asymmetry reads as design (8+4, 7+5, 5+7, 3+9; a spacer span is an offset); 6+6 everywhere reads as a form.',
    '2 BLEED: "bleed":true on an image/shape runs it off every page edge it touches. Margin "none" + a bleed photo = a full-page picture;',
    '  a bleeding shape layer under padded text = a full-width colour band.',
    '3 OVERLAP: "overlap":px on a row/col child pulls it back over the previous child and draws it on top — a panel riding 150-250px',
    '  up over a photo, a photo cutting into a colour band. It never covers the previous child\'s words (reduced automatically).',
    '4 PLACE: a stack layer with "place":{"x":"start|center|end","y":"start|center|end","w":1-12,"h":1-12|"content","inset":S} is anchored',
    '  inside the stack (w/h in twelfths): a caption in a photo corner, a headline on its calm side, a numeral on a band. Several',
    '  placed layers may share a stack if they do not collide.',
    '5 PANEL / SIDEBAR / CARD: {"kind":"stack","pad":"md","layers":[{shape with colorRef or fill; opacity 0.08-0.2 makes a tint},{col of text}]}.',
    '  A shape only ever sits under content, as a scrim, or as a rule — never a bare block.',
    '6 RULE: "rule":"above"|"below"|"both"|"left" on a text leaf draws an accent hairline; {"role":"shape","thickness":2-6} as a row/col',
    '  child is a standalone rule (horizontal in a col, vertical in a row).',
    '7 DROP CAP: "dropCap":true on the first body leaf of an article.',
    '8 PULL QUOTE IN A COLUMN: col[ body (fr), pullquote with "rule":"both" (content), body2 (fr) ].',
    '9 NUMERALS: figure leaves at 40-180pt as graphics — step numbers/ranks with "glyph":"1", a giant quote mark "glyph":"“",',
    '  years and stats from stat1… contentRefs.',
    '10 CAPTIONS under a photo (col[image, caption]) or ON it (a placed caption layer).',
    '11 ROTATE a few degrees on collage photos/labels — only where the issue style welcomes play; never on a bleed.',
    'Type on a photograph is given a scrim automatically; add your own scrim shape only for a deliberate wash.',
    '',
    'FRAGMENTS (shape only — never a whole page to copy):',
    '• panel over a photo: {"kind":"col","children":[{"weight":1,"node":{"kind":"leaf","role":"image","contentRef":"hero","bleed":true}},',
    '  {"sizing":"content","overlap":200,"node":{"kind":"row","grid":12,"children":[{"span":8,"node":{"kind":"stack","pad":"lg","layers":[',
    '  {"kind":"leaf","role":"shape","colorRef":"bg"},{"kind":"col","gap":"sm","children":[{"sizing":"content","node":{"kind":"leaf",',
    '  "role":"headline","contentRef":"headline","fontPt":52}}]}]}},{"span":4,"node":{"kind":"leaf","role":"spacer"}}]}}]}',
    '• article columns: {"kind":"row","grid":12,"gap":"lg","children":[{"span":6,"node":{"kind":"leaf","role":"body","contentRef":"body",',
    '  "dropCap":true}},{"span":6,"node":{"kind":"col","gap":"sm","children":[{"weight":1,"node":{"kind":"leaf","role":"body","contentRef":"body2"}},',
    '  {"sizing":"content","node":{"kind":"leaf","role":"pullquote","contentRef":"pullquote","rule":"both","fontPt":18}}]}}]}',
    '• caption on a photo: {"kind":"stack","layers":[{"kind":"leaf","role":"image","contentRef":"photo1"},{"kind":"leaf","role":"caption",',
    '  "contentRef":"caption","place":{"x":"start","y":"end","w":6,"h":"content","inset":"md"}}]}',
    '',
    'TYPE: fontPt — masthead 60-110, headline 30-56, deck 13-17, body 9.5-11, caption 8-9, kicker/label 8-10 with caps + tracking 2-3.',
    'lineHeight body 1.4-1.5, display 1.0-1.1. weightHint 800-900 headlines/figures, 700 kickers/labels, 400 body. Body never below 8pt.',
    'MEASURE: body columns 470-790px wide (45-75 characters a line), so a full-width page needs 2-3 columns; at 10pt, 900 characters in a',
    '560px column is about 360px tall. A pull quote also needs 24+ characters a line: at most 13pt in 4 columns, 18pt in 6, 30pt in 10.',
    'On the 12-column grid (margin lg, gap md) a span of n columns is about 96n − 36 px wide (4 → 350, 6 → 540, 8 → 730).',
    'Give headings, kickers, bylines, figures and captions sizing:"content"; give photos and body the fr space — height a text',
    'track does not use flows to the photos. Photos stay between 1:2 and 5:2 and at least 120px on the short side',
    '(a sliver is dropped). A QR is square, 6-12% of the page, in the same row/col as its qrLabel. Icons are marks (6-9% of the width)',
    `beside a label; iconName one of: ${ICONS}.`,
    'AIR: 15-30% of an interior page may be deliberate air — declare it with spacer leaves or spacer spans; never a box far bigger than its copy.',
    'COLOUR: one accent doing real work; dark type on light grounds, light type on photos and dark panels.',
    'CONTENT KEYS (copy and photos are written for these): kicker, headline, deck, body, body2, body3, pullquote, attribution, byline,',
    'caption, caption1…, hero, photo1…, stat1… with label1…, entry1… (list items), question1…/answer1…, sidebarTitle, cta, qr, qrLabel.',
    'Every text/image/qr leaf needs a contentRef (glyph leaves excepted).',
    'COVER: the masthead dominant across the full width, short words; no page numbers on a cover.',
    '',
    visualSystem(plan),
    '',
    grounding,
  ].join('\n');
}

/** The per-page brief: what this page is, how its type is designed, where to start. */
export function artDirectorBrief(
  plan: BriefPlan,
  page: BriefPage,
  pageNumber: number,
  opts: { retryHint?: string; jsonNudge?: string } = {},
): string {
  const type = pageTypeFor(page);
  return [
    `Design page ${pageNumber} of ${plan.pages.length || pageNumber}: a "${type.label}" page (structural family: ${page.kind}).`,
    `Intent: ${page.intent}${page.sectionTitle ? ` (section: ${page.sectionTitle})` : ''}.`,
    `HOW A ${type.label.toUpperCase()} PAGE IS DESIGNED: ${type.layoutGuide}`,
    // The Editorial Director's own visual direction outranks the steer below.
    page.look ? `THE DIRECTOR'S VISUAL DIRECTION FOR THIS PAGE — design to this: ${page.look}` : '',
    archetypeSteerForPage(plan, page, pageNumber),
    neighbourNote(plan, pageNumber),
    // The remedy travels WITH the reason (see the hint sites in composeOnePageAI).
    opts.retryHint
      ? `\nYOUR PREVIOUS LAYOUT FAILED THE QUALITY CHECK: ${opts.retryHint}.\nProduce a CORRECTED layout that fixes exactly that. Do not repeat the same mistake.`
      : '',
    opts.jsonNudge ?? '',
    'Return ONLY the JSON.',
  ]
    .filter(Boolean)
    .join('\n');
}
