// ---------------------------------------------------------------------------
// pruneLayoutSpec — drop leaves that resolved to nothing, keep the tree valid.
//
// The solver allocates a box to EVERY declared leaf, including ones whose content
// never materialised (empty copy, a photo that failed to source). Pruning is what
// stops those becoming blank regions and flat tint blocks. The subtle part is
// shapes: scrim / panel / bare-in-flow are three different answers, and they must
// stay in lockstep with composeFromSolved's scrim detection.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pruneLayoutSpec } from '../../src/lib/magazineV2/pruneSpec.js';
import type { LayoutSpec, LayoutNode } from '../../src/lib/magazineV2/layoutSpec.js';
import type { ResolvedContent } from '../../src/lib/magazineV2/composeFromSolved.js';

const spec = (root: LayoutNode): LayoutSpec => ({ page: { background: { ref: 'bg' }, margin: 'md' }, root }) as unknown as LayoutSpec;
const leaf = (role: string, contentRef?: string): LayoutNode => ({ kind: 'leaf', role, contentRef }) as LayoutNode;
const photo = { url: 'https://cdn.example.com/p.jpg', assetId: 'a1', alt: '' };

import { solveLayout } from '../../src/lib/magazineV2/solveLayout.ts';
import { composeFromSolved } from '../../src/lib/magazineV2/composeFromSolved.ts';
import { PAGE_H, PAGE_W } from '../../src/lib/magazineV2/config.ts';

test('a text leaf with no copy is dropped; one with copy survives', () => {
  const root = {
    kind: 'col',
    children: [
      { weight: 1, sizing: 'fr', node: leaf('headline', 'headline') },
      { weight: 1, sizing: 'fr', node: leaf('body', 'body') },
    ],
  } as unknown as LayoutNode;

  const content: ResolvedContent = { headline: { text: 'A real headline' }, body: { text: '   ' } };
  const pruned = pruneLayoutSpec(spec(root), content);
  assert.ok(pruned);
  const kids = (pruned!.root as { children: { node: { contentRef?: string } }[] }).children;
  assert.equal(kids.length, 1);
  assert.equal(kids[0]!.node.contentRef, 'headline');
});

test('an image slot that fell back to a tint block does NOT count as content', () => {
  // curateFills emits shapeFill when no photo could be sourced. Keeping the leaf
  // would render the flat palette block the pruner exists to remove.
  const root = {
    kind: 'col',
    children: [
      { weight: 1, sizing: 'fr', node: leaf('image', 'hero') },
      { weight: 1, sizing: 'fr', node: leaf('body', 'body') },
    ],
  } as unknown as LayoutNode;

  const pruned = pruneLayoutSpec(spec(root), { hero: { shapeFill: '#334455' }, body: { text: 'Real prose.' } });
  assert.ok(pruned);
  const kids = (pruned!.root as { children: { node: { role: string } }[] }).children;
  assert.deepEqual(kids.map((k) => k.node.role), ['body']);
});

test('a bare shape in normal flow is always dropped (dead space)', () => {
  const root = {
    kind: 'row',
    children: [
      { weight: 1, sizing: 'fr', node: leaf('shape') },
      { weight: 1, sizing: 'fr', node: leaf('body', 'body') },
    ],
  } as unknown as LayoutNode;
  const pruned = pruneLayoutSpec(spec(root), { body: { text: 'Prose.' } });
  assert.ok(pruned);
  const kids = (pruned!.root as { children: { node: { role: string } }[] }).children;
  assert.deepEqual(kids.map((k) => k.node.role), ['body']);
});

test('a SCRIM survives only while the image below it survives', () => {
  const stack = (heroContent: ResolvedContent) =>
    pruneLayoutSpec(
      spec({
        kind: 'stack',
        layers: [leaf('image', 'hero'), leaf('shape'), leaf('headline', 'headline')],
      } as unknown as LayoutNode),
      { headline: { text: 'Over the photo' }, ...heroContent },
    );

  const withPhoto = stack({ hero: { image: photo } });
  assert.ok(withPhoto);
  assert.deepEqual(
    (withPhoto!.root as { layers: { role: string }[] }).layers.map((l) => l.role),
    ['image', 'shape', 'headline'],
    'photo present → scrim earns its keep',
  );

  const withoutPhoto = stack({});
  assert.ok(withoutPhoto);
  assert.deepEqual(
    (withoutPhoto!.root as { layers: { role: string }[] }).layers.map((l) => l.role),
    ['headline'],
    'no photo → the scrim is a dark block over nothing, so it goes',
  );
});

test('a PANEL (shape at the bottom of a stack) survives only while a layer above has content', () => {
  const panelStack = (content: ResolvedContent) =>
    pruneLayoutSpec(
      spec({ kind: 'stack', layers: [leaf('shape'), leaf('label', 'label1')] } as unknown as LayoutNode),
      content,
    );

  const filled = panelStack({ label1: { text: 'KEY FACTS' } });
  assert.ok(filled);
  assert.deepEqual((filled!.root as { layers: { role: string }[] }).layers.map((l) => l.role), ['shape', 'label']);

  assert.equal(panelStack({}), null, 'nothing on the panel → the whole stack is dead');
});

test('the FR-GUARANTEE promotes a survivor so a start-packed track cannot trail empty', () => {
  // After pruning, every survivor is content-sized. The solver only spreads leftover
  // length onto `fr` tracks, so without this the remainder shows as an uncovered strip.
  const root = {
    kind: 'col',
    children: [
      { weight: 1, sizing: 'content', node: leaf('kicker', 'kicker') },
      { weight: 1, sizing: 'content', node: leaf('body', 'body') },
      { weight: 1, sizing: 'content', node: leaf('caption', 'caption') },
    ],
  } as unknown as LayoutNode;

  const pruned = pruneLayoutSpec(spec(root), { kicker: { text: 'TAG' }, body: { text: 'Prose.' }, caption: { text: 'Cap' } });
  assert.ok(pruned);
  const kids = (pruned!.root as { children: { sizing?: string; node: { role: string } }[] }).children;
  const fr = kids.filter((k) => (k.sizing ?? 'fr') === 'fr');
  assert.equal(fr.length, 1, 'exactly one child should be promoted to fr');
  // The scan runs from the END and breaks, so the LAST prose-bearing child takes the
  // stretch (here caption, not body). Which prose child wins is cosmetically neutral —
  // text is top-aligned, so the slack just sits inside that box instead of trailing
  // the track. What matters is that the winner is prose-bearing, never the kicker.
  assert.ok(
    ['body', 'pullquote', 'entry', 'caption', 'subhead'].includes(fr[0]!.node.role),
    `promoted a non-prose child (${fr[0]!.node.role})`,
  );
  assert.notEqual(fr[0]!.node.role, 'kicker', 'a section tag must never absorb the leftover strip');
});

test('the FR-guarantee skips a non-prose trailing child in favour of a prose one', () => {
  // kicker is LAST but carries no prose, so the scan must keep walking back to the body.
  const root = {
    kind: 'col',
    children: [
      { weight: 1, sizing: 'content', node: leaf('body', 'body') },
      { weight: 1, sizing: 'content', node: leaf('kicker', 'kicker') },
    ],
  } as unknown as LayoutNode;

  const pruned = pruneLayoutSpec(spec(root), { body: { text: 'Prose.' }, kicker: { text: 'TAG' } });
  assert.ok(pruned);
  const kids = (pruned!.root as { children: { sizing?: string; node: { role: string } }[] }).children;
  const fr = kids.filter((k) => (k.sizing ?? 'fr') === 'fr');
  assert.equal(fr.length, 1);
  assert.equal(fr[0]!.node.role, 'body');
});

test('an anchored container (justify end/center) is left alone by the FR-guarantee', () => {
  const root = {
    kind: 'col',
    justify: 'end',
    children: [{ weight: 1, sizing: 'content', node: leaf('headline', 'headline') }],
  } as unknown as LayoutNode;
  const pruned = pruneLayoutSpec(spec(root), { headline: { text: 'Bottom-anchored' } });
  assert.ok(pruned);
  const kids = (pruned!.root as { children: { sizing?: string }[] }).children;
  assert.equal(kids[0]!.sizing, 'content', 'end-justified whitespace is intentional');
});

test('nothing real left returns null so the caller can fall back', () => {
  const root = {
    kind: 'col',
    children: [
      { weight: 1, sizing: 'fr', node: leaf('headline', 'headline') },
      { weight: 1, sizing: 'fr', node: leaf('image', 'hero') },
    ],
  } as unknown as LayoutNode;
  assert.equal(pruneLayoutSpec(spec(root), {}), null);
});

test('an icon leaf counts as content via its authored glyph, with no contentRef', () => {
  const root = {
    kind: 'row',
    children: [{ weight: 1, sizing: 'fr', node: { kind: 'leaf', role: 'icon', iconName: 'Trophy' } as LayoutNode }],
  } as unknown as LayoutNode;
  const pruned = pruneLayoutSpec(spec(root), {});
  assert.ok(pruned, 'an icon with a glyph name is real content even with no content entry');
});

// ── The `spacer` role (docs/MAGAZINE-V2-BUILDER-PLAN.md §11.1) ────────────────
//
// Deliberate emptiness: a leaf that takes its share of the track and draws nothing. It is
// the one leaf role that must SURVIVE this pass despite carrying no content, which makes
// "still has children" a different question from "still has content".

const spacer = (): LayoutNode => ({ kind: 'leaf', role: 'spacer' });

test('a spacer survives pruning — that is the whole point of it', () => {
  const out = pruneLayoutSpec(
    { page: { margin: 'none', background: { ref: 'bg' } }, root: { kind: 'col', children: [
      { weight: 20, sizing: 'fr', node: { kind: 'leaf', role: 'headline', contentRef: 'headline' } },
      { weight: 80, sizing: 'fr', node: spacer() },
    ] } },
    { headline: { text: 'Kept' } },
  );
  assert.ok(out);
  assert.equal(out.root.kind, 'col');
  if (out.root.kind !== 'col') return;
  assert.equal(out.root.children.length, 2, 'the empty 80% is still there');
  assert.equal(out.root.children[1]!.node.kind === 'leaf' ? out.root.children[1]!.node.role : '', 'spacer');
});

test('a container of ONLY spacers is dropped — that is dead space, not design', () => {
  const out = pruneLayoutSpec(
    { page: { margin: 'none', background: { ref: 'bg' } }, root: { kind: 'col', children: [
      { weight: 50, sizing: 'fr', node: spacer() },
      { weight: 50, sizing: 'fr', node: spacer() },
    ] } },
    {},
  );
  assert.equal(out, null, 'nothing to look at, so there is no page');
});

test('a spacer nested under a container with real content still survives', () => {
  const out = pruneLayoutSpec(
    { page: { margin: 'none', background: { ref: 'bg' } }, root: { kind: 'col', children: [
      { weight: 50, sizing: 'fr', node: { kind: 'col', children: [
        { weight: 30, sizing: 'fr', node: spacer() },
        { weight: 70, sizing: 'fr', node: { kind: 'leaf', role: 'body', contentRef: 'body' } },
      ] } },
      { weight: 50, sizing: 'fr', node: spacer() },
    ] } },
    { body: { text: 'Prose.' } },
  );
  assert.ok(out);
  assert.equal(out.root.kind, 'col');
  if (out.root.kind !== 'col') return;
  assert.equal(out.root.children.length, 2);
  const inner = out.root.children[0]!.node;
  assert.equal(inner.kind, 'col');
  assert.equal(inner.kind === 'col' ? inner.children.length : 0, 2, 'the inner spacer is kept too');
});

test('a spacer as a STACK LAYER is dropped — it would cover the whole rectangle', () => {
  const out = pruneLayoutSpec(
    { page: { margin: 'none', background: { ref: 'bg' } }, root: { kind: 'stack', layers: [
      { kind: 'leaf', role: 'image', contentRef: 'hero' },
      spacer(),
      { kind: 'leaf', role: 'headline', contentRef: 'headline' },
    ] } },
    { hero: { image: { url: 'https://x/p.jpg', assetId: 'a', alt: '' } }, headline: { text: 'Over it' } },
  );
  assert.ok(out);
  assert.equal(out.root.kind, 'stack');
  if (out.root.kind !== 'stack') return;
  assert.equal(out.root.layers.length, 2, 'the spacer layer is gone; the photo and the type remain');
});

test('a spacer draws NOTHING — it must not become an element', () => {
  // A transparent box would still be a click target sitting over the page's whitespace.
  const spec = { page: { margin: 'none' as const, background: { ref: 'bg' as const } }, root: { kind: 'col' as const, children: [
    { weight: 20, sizing: 'fr' as const, node: { kind: 'leaf' as const, role: 'headline' as const, contentRef: 'headline' } },
    { weight: 80, sizing: 'fr' as const, node: spacer() },
  ] } };
  const content = { headline: { text: 'One line' } };
  const solved = solveLayout(spec, { width: PAGE_W, height: PAGE_H }, {});
  assert.equal(solved.leaves.length, 2, 'the solver DID give the spacer a box');
  const composed = composeFromSolved(solved, content, {
    palette: { bg: '#ffffff', text: '#111111', primary: '#883333', secondary: '#666666', accent: '#d4a843' },
    fonts: { display: 'Playfair Display, serif', body: 'Inter, Arial, sans-serif' },
  });
  assert.equal(composed.elements.length, 1, 'but nothing was drawn for it');
});
