// ---------------------------------------------------------------------------
// Magazine Builder v2 — Zod schema for the AI-authored LayoutSpec.
//
// This is the SHAPE the Art-Director agent emits via generateObject: the same
// frame-tree DSL as layoutSpec.ts, expressed as Zod so the model is constrained
// to rows / cols / stacks / leaves and bounded tokens — never coordinates.
//
// It is a GUIDE, not the trust boundary: `normalizeLayoutSpec` (layoutSpec.ts)
// is still the authority that clamps every token, enforces the caps, and drops
// anything invalid. So this schema only needs to steer the model to the right
// shape, not to be exhaustively strict.
//
// The tree is DEPTH-UNROLLED (not z.lazy recursion): each level references the
// next one down, bottoming out in leaf-only containers at MAX_TREE_DEPTH. This
// bakes the depth cap into the schema AND avoids the recursive `$ref` some
// structured-output providers reject. Pure: types only, no LLM/IO here.
// ---------------------------------------------------------------------------

import { z } from 'zod';
import {
  SPACE_TOKENS,
  COLOR_REFS,
  FONT_REFS,
  FLEX_ALIGNS,
  TEXT_ALIGNS,
  IMAGE_FITS,
  LEAF_ROLES,
  MAX_TREE_DEPTH,
  PLACE_ANCHORS,
  RULE_SIDES,
} from './layoutSpec.js';

// NOTE: this schema carries NO value constraints (min/max/length/minItems/…) or
// integer bounds. Azure's strict structured-output mode rejects them ("For
// 'integer' type, properties maximum, minimum are not supported"), and they are
// unnecessary here anyway: `normalizeLayoutSpec` is the trust boundary that
// clamps every weight, enforces MAX_CHILDREN / MAX_STACK_LAYERS / MAX_LEAVES /
// MAX_TREE_DEPTH, validates weightHint membership, and drops anything invalid.
// Keep it to plain types + enums + describe() so every provider accepts it.

/** z.enum over a readonly `as const` token tuple (Zod 4 accepts these directly). */
function enumOf<T extends readonly [string, ...string[]]>(arr: T) {
  return z.enum(arr);
}

/** A stack layer's anchor inside its stack (w/h in twelfths). */
const placeSchema = z
  .object({
    x: enumOf(PLACE_ANCHORS).optional(),
    y: enumOf(PLACE_ANCHORS).optional(),
    w: z.number().optional(),
    h: z.union([z.number(), z.literal('content')]).optional(),
    inset: enumOf(SPACE_TOKENS).optional(),
  })
  .describe('anchor this stack layer inside the stack instead of filling it');

const leafSchema = z
  .object({
    kind: z.literal('leaf'),
    role: enumOf(LEAF_ROLES).describe('what this box renders: a text role (headline/subhead/kicker/byline/body/caption/pullquote/figure/label/entry) or image/icon/shape/qr'),
    contentRef: z.string().optional().describe('short key into the content doc for this box’s copy / image brief / qr / icon (e.g. "headline", "body", "hero")'),
    colorRef: enumOf(COLOR_REFS).optional().describe('palette colour for text/qr/shape'),
    fontRef: enumOf(FONT_REFS).optional().describe('which font of the pairing (display or body)'),
    weightHint: z.number().optional().describe('font weight, one of 400/500/600/700/800/900'),
    align: enumOf(TEXT_ALIGNS).optional(),
    fit: enumOf(IMAGE_FITS).optional().describe('image fit; cover fills the box with no dead space'),
    aspect: z.number().optional().describe('advisory image aspect ratio (w/h)'),
    bleed: z.boolean().optional().describe('image/shape: run off every page edge it touches'),
    rotate: z.number().optional().describe('collage tilt in degrees (−5…5): image/shape/figure/label/kicker/caption'),
    dropCap: z.boolean().optional().describe('body: open with a drop cap'),
    rule: enumOf(RULE_SIDES).optional().describe('text: an accent rule above/below/both/left'),
    thickness: z.number().optional().describe('shape: a rule this many px thick along its container axis'),
    glyph: z.string().optional().describe('figure/label/kicker: ornament text (≤3 chars) set on the leaf itself'),
    place: placeSchema.optional(),
  })
  .describe('A single content box — a leaf of the layout tree.');

const containerCommon = {
  gap: enumOf(SPACE_TOKENS).optional().describe('space between children'),
  pad: enumOf(SPACE_TOKENS).optional().describe('inner padding'),
  align: enumOf(FLEX_ALIGNS).optional().describe('cross-axis alignment'),
  justify: enumOf(FLEX_ALIGNS).optional().describe('main-axis distribution'),
  grid: z.number().optional().describe('a column grid (2–12): children sized by span'),
  place: placeSchema.optional(),
};

/** Build one level of the tree whose containers/stacks hold `childNode`. */
function makeLevel(childNode: z.ZodTypeAny): z.ZodTypeAny {
  const child = z.object({
    weight: z.number().optional().describe('fr weight when sizing=fr (relative share of the axis)'),
    sizing: z.enum(['fr', 'content']).optional().describe("'content' sizes this track to its text; 'fr' shares the remaining space by weight"),
    span: z.number().optional().describe('grid columns this child spans (in a grid container)'),
    overlap: z.number().optional().describe('px this child is pulled back over the previous one (drawn on top)'),
    node: childNode,
  });
  const row = z.object({ kind: z.literal('row'), ...containerCommon, children: z.array(child) }).describe('Lay children left-to-right (1–12).');
  const col = z.object({ kind: z.literal('col'), ...containerCommon, children: z.array(child) }).describe('Stack children top-to-bottom (1–12).');
  const stack = z
    .object({ kind: z.literal('stack'), pad: enumOf(SPACE_TOKENS).optional(), place: placeSchema.optional(), layers: z.array(childNode) })
    .describe('Overlay layers on the same rectangle (text over a full-bleed photo, a panel, placed captions).');
  return z.union([leafSchema, row, col, stack]);
}

// Unroll MAX_TREE_DEPTH levels: leaf → level2 → … → root.
let nodeSchema: z.ZodTypeAny = leafSchema;
for (let d = 1; d < MAX_TREE_DEPTH; d++) nodeSchema = makeLevel(nodeSchema);

export const LayoutSpecSchema = z
  .object({
    page: z
      .object({
        background: z.object({ ref: enumOf(COLOR_REFS) }).optional().describe('page background colour token'),
        margin: enumOf(SPACE_TOKENS).optional().describe('page margin'),
      })
      .optional(),
    root: nodeSchema.describe('the root of the layout tree — usually a col or a stack'),
  })
  .describe('A complete page layout as a relative frame-tree. Emit ONLY this shape; never x/y/width/height.');

export type LayoutSpecInput = z.infer<typeof LayoutSpecSchema>;
