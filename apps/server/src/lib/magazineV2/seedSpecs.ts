// ---------------------------------------------------------------------------
// Magazine Builder v2 — seed layout specs (frame-trees in the DSL).
//
// The FALLBACK designs: when the art-director's output cannot be used (a timeout,
// JSON that will not parse), the page is built from its page type's seed instead of
// from one of eight generic shapes — which is what made a run with a few failed calls
// look like every other magazine. One seed per page type (pageTypes.ts), each a real
// editorial composition in the device vocabulary (layoutSpec.ts): a 12-column grid,
// bleeds, overlapping panels, placed captions, drop caps, ruled pull quotes, sidebars,
// numerals. Every seed is pinned by tests/magazineV2/seedSpecs.test.ts to solve,
// balance, compose and pass layout QA (no collisions, no sliver photos, no dead bands)
// with typical copy.
//
// Content vocabulary (leaf `contentRef`s) follows the copywriter's conventions so the
// right copy is written: kicker, headline, deck, byline, body/body2/body3, caption /
// caption1.., pullquote / pullquote1.. + attribution / attribution1.., hero, photo1..,
// stat1.. (a short figure) + label1.. (its label), entry1.. (a list item), question1.. /
// answer1.., brief1Title / brief1.., sidebarTitle, cta, qr, qrLabel.
//
// `SEED_SPECS` (one per structural kind) is kept for the callers that only know a kind.
// Pure data — no DOM, no LLM, no I/O.
// ---------------------------------------------------------------------------

import { expandSpecDevices, type LayoutSpec, type LayoutNode, type LayoutChild, type LeafNode, type Placement, type Space } from './layoutSpec.js';
import type { PageTemplateKind } from './templates.js';
import { pageTypeFor } from './pageTypes.js';

// ── Builders ────────────────────────────────────────────────────────────────

type LeafOpts = Omit<LeafNode, 'kind' | 'role' | 'contentRef'>;
const leaf = (role: LeafNode['role'], contentRef?: string, o: LeafOpts = {}): LeafNode => ({ kind: 'leaf', role, ...(contentRef ? { contentRef } : {}), ...o });
const hug = (node: LayoutNode, o: Partial<LayoutChild> = {}): LayoutChild => ({ weight: 1, sizing: 'content', node, ...o });
const fr = (node: LayoutNode, weight = 1, o: Partial<LayoutChild> = {}): LayoutChild => ({ weight, sizing: 'fr', node, ...o });
const span = (n: number, node: LayoutNode, o: Partial<LayoutChild> = {}): LayoutChild => ({ span: n, node, ...o });
const col = (children: LayoutChild[], o: { gap?: Space; pad?: Space; justify?: 'start' | 'center' | 'end' | 'between'; place?: Placement } = {}): LayoutNode => ({ kind: 'col', ...o, children });
const row = (children: LayoutChild[], o: { gap?: Space; pad?: Space; grid?: number; align?: 'start' | 'center' | 'end'; place?: Placement } = {}): LayoutNode => ({ kind: 'row', ...o, children });
const grid12 = (children: LayoutChild[], gap: Space = 'md') => row(children, { grid: 12, gap });
const stack = (layers: LayoutNode[], o: { pad?: Space; place?: Placement } = {}): LayoutNode => ({ kind: 'stack', ...o, layers });
const spacer = () => leaf('spacer');
const photo = (ref: string, o: LeafOpts = {}) => leaf('image', ref, { fit: 'cover', ...o });
const panel = (colorRef: LeafNode['colorRef'], o: LeafOpts = {}) => leaf('shape', undefined, { colorRef, ...o });
const rule = (thickness = 3, colorRef: LeafNode['colorRef'] = 'accent') => leaf('shape', undefined, { thickness, colorRef });

// Type voice used across the seeds (sizes in points).
const kicker = (ref = 'kicker', o: LeafOpts = {}) => leaf('kicker', ref, { colorRef: 'accent', caps: true, tracking: 3, fontPt: 9, weightHint: 700, ...o });
const headline = (pt: number, o: LeafOpts = {}, ref = 'headline') => leaf('headline', ref, { fontRef: 'display', fontPt: pt, lineHeight: 1.04, weightHint: 800, ...o });
const deck = (ref = 'deck', o: LeafOpts = {}) => leaf('subhead', ref, { fontPt: 14, lineHeight: 1.35, ...o });
const byline = (ref = 'byline', o: LeafOpts = {}) => leaf('byline', ref, { fontPt: 8.5, caps: true, tracking: 1.5, colorRef: 'primary', ...o });
const body = (ref = 'body', o: LeafOpts = {}) => leaf('body', ref, { fontPt: 10, lineHeight: 1.45, ...o });
const caption = (ref = 'caption', o: LeafOpts = {}) => leaf('caption', ref, { fontPt: 8, lineHeight: 1.3, colorRef: 'secondary', ...o });
const quote = (ref = 'pullquote', pt = 20, o: LeafOpts = {}) => leaf('pullquote', ref, { fontRef: 'display', fontPt: pt, lineHeight: 1.2, align: 'left', weightHint: 700, ...o });
const figure = (ref: string | undefined, pt = 54, o: LeafOpts = {}) => leaf('figure', ref, { fontRef: 'display', fontPt: pt, lineHeight: 1, weightHint: 800, colorRef: 'accent', ...o });
const numeral = (glyph: string, pt = 40, o: LeafOpts = {}) => figure(undefined, pt, { glyph, ...o });
const label = (ref: string, o: LeafOpts = {}) => leaf('label', ref, { fontPt: 9, caps: true, tracking: 1.5, weightHint: 700, ...o });
const entry = (ref: string, o: LeafOpts = {}) => leaf('entry', ref, { fontPt: 10.5, lineHeight: 1.35, weightHint: 500, ...o });

const page = (root: LayoutNode, margin: Space = 'lg', bg: { ref: 'bg' | 'text' | 'primary' | 'secondary' | 'accent' } = { ref: 'bg' }): LayoutSpec => ({ page: { background: bg, margin }, root });

// ── Openers & covers ────────────────────────────────────────────────────────

/** Cover: full-bleed photo, masthead across the top, cover lines anchored at the foot. */
const COVER = page(
  stack([
    photo('hero', { bleed: true }),
    col([
      hug(col([hug(kicker('kicker', { fontPt: 10, colorRef: 'accent' })), hug(headline(84, { colorRef: 'bg', lineHeight: 0.95, caps: true, tracking: -1 }))], { gap: 'xs' })),
      hug(grid12([
        span(7, col([hug(deck('subhead', { colorRef: 'bg', fontPt: 15 })), hug(entry('entry1', { colorRef: 'bg', rule: 'above' })), hug(entry('entry2', { colorRef: 'bg', rule: 'above' })), hug(entry('entry3', { colorRef: 'bg', rule: 'above' }))], { gap: 'sm' })),
        span(5, spacer()),
      ])),
    ], { justify: 'between' }),
  ], { pad: 'xl' }),
  'none',
  { ref: 'text' },
);

/** Feature opener: bleed photo on top, a white panel riding up over its foot. */
const FEATURE_OPENER = page(
  col([
    fr(photo('hero', { bleed: true }), 1),
    hug(
      grid12([
        span(9, stack([panel('bg'), col([hug(kicker()), hug(headline(50)), hug(deck('deck', { fontPt: 15 })), hug(byline())], { gap: 'sm' })], { pad: 'lg' })),
        span(3, spacer()),
      ], 'none'),
      { overlap: 220 },
    ),
  ]),
  'md',
);

/** Photo essay: one edge-to-edge photograph, the words tucked into its lower corner. */
const PHOTO_ESSAY = page(
  stack([
    photo('hero', { bleed: true }),
    col([hug(kicker('kicker', { colorRef: 'accent' })), hug(headline(40, { colorRef: 'bg' })), hug(caption('caption', { colorRef: 'bg', fontPt: 9.5 }))], { gap: 'sm', place: { x: 'start', y: 'end', w: 7, h: 'content', inset: 'xl' } }),
  ]),
  'none',
  { ref: 'text' },
);

/** Sponsor: bleed image, brand line up top, a call-to-action panel with a QR at the foot. */
const SPONSOR = page(
  stack([
    photo('hero', { bleed: true }),
    col([hug(kicker('kicker', { colorRef: 'bg' })), hug(headline(54, { colorRef: 'bg' }))], { gap: 'sm', place: { x: 'start', y: 'start', w: 9, h: 'content', inset: 'xl' } }),
    stack([
      panel('bg'),
      row([
        fr(col([hug(deck('body', { fontPt: 13 })), hug(label('cta', { colorRef: 'accent' }))], { gap: 'sm', justify: 'center' }), 3),
        fr(col([fr(leaf('qr', 'qr')), hug(caption('qrLabel', { align: 'center' }))], { gap: 'xs' }), 1),
      ], { gap: 'lg' }),
    ], { pad: 'lg', place: { x: 'start', y: 'end', w: 12, h: 'content', inset: 'xl' } }),
  ]),
  'none',
  { ref: 'text' },
);

/** Back cover: calm photo above a colour band that bleeds; sign-off and QR low. */
const BACK_COVER = page(
  col([
    fr(photo('hero', { bleed: true }), 1),
    hug(stack([
      panel('primary', { bleed: true }),
      grid12([
        span(8, col([hug(headline(36, { colorRef: 'bg' }, 'headline')), hug(body('body', { colorRef: 'bg' }))], { gap: 'sm' })),
        span(4, col([hug(row([fr(leaf('qr', 'qr'), 1), fr(caption('qrLabel', { colorRef: 'bg' }), 1)], { gap: 'sm' }))], { justify: 'end' })),
      ], 'lg'),
    ], { pad: 'xl' })),
  ]),
  'none',
  { ref: 'primary' },
);

// ── Contents & letters ──────────────────────────────────────────────────────

/** Contents: an 8-col title, a bleed photo band, then the list in two ruled columns. */
const CONTENTS = page(
  col([
    hug(grid12([span(8, col([hug(kicker()), hug(headline(56))], { gap: 'sm' })), span(4, col([hug(caption())], { justify: 'end' }))], 'lg')),
    fr(photo('photo1', { bleed: true })),
    hug(grid12([
      span(6, col([hug(entry('entry1', { rule: 'above' })), hug(entry('entry2', { rule: 'above' })), hug(entry('entry3', { rule: 'above' }))], { gap: 'md' })),
      span(6, col([hug(entry('entry4', { rule: 'above' })), hug(entry('entry5', { rule: 'above' })), hug(entry('entry6', { rule: 'above' }))], { gap: 'md' })),
    ], 'lg')),
  ], { gap: 'lg' }),
);

/** Editor's letter: title beside a portrait, then the letter in 8 cols with a drop cap
 *  and the sign-off in the margin column. */
const EDITORS_LETTER = page(
  col([
    fr(grid12([
      span(5, col([hug(kicker()), hug(headline(46)), hug(deck('deck', { fontPt: 14 }))], { gap: 'sm', justify: 'end' })),
      span(7, photo('photo1', { bleed: true })),
    ], 'lg'), 1),
    hug(rule(2, 'text')),
    hug(grid12([
      span(8, body('body', { dropCap: true, fontPt: 10.5 })),
      span(4, col([hug(quote('pullquote', 13, { colorRef: 'primary', rule: 'above' })), hug(caption()), hug(byline('byline', { rule: 'above' }))], { gap: 'lg', justify: 'between' })),
    ], 'lg')),
  ], { gap: 'md' }),
);

// ── Articles ────────────────────────────────────────────────────────────────

/** Feature article: headline block, a bleed photo band, two columns with a drop cap and
 *  an inline ruled pull quote. */
const FEATURE_ARTICLE = page(
  col([
    hug(grid12([span(8, col([hug(kicker()), hug(headline(40))], { gap: 'sm' })), span(4, col([hug(deck('deck', { fontPt: 12.5 }))], { justify: 'end' }))], 'lg')),
    fr(photo('photo1', { bleed: true }), 4),
    hug(caption()),
    fr(grid12([
      span(6, body('body', { dropCap: true })),
      span(6, col([fr(body('body2')), hug(quote('pullquote', 18, { colorRef: 'primary', rule: 'both' })), hug(byline('attribution', { colorRef: 'secondary' }))], { gap: 'sm' })),
    ], 'lg'), 6),
  ], { gap: 'md' }),
);

/** Long read: three text columns under a ruled head, a small spot photo in the middle one. */
const LONG_READ = page(
  col([
    hug(kicker()),
    hug(headline(38)),
    hug(deck('deck', { fontPt: 13, rule: 'below' })),
    fr(grid12([
      span(4, body('body', { dropCap: true, fontPt: 9.5 })),
      span(4, col([fr(photo('photo1')), hug(caption()), fr(body('body2', { fontPt: 9.5 }), 2)], { gap: 'sm' })),
      span(4, col([hug(leaf('subhead', 'subhead', { fontPt: 12, weightHint: 700, colorRef: 'primary' })), fr(body('body3', { fontPt: 9.5 }))], { gap: 'sm' })),
    ], 'md')),
  ], { gap: 'md' }),
);

/** Profile: a 7-col portrait that bleeds, the story in 5 cols with a boxed fact sidebar. */
const PROFILE = page(
  grid12([
    span(7, col([fr(photo('hero', { bleed: true })), hug(caption())], { gap: 'sm' })),
    span(5, col([
      hug(kicker()),
      hug(headline(40)),
      hug(deck('deck', { fontPt: 13 })),
      fr(body('body')),
      hug(stack([panel('secondary', { opacity: 0.12 }), col([hug(label('sidebarTitle', { colorRef: 'primary' })), hug(entry('entry1', { fontPt: 9.5 })), hug(entry('entry2', { fontPt: 9.5 })), hug(entry('entry3', { fontPt: 9.5 }))], { gap: 'sm' })], { pad: 'md' })),
    ], { gap: 'md' })),
  ], 'lg'),
);

/** Interview: title beside a bleed portrait, a ruled standout quote, then Q&A in two columns. */
const qa = (n: number) => col([hug(leaf('subhead', `question${n}`, { fontPt: 11, weightHint: 700, colorRef: 'accent' })), fr(body(`answer${n}`))], { gap: 'xs' });
const INTERVIEW_QA = page(
  col([
    fr(grid12([
      span(7, col([hug(kicker()), hug(headline(42)), hug(deck('deck', { fontPt: 13 }))], { gap: 'sm', justify: 'end' })),
      span(5, photo('photo1', { bleed: true })),
    ], 'lg'), 3),
    hug(stack([panel('accent', { opacity: 0.14 }), grid12([span(10, quote('pullquote', 18, { colorRef: 'primary', rule: 'left' })), span(2, spacer())])], { pad: 'md' })),
    fr(grid12([
      span(6, col([fr(qa(1)), fr(qa(2))], { gap: 'md' })),
      span(6, col([fr(qa(3)), fr(qa(4))], { gap: 'md' })),
    ], 'lg'), 5),
  ], { gap: 'md' }),
);

/** Feature with sidebar: photo across the top, two columns plus a tinted sidebar. */
const SIDEBAR_FEATURE = page(
  col([
    fr(photo('hero', { bleed: true }), 3),
    hug(col([hug(kicker()), hug(headline(38)), hug(deck('deck', { fontPt: 13 }))], { gap: 'sm' })),
    fr(grid12([
      span(4, body('body', { dropCap: true })),
      span(4, body('body2')),
      span(4, stack([panel('secondary', { opacity: 0.12 }), col([hug(label('sidebarTitle', { colorRef: 'primary' })), hug(entry('entry1', { fontPt: 9.5 })), hug(entry('entry2', { fontPt: 9.5 })), hug(entry('entry3', { fontPt: 9.5 })), hug(entry('entry4', { fontPt: 9.5 }))], { gap: 'sm' })], { pad: 'md' })),
    ], 'md'), 5),
  ], { gap: 'md' }),
);

/** News in brief: a lead item with a photo, then three ruled briefs. */
const NEWS_BRIEFS = page(
  col([
    hug(kicker()),
    hug(headline(40, { rule: 'below' })),
    fr(grid12([
      span(7, photo('photo1')),
      span(5, col([hug(leaf('subhead', 'brief1Title', { fontPt: 16, weightHint: 700, fontRef: 'display' })), fr(body('brief1'))], { gap: 'sm' })),
    ], 'lg'), 5),
    fr(grid12([
      span(4, col([hug(leaf('subhead', 'brief2Title', { fontPt: 12.5, weightHint: 700, rule: 'above' })), fr(body('brief2', { fontPt: 9.5 }))], { gap: 'sm' })),
      span(4, col([hug(leaf('subhead', 'brief3Title', { fontPt: 12.5, weightHint: 700, rule: 'above' })), fr(body('brief3', { fontPt: 9.5 }))], { gap: 'sm' })),
      span(4, col([hug(leaf('subhead', 'brief4Title', { fontPt: 12.5, weightHint: 700, rule: 'above' })), fr(body('brief4', { fontPt: 9.5 }))], { gap: 'sm' })),
    ], 'lg'), 4),
  ], { gap: 'md' }),
);

/** How-to: intro beside a photo, then numbered steps in a 2×2 grid. */
const step = (n: number) => row([hug(numeral(String(n), 44)), fr(entry(`entry${n}`))], { gap: 'md' });
const HOW_TO = page(
  col([
    hug(kicker()),
    hug(headline(42)),
    fr(grid12([span(5, col([fr(body('body'))], {})), span(7, photo('photo1'))], 'lg'), 4),
    hug(grid12([span(6, step(1)), span(6, step(2))], 'lg')),
    hug(grid12([span(6, step(3)), span(6, step(4))], 'lg')),
  ], { gap: 'lg' }),
);

/** Guide: a large photo beside a numbered key. */
const key = (n: number) => hug(row([hug(numeral(String(n), 26)), fr(entry(`entry${n}`, { fontPt: 10 }))], { gap: 'sm' }));
const GUIDE = page(
  grid12([
    span(7, photo('hero', { bleed: true })),
    span(5, col([hug(kicker()), hug(headline(38)), hug(body('body')), key(1), key(2), key(3), key(4), key(5)], { gap: 'md', justify: 'between' })),
  ], 'lg'),
);

// ── Pictures ────────────────────────────────────────────────────────────────

/** Mosaic: one dominant photo and four of varied shape, captions in a ruled column. */
const MOSAIC_GALLERY = page(
  col([
    hug(grid12([span(7, col([hug(kicker()), hug(headline(40))], { gap: 'sm' })), span(5, col([hug(deck('deck', { fontPt: 12.5 }))], { justify: 'end' }))], 'lg')),
    fr(grid12([span(7, photo('photo1')), span(5, col([fr(photo('photo2')), fr(photo('photo3'))], { gap: 'sm' }))], 'sm'), 6),
    fr(grid12([span(4, photo('photo4')), span(5, photo('photo5')), span(3, col([hug(caption('caption', { rule: 'above', fontPt: 8.5 }))], { justify: 'end' }))], 'sm'), 3),
  ], { gap: 'sm' }),
  'md',
);

/** Photo grid: an even 2×2 grid, a caption under each photo. */
const cell = (n: number) => col([fr(photo(`photo${n}`)), hug(caption(`caption${n}`))], { gap: 'xs' });
const PHOTO_GRID = page(
  col([
    hug(kicker()),
    hug(headline(40)),
    hug(deck('deck', { fontPt: 13 })),
    fr(grid12([span(6, cell(1)), span(6, cell(2))], 'md')),
    fr(grid12([span(6, cell(3)), span(6, cell(4))], 'md')),
  ], { gap: 'md' }),
);

/** Spotlight: four equal cards — photo, name + description, key figure. */
const card = (n: number) => col([fr(photo(`photo${n}`)), hug(entry(`entry${n}`, { fontPt: 10 })), hug(figure(`stat${n}`, 18))], { gap: 'xs' });
const SPOTLIGHT = page(
  col([
    hug(kicker()),
    hug(headline(40)),
    fr(grid12([span(6, card(1)), span(6, card(2))], 'lg')),
    fr(grid12([span(6, card(3)), span(6, card(4))], 'lg')),
  ], { gap: 'md' }),
);

// ── Quotes ──────────────────────────────────────────────────────────────────

/** Quote page: a bleed photo above an oversized quotation hung on a giant quote mark. */
const PULL_QUOTE = page(
  col([
    fr(photo('hero', { bleed: true })),
    hug(grid12([
      span(2, col([hug(numeral('“', 150, { lineHeight: 0.8 }))])),
      span(10, col([hug(quote('pullquote', 30, { lineHeight: 1.15 })), hug(byline('attribution', { rule: 'above' }))], { gap: 'md' })),
    ], 'md')),
  ], { gap: 'xl' }),
  'xl',
);

/** Quote wall: three voices at different sizes, staggered around a photo. */
const QUOTE_WALL = page(
  col([
    hug(kicker()),
    hug(headline(40)),
    fr(grid12([
      span(7, stack([panel('secondary', { opacity: 0.1 }), col([hug(quote('pullquote1', 18, { rule: 'left' })), hug(byline('attribution1'))], { gap: 'sm', justify: 'center' })], { pad: 'lg' })),
      span(5, photo('photo1', { bleed: true })),
    ], 'md'), 5),
    fr(grid12([
      span(5, photo('photo2', { bleed: true })),
      span(7, stack([panel('accent', { opacity: 0.16 }), col([hug(quote('pullquote2', 19)), hug(byline('attribution2'))], { gap: 'sm', justify: 'center' })], { pad: 'lg' })),
    ], 'md'), 4),
    hug(grid12([span(9, col([hug(quote('pullquote3', 15, { colorRef: 'primary', rule: 'above' })), hug(byline('attribution3'))], { gap: 'sm' })), span(3, spacer())])),
  ], { gap: 'md' }),
);

// ── Numbers ─────────────────────────────────────────────────────────────────

/** Numbers page: a bleed photo band, then six figures on ruled tiles. */
const statTile = (n: number) => col([hug(rule(3)), hug(figure(`stat${n}`, 50)), hug(label(`label${n}`, { caps: false, tracking: 0, fontPt: 9.5, weightHint: 500 }))], { gap: 'sm' });
const STAT_INFOGRAPHIC = page(
  col([
    hug(kicker()),
    hug(headline(42)),
    hug(deck('deck', { fontPt: 13 })),
    fr(photo('hero', { bleed: true })),
    hug(grid12([span(4, statTile(1)), span(4, statTile(2)), span(4, statTile(3))], 'lg')),
    hug(grid12([span(4, statTile(4)), span(4, statTile(5)), span(4, statTile(6))], 'lg')),
  ], { gap: 'md' }),
);

/** Data story: horizontal bars drawn as shapes (value at the bar's end), then the
 *  explanation beside a photo. */
const bar = (n: number, share: number) =>
  hug(grid12([
    span(3, col([hug(label(`label${n}`, { caps: false, tracking: 0, fontPt: 9.5, weightHint: 600 }))], { justify: 'center' })),
    span(9, row([
      fr(stack([panel(n === 1 ? 'accent' : 'primary'), figure(`stat${n}`, 18, { colorRef: 'bg', place: { x: 'end', y: 'center', h: 'content', inset: 'sm' } })]), share),
      ...(share < 10 ? [fr(spacer(), 10 - share)] : []),
    ])),
  ], 'md'), { minPx: 84 });
const DATA_SPREAD = page(
  col([
    hug(kicker()),
    hug(headline(42)),
    hug(col([bar(1, 10), bar(2, 8), bar(3, 7), bar(4, 5), bar(5, 4)], { gap: 'sm' })),
    fr(grid12([span(5, col([fr(body('body')), hug(caption('caption', { rule: 'above' }))], { gap: 'md' })), span(7, photo('photo1', { bleed: true }))], 'lg')),
  ], { gap: 'lg' }),
);

/** Results: alternate-tinted table rows with the position in the accent colour. */
const resultRow = (n: number) => {
  const r = grid12([span(1, numeral(String(n), 18)), span(11, entry(`entry${n}`, { fontPt: 10.5 }))], 'sm');
  return hug(n % 2 === 1 ? stack([panel('secondary', { opacity: 0.1 }), r], { pad: 'sm' }) : col([hug(r)], { pad: 'sm' }));
};
const RESULTS_TABLE = page(
  col([
    hug(grid12([span(8, col([hug(kicker()), hug(headline(42))], { gap: 'sm' })), span(4, col([hug(deck('deck', { fontPt: 12 }))], { justify: 'end' }))], 'lg')),
    fr(photo('hero', { bleed: true })),
    hug(col([resultRow(1), resultRow(2), resultRow(3), resultRow(4), resultRow(5), resultRow(6), resultRow(7), resultRow(8)])),
    hug(caption('caption')),
  ], { gap: 'md' }),
);

/** Timeline: a bleed photo band, then dated milestones on tinted, ruled cards in two
 *  rows of three, in reading order. */
const milestone = (n: number) =>
  stack([panel('secondary', { opacity: n % 2 ? 0.1 : 0.16 }), col([hug(figure(`stat${n}`, 30, { rule: 'above' })), hug(label(`label${n}`, { caps: false, tracking: 0, fontPt: 10, weightHint: 500 }))], { gap: 'sm', justify: 'center' })], { pad: 'md' });
const TIMELINE = page(
  col([
    hug(grid12([span(8, col([hug(kicker()), hug(headline(42))], { gap: 'sm' })), span(4, col([hug(deck('deck', { fontPt: 12 }))], { justify: 'end' }))], 'lg')),
    fr(photo('photo1', { bleed: true }), 3),
    hug(caption()),
    fr(grid12([span(4, milestone(1)), span(4, milestone(2)), span(4, milestone(3))], 'sm'), 2),
    fr(grid12([span(4, milestone(4)), span(4, milestone(5)), span(4, milestone(6))], 'sm'), 2),
  ], { gap: 'md' }),
);

/** Calendar: accent date blocks, each event on a tinted row, under a bleed photo band. */
const event = (n: number) =>
  hug(stack([
    panel('secondary', { opacity: n % 2 ? 0.1 : 0.05 }),
    grid12([
      span(3, stack([panel('accent'), figure(`stat${n}`, 24, { colorRef: 'bg', align: 'center', place: { y: 'center', h: 'content' } })], { pad: 'sm' })),
      span(9, col([hug(entry(`entry${n}`)), hug(caption(`label${n}`, { fontPt: 8.5 }))], { gap: 'xs', justify: 'center' })),
    ], 'md'),
  ], { pad: 'sm' }), { minPx: 96 });
const CALENDAR = page(
  col([
    hug(kicker()),
    hug(headline(42)),
    fr(photo('hero', { bleed: true })),
    hug(col([event(1), event(2), event(3), event(4), event(5)], { gap: 'xs' })),
  ], { gap: 'md' }),
);

// ── Registry ────────────────────────────────────────────────────────────────

/** One seed per page type (pageTypes.ts ids). */
export const PAGE_TYPE_SEEDS: Record<string, LayoutSpec> = {
  cover: COVER,
  contents: CONTENTS,
  'editors-letter': EDITORS_LETTER,
  'feature-opener': FEATURE_OPENER,
  'feature-article': FEATURE_ARTICLE,
  'long-read': LONG_READ,
  profile: PROFILE,
  'interview-qa': INTERVIEW_QA,
  'photo-essay': PHOTO_ESSAY,
  'mosaic-gallery': MOSAIC_GALLERY,
  'photo-grid': PHOTO_GRID,
  'pull-quote': PULL_QUOTE,
  'quote-wall': QUOTE_WALL,
  'stat-infographic': STAT_INFOGRAPHIC,
  'data-spread': DATA_SPREAD,
  'results-table': RESULTS_TABLE,
  timeline: TIMELINE,
  calendar: CALENDAR,
  guide: GUIDE,
  'news-briefs': NEWS_BRIEFS,
  'sidebar-feature': SIDEBAR_FEATURE,
  'how-to': HOW_TO,
  spotlight: SPOTLIGHT,
  sponsor: SPONSOR,
  'back-cover': BACK_COVER,
};

/** One seed per structural kind, for the callers that only know a kind. */
export const SEED_SPECS: Record<PageTemplateKind, LayoutSpec> = {
  cover: COVER,
  contents: CONTENTS,
  'feature-full-bleed': FEATURE_OPENER,
  'two-column-article': FEATURE_ARTICLE,
  'photo-grid': PHOTO_GRID,
  'pull-quote': PULL_QUOTE,
  'stat-infographic': STAT_INFOGRAPHIC,
  'back-cover': BACK_COVER,
};

/** The seed frame-tree for a page kind (offline fallback for the AI path), sugar expanded. */
export function seedSpecFor(kind: PageTemplateKind): LayoutSpec {
  return expandSpecDevices(structuredClone(SEED_SPECS[kind] ?? FEATURE_ARTICLE));
}

/** The seed for a plan page: its page type's own design, else its kind's. A fresh copy
 *  with its sugar expanded, so the caller may mutate it. */
export function seedSpecForPage(page: { kind: PageTemplateKind; pageType?: string }): LayoutSpec {
  const type = pageTypeFor(page);
  const seed = PAGE_TYPE_SEEDS[type.id] ?? SEED_SPECS[page.kind] ?? FEATURE_ARTICLE;
  return expandSpecDevices(structuredClone(seed));
}
