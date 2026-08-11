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
