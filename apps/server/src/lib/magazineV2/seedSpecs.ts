// ---------------------------------------------------------------------------
// Magazine Builder v2 — seed layout specs (frame-trees in the DSL).
//
// The 8 canonical page kinds re-expressed as AI-authored-style LayoutSpecs.
// Triple duty:
//   1. Few-shot EXEMPLARS shown to the Art-Director agent (so it emits the DSL
//      in the right shape/idiom instead of inventing structure from nothing).
//   2. Offline FALLBACK: when the flag is on but the agent errors, the pipeline
//      still gets a real frame-tree per kind (then the template path is the
//      final SAFE net beneath that).
//   3. Parity FIXTURES: these mirror templates.ts, so a spec → solve → compose
//      page is comparable to the fixed-template page for the same kind.
//
// Content vocabulary (leaf `contentRef`s these use) is deliberately the same
// role-keyed set the drafting agent already produces: kicker, headline, subhead,
// byline, body, body2, caption, pullquote, attribution, hero, photo1..4, qr,
// stat1..3 / label1..3, entry1..5, cta, qrLabel. The 6c content resolver maps
// the page draft onto these keys.
//
// Authored as typed LayoutSpec objects (compile-time token/role checking) — they
// are valid by construction; a temp test also solves+composes each to confirm.
// Pure data — no DOM, no LLM, no I/O.
// ---------------------------------------------------------------------------

import type { LayoutSpec } from './layoutSpec.js';
import type { PageTemplateKind } from './templates.js';

// ── cover: full-bleed hero, bottom scrim, kicker / big title / subtitle / qr ──
const COVER: LayoutSpec = {
  page: { background: { ref: 'text' }, margin: 'none' },
  root: {
    kind: 'stack',
    layers: [
      { kind: 'leaf', role: 'image', contentRef: 'hero', fit: 'cover' },
      {
        kind: 'col',
        pad: 'xl',
        justify: 'end',
        gap: 'sm',
        children: [
          { sizing: 'content', node: { kind: 'leaf', role: 'kicker', contentRef: 'kicker', colorRef: 'accent', fontRef: 'body', weightHint: 700 } },
          { sizing: 'content', node: { kind: 'leaf', role: 'headline', contentRef: 'headline', colorRef: 'bg', fontRef: 'display', weightHint: 800 } },
          { sizing: 'content', node: { kind: 'leaf', role: 'subhead', contentRef: 'subhead', colorRef: 'bg', fontRef: 'body' } },
        ],
      },
    ],
  },
};

// ── feature-full-bleed: edge-to-edge photo, kicker / headline / deck / byline ─
const FEATURE_FULL_BLEED: LayoutSpec = {
  page: { background: { ref: 'text' }, margin: 'none' },
  root: {
    kind: 'stack',
    layers: [
      { kind: 'leaf', role: 'image', contentRef: 'hero', fit: 'cover' },
      {
        kind: 'col',
        pad: 'xl',
        justify: 'end',
        gap: 'sm',
        children: [
          { sizing: 'content', node: { kind: 'leaf', role: 'kicker', contentRef: 'kicker', colorRef: 'accent', fontRef: 'body', weightHint: 700 } },
          { sizing: 'content', node: { kind: 'leaf', role: 'headline', contentRef: 'headline', colorRef: 'bg', fontRef: 'display', weightHint: 800 } },
          { sizing: 'content', node: { kind: 'leaf', role: 'body', contentRef: 'body', colorRef: 'bg', fontRef: 'body' } },
          { sizing: 'content', node: { kind: 'leaf', role: 'byline', contentRef: 'byline', colorRef: 'accent', fontRef: 'body', weightHint: 700 } },
        ],
      },
    ],
  },
};

// ── two-column-article: header block, photo, then two body columns ────────────
const TWO_COLUMN_ARTICLE: LayoutSpec = {
  page: { background: { ref: 'bg' }, margin: 'lg' },
  root: {
    kind: 'col',
    gap: 'md',
    children: [
      { sizing: 'content', node: { kind: 'leaf', role: 'kicker', contentRef: 'kicker', colorRef: 'accent', fontRef: 'body', weightHint: 700 } },
      { sizing: 'content', node: { kind: 'leaf', role: 'headline', contentRef: 'headline', colorRef: 'text', fontRef: 'display', weightHint: 700 } },
      { sizing: 'content', node: { kind: 'leaf', role: 'byline', contentRef: 'byline', colorRef: 'primary', fontRef: 'body', weightHint: 600 } },
      { weight: 4, node: { kind: 'leaf', role: 'image', contentRef: 'photo1', fit: 'cover' } },
      {
        weight: 6,
        node: {
          kind: 'row',
          gap: 'lg',
          children: [
            { weight: 1, node: { kind: 'leaf', role: 'body', contentRef: 'body', colorRef: 'text', fontRef: 'body' } },
            { weight: 1, node: { kind: 'leaf', role: 'body', contentRef: 'body2', colorRef: 'text', fontRef: 'body' } },
          ],
        },
      },
    ],
  },
};

// ── photo-grid: header, 2×2 photo grid, caption strip ─────────────────────────
const PHOTO_GRID: LayoutSpec = {
  page: { background: { ref: 'bg' }, margin: 'lg' },
  root: {
    kind: 'col',
    gap: 'md',
    children: [
      { sizing: 'content', node: { kind: 'leaf', role: 'kicker', contentRef: 'kicker', colorRef: 'accent', fontRef: 'body', weightHint: 700 } },
      { sizing: 'content', node: { kind: 'leaf', role: 'headline', contentRef: 'headline', colorRef: 'text', fontRef: 'display', weightHint: 700 } },
      {
        weight: 1,
        node: {
          kind: 'row',
          gap: 'md',
          children: [
            { weight: 1, node: { kind: 'leaf', role: 'image', contentRef: 'photo1', fit: 'cover' } },
            { weight: 1, node: { kind: 'leaf', role: 'image', contentRef: 'photo2', fit: 'cover' } },
          ],
        },
      },
      {
        weight: 1,
        node: {
          kind: 'row',
          gap: 'md',
          children: [
            { weight: 1, node: { kind: 'leaf', role: 'image', contentRef: 'photo3', fit: 'cover' } },
            { weight: 1, node: { kind: 'leaf', role: 'image', contentRef: 'photo4', fit: 'cover' } },
          ],
        },
      },
      { sizing: 'content', node: { kind: 'leaf', role: 'caption', contentRef: 'caption', colorRef: 'secondary', fontRef: 'body' } },
    ],
  },
};

// ── pull-quote: oversized centered quotation + attribution ────────────────────
const PULL_QUOTE: LayoutSpec = {
  page: { background: { ref: 'bg' }, margin: 'xl' },
  root: {
    kind: 'col',
    justify: 'center',
    align: 'center',
    gap: 'lg',
    children: [
      { weight: 3, node: { kind: 'leaf', role: 'pullquote', contentRef: 'pullquote', colorRef: 'text', fontRef: 'display', weightHint: 700, align: 'center' } },
      { sizing: 'content', node: { kind: 'leaf', role: 'byline', contentRef: 'attribution', colorRef: 'primary', fontRef: 'body', weightHint: 700, align: 'center' } },
    ],
  },
};

// ── stat-infographic: title, then three figure/label bars ─────────────────────
function statBar(figureRef: string, labelRef: string, fill: 'primary' | 'secondary' | 'accent'): LayoutSpec['root'] {
  return {
    kind: 'stack',
    layers: [
      { kind: 'leaf', role: 'shape', colorRef: fill },
      {
        kind: 'row',
        pad: 'md',
        gap: 'lg',
        align: 'center',
        children: [
          { weight: 2, node: { kind: 'leaf', role: 'figure', contentRef: figureRef, colorRef: 'bg', fontRef: 'display', weightHint: 800 } },
          { weight: 3, node: { kind: 'leaf', role: 'label', contentRef: labelRef, colorRef: 'bg', fontRef: 'body', weightHint: 500 } },
        ],
      },
    ],
  };
}
const STAT_INFOGRAPHIC: LayoutSpec = {
  page: { background: { ref: 'bg' }, margin: 'lg' },
  root: {
    kind: 'col',
    gap: 'md',
    children: [
      { sizing: 'content', node: { kind: 'leaf', role: 'kicker', contentRef: 'kicker', colorRef: 'accent', fontRef: 'body', weightHint: 700 } },
      { sizing: 'content', node: { kind: 'leaf', role: 'headline', contentRef: 'headline', colorRef: 'text', fontRef: 'display', weightHint: 800 } },
      { weight: 1, node: statBar('stat1', 'label1', 'primary') },
      { weight: 1, node: statBar('stat2', 'label2', 'secondary') },
      { weight: 1, node: statBar('stat3', 'label3', 'accent') },
    ],
  },
};

// ── contents: section title + up to five entry lines ──────────────────────────
const CONTENTS: LayoutSpec = {
  page: { background: { ref: 'bg' }, margin: 'lg' },
  root: {
    kind: 'col',
    gap: 'md',
    children: [
      { sizing: 'content', node: { kind: 'leaf', role: 'kicker', contentRef: 'kicker', colorRef: 'accent', fontRef: 'body', weightHint: 700 } },
      { sizing: 'content', node: { kind: 'leaf', role: 'headline', contentRef: 'headline', colorRef: 'text', fontRef: 'display', weightHint: 800 } },
      { sizing: 'content', node: { kind: 'leaf', role: 'entry', contentRef: 'entry1', colorRef: 'text', fontRef: 'body', weightHint: 500 } },
      { sizing: 'content', node: { kind: 'leaf', role: 'entry', contentRef: 'entry2', colorRef: 'text', fontRef: 'body', weightHint: 500 } },
      { sizing: 'content', node: { kind: 'leaf', role: 'entry', contentRef: 'entry3', colorRef: 'text', fontRef: 'body', weightHint: 500 } },
      { sizing: 'content', node: { kind: 'leaf', role: 'entry', contentRef: 'entry4', colorRef: 'text', fontRef: 'body', weightHint: 500 } },
      { weight: 1, node: { kind: 'leaf', role: 'entry', contentRef: 'entry5', colorRef: 'text', fontRef: 'body', weightHint: 500 } },
    ],
  },
};

// ── back-cover: solid panel, CTA headline, paragraph, QR + label ──────────────
const BACK_COVER: LayoutSpec = {
  page: { background: { ref: 'primary' }, margin: 'none' },
  root: {
    kind: 'stack',
    layers: [
      { kind: 'leaf', role: 'shape', colorRef: 'primary' },
      {
        kind: 'col',
        pad: 'xl',
        justify: 'center',
        gap: 'lg',
        children: [
          { sizing: 'content', node: { kind: 'leaf', role: 'headline', contentRef: 'cta', colorRef: 'bg', fontRef: 'display', weightHint: 800 } },
          { sizing: 'content', node: { kind: 'leaf', role: 'body', contentRef: 'body', colorRef: 'bg', fontRef: 'body' } },
          {
            weight: 1,
            node: {
              kind: 'row',
              gap: 'lg',
              align: 'center',
              children: [
                { weight: 2, node: { kind: 'leaf', role: 'qr', contentRef: 'qr', colorRef: 'text' } },
                { weight: 3, node: { kind: 'leaf', role: 'label', contentRef: 'qrLabel', colorRef: 'bg', fontRef: 'body', weightHint: 600 } },
              ],
            },
          },
        ],
      },
    ],
  },
};

export const SEED_SPECS: Record<PageTemplateKind, LayoutSpec> = {
  cover: COVER,
  contents: CONTENTS,
  'feature-full-bleed': FEATURE_FULL_BLEED,
  'two-column-article': TWO_COLUMN_ARTICLE,
  'photo-grid': PHOTO_GRID,
  'pull-quote': PULL_QUOTE,
  'stat-infographic': STAT_INFOGRAPHIC,
  'back-cover': BACK_COVER,
};

/** The seed frame-tree for a page kind (offline fallback for the AI path). */
export function seedSpecFor(kind: PageTemplateKind): LayoutSpec {
  return SEED_SPECS[kind] ?? TWO_COLUMN_ARTICLE;
}

/** A small, diverse set serialized into the Art-Director prompt as few-shot
 *  exemplars — enough idioms (full-bleed stack, multi-column, bar stack) without
 *  bloating the prompt. */
export const SEED_EXEMPLARS: { kind: PageTemplateKind; spec: LayoutSpec }[] = [
  { kind: 'feature-full-bleed', spec: FEATURE_FULL_BLEED },
  { kind: 'two-column-article', spec: TWO_COLUMN_ARTICLE },
  { kind: 'stat-infographic', spec: STAT_INFOGRAPHIC },
];
