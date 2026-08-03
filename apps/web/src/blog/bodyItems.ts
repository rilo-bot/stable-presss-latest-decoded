/**
 * The body-item round trip — the other half of the seam Instant Capture opened.
 *
 * `pages/instant/buildBlocks.ts` goes ONE way: the agent emits a flat
 * `BodyItem[]` (paragraph / heading / list / quote) and code assembles real
 * `Block[]` from it with the composer's own factories. That is deliberate — the
 * agent has no output path into the block model, so it cannot emit a shape
 * `normaliseBlocks` would silently drop.
 *
 * The Blog Studio needs the INVERSE too, because it revises posts rather than only
 * writing new ones: it has to read what is already there in the same flat shape it
 * writes. That is `blocksToBodyItems`.
 *
 * And it needs `spliceBodyItems`, which is the whole reason this file deserves
 * care. If a body rewrite simply rebuilt the block list from the new items, every
 * image, gallery, embed and horse card in the post would be DELETED by what the
 * user asked for as a copy-edit. See docs/BLOG-AI-STUDIO-PLAN.md §5.
 */
import { heading, list, paragraph, quote } from '@/blog/factories';
import { blogPlainText } from '@/blog/sanitize';
import type { Block } from '@/types/blog';

/**
 * One item of a blog body, in reading order.
 *
 * Structurally identical to `BodyItem` in `pages/instant/types.ts` and
 * `lib/agent/instantDraft.ts`. Re-declared rather than imported from the Instant
 * module so the Blog Studio does not depend on a sibling feature's page folder —
 * the two are hand-mirrored, the same arrangement `types/blog.ts` and
 * `lib/blog/blocks.ts` already use.
 */
export type BodyItem =
  | { kind: 'paragraph'; text: string }
  | { kind: 'heading'; level: 2 | 3; text: string }
  | { kind: 'list'; ordered: boolean; items: { lead?: string; text: string }[] }
  | { kind: 'quote'; text: string; attribution?: string };

/** Block kinds that map onto a BodyItem. Everything else is a "visual". */
const TEXTUAL = new Set<string>(['paragraph', 'heading', 'list', 'quote', 'callout']);

/** Is this block one the assistant can read and rewrite as a body item? */
export function isTextualBlock(block: Block): boolean {
  return TEXTUAL.has(block.kind);
}

/** A short human label for a block the assistant cannot author. */
export function visualLabel(block: Block): string {
  switch (block.kind) {
    case 'image': return 'a photograph';
    case 'gallery': return 'a gallery';
    case 'embed': return 'an embedded video';
    case 'horseCard': return 'a horse card';
    case 'partyCard': return 'a profile card';
    case 'articleRef': return 'a link to a story';
    case 'code': return 'a code block';
    case 'divider': return 'a section break';
    default: return block.kind;
  }
}

/**
 * Strip a list item's inline HTML back to `{ lead, text }`.
 *
 * `buildBlocks.pointHtml` renders a point's optional label as
 * `<strong>Label:</strong> text`, so recovering the lead means recognising that
 * exact shape. Anything else is treated as plain text with no label, which is the
 * safe direction to be wrong in — a lead that comes back as part of the sentence
 * still reads correctly, whereas inventing one would not.
 */
function pointFromHtml(html: string): { lead?: string; text: string } {
  const match = /^\s*<strong>([^<]{1,80}?):?<\/strong>\s*:?\s*(.*)$/is.exec(html);
  if (match) {
    const lead = blogPlainText(match[1] ?? '').trim();
    const text = blogPlainText(match[2] ?? '').trim();
    if (lead && text) return { lead, text };
  }
  return { text: blogPlainText(html).trim() };
}

/**
 * Read a post's text blocks back as body items.
 *
 * Deliberately LOSSY, and only in ways that cannot destroy anything:
 *  - `callout` folds to a paragraph — BodyItem has no tone, and a callout's words
 *    matter more than its coloured box.
 *  - heading level 4 folds to 3, because BodyItem only carries 2 | 3.
 *  - visual blocks are skipped entirely. They are reported separately by
 *    `describeVisuals` and preserved by `spliceBodyItems`.
 *
 * Inline HTML is reduced to plain text, because that is what a BodyItem holds and
 * `buildBlocks` re-escapes on the way back. A round trip therefore drops inline
 * bold/italic/links inside a rewritten paragraph — acceptable, because the
 * assistant is rewriting those words anyway. It does NOT drop them from blocks it
 * leaves alone: an untouched paragraph is only ever re-derived if the model
 * actually returns it.
 */
export function blocksToBodyItems(blocks: Block[]): BodyItem[] {
  const out: BodyItem[] = [];

  for (const block of blocks) {
    switch (block.kind) {
      case 'paragraph':
      case 'callout': {
        const text = blogPlainText(block.html).trim();
        if (text) out.push({ kind: 'paragraph', text });
        break;
      }
      case 'heading': {
        const text = block.text.trim();
        if (text) out.push({ kind: 'heading', level: block.level === 2 ? 2 : 3, text });
        break;
      }
      case 'list': {
        const items = block.items.map(pointFromHtml).filter((p) => p.text.length > 0);
        if (items.length) out.push({ kind: 'list', ordered: block.ordered, items });
        break;
      }
      case 'quote': {
        const text = blogPlainText(block.html).trim();
        if (!text) break;
        const attribution = block.attribution?.trim();
        out.push({ kind: 'quote', text, ...(attribution ? { attribution } : {}) });
        break;
      }
      default:
        // A visual block. Skipped here, preserved by spliceBodyItems.
        break;
    }
  }

  return out;
}

/** What the assistant is told a post holds that it cannot itself author. */
export function describeVisuals(blocks: Block[]): string[] {
  return blocks.filter((b) => !isTextualBlock(b)).map(visualLabel);
}

/** Escape plain text for a block's inline HTML. Mirrors buildBlocks.escapeHtml. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** A list point as inline HTML, with its optional label bold. Mirrors buildBlocks. */
function pointHtml(point: { lead?: string; text: string }): string {
  const body = escapeHtml(point.text);
  return point.lead ? `<strong>${escapeHtml(point.lead)}:</strong> ${body}` : body;
}

/** One body item → one block, via the composer's own factories. */
export function blockForItem(item: BodyItem): Block {
  switch (item.kind) {
    case 'heading':
      return heading(item.level, item.text);
    case 'list': {
      const b = list(item.ordered);
      // `list()` seeds one empty item so a hand-inserted list is editable; a
      // generated one carries its real points instead.
      b.items = item.items.map(pointHtml);
      return b;
    }
    case 'quote': {
      const b = quote();
      b.html = escapeHtml(item.text);
      if (item.attribution) b.attribution = item.attribution;
      return b;
    }
    case 'paragraph':
    default:
      return paragraph(escapeHtml(item.text));
  }
}

export interface SpliceResult {
  blocks: Block[];
  /** How many visual blocks ended up somewhere other than their old slot. */
  movedVisuals: number;
}

/**
 * Replace a post's text with new body items, KEEPING everything the assistant
 * cannot author.
 *
 * The rule, stated so it can be checked against behaviour:
 *
 *   A non-text block keeps its position measured in TEXT BLOCKS FROM THE TOP. If
 *   the rewrite is shorter than the point where a photograph sat, that photograph
 *   moves to the end. NOTHING IS EVER DROPPED, and the media pool is never touched.
 *
 * So a photo that sat after the fourth paragraph sits after the fourth paragraph
 * of the new version — which is right when the shape is broadly preserved, and
 * approximate when it is not. `movedVisuals` counts the approximate ones so the
 * caller can tell the user to check them, rather than letting them discover it.
 */
export function spliceBodyItems(currentBlocks: Block[], nextItems: BodyItem[]): SpliceResult {
  // Anchor every visual to the number of text blocks that preceded it.
  const visuals: { anchor: number; block: Block }[] = [];
  let textSeen = 0;
  for (const block of currentBlocks) {
    if (isTextualBlock(block)) textSeen += 1;
    else visuals.push({ anchor: textSeen, block });
  }

  const nextText = nextItems.map(blockForItem);

  const out: Block[] = [];
  let movedVisuals = 0;
  let placed = 0;

  for (let i = 0; i <= nextText.length; i++) {
    // Everything anchored at exactly this many preceding text blocks.
    while (placed < visuals.length && visuals[placed]!.anchor === i) {
      out.push(visuals[placed]!.block);
      placed += 1;
    }
    if (i < nextText.length) out.push(nextText[i]!);
  }

  // Anchored past the end of the new body — the rewrite was shorter. These are
  // the ones that actually moved, so they are the ones worth mentioning.
  for (const leftover of visuals.slice(placed)) {
    out.push(leftover.block);
    movedVisuals += 1;
  }

  return { blocks: out, movedVisuals };
}
