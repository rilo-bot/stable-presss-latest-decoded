// ---------------------------------------------------------------------------
// normalizeLayoutSpec — the trust boundary for the art-director's output.
//
// The art-director is prompted with free-form JSON (not a strict schema), which is
// only safe because THIS function coerces whatever comes back. It must clamp every
// token, enforce every cap, drop what it can't use, and never throw — a throw here
// would take out a generation job instead of falling back to a seed spec.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeLayoutSpec,
  countLeaves,
  treeDepth,
  MAX_LEAVES,
  MAX_CHILDREN,
  MAX_STACK_LAYERS,
  MAX_TREE_DEPTH,
  MAX_WEIGHT,
} from '../../src/lib/magazineV2/layoutSpec.js';

test('junk input returns null rather than throwing', () => {
  for (const bad of [null, undefined, 0, '', 'nope', [], {}, { root: null }, { root: 42 }, { root: { kind: 'wat' } }]) {
    assert.doesNotThrow(() => normalizeLayoutSpec(bad));
    assert.equal(normalizeLayoutSpec(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
});

// ── Near-misses that used to cost the ENTIRE design ───────────────────────────
// A rejected spec is not a degraded page, it is a FIXED SEED page — so every page
// in every issue came out identical. These two shapes are the ones a model
// actually produces, and both used to be rejected outright.

test('children given as BARE NODES are accepted, not dropped', () => {
  // The grammar wants {weight, sizing, node}. "children" reads like a list of
  // nodes, so models flatten it. That dropped every child, emptied the container,
  // and returned null for the whole tree.
  const spec = normalizeLayoutSpec({
    page: { background: { ref: 'bg' }, margin: 'md' },
    root: {
      kind: 'col',
      children: [
        { kind: 'leaf', role: 'headline', contentRef: 'headline' },
        { kind: 'leaf', role: 'body', contentRef: 'body' },
      ],
    },
  });
  assert.ok(spec, 'a flattened child list must still produce a spec');
  assert.equal(countLeaves(spec.root), 2);
});

test('a wrapped child still wins when both forms are present', () => {
  const spec = normalizeLayoutSpec({
    root: {
      kind: 'row',
      children: [{ kind: 'col', weight: 3, node: { kind: 'leaf', role: 'body', contentRef: 'body' } }],
    },
  });
  assert.ok(spec);
  assert.equal(countLeaves(spec.root), 1);
  // The wrapper's own `kind` must not be mistaken for the node.
  assert.equal(spec.root.kind, 'row');
});

test('a bare root node with no envelope is accepted', () => {
  const spec = normalizeLayoutSpec({
    kind: 'col',
    children: [{ weight: 1, sizing: 'fr', node: { kind: 'leaf', role: 'headline', contentRef: 'headline' } }],
  });
  assert.ok(spec, 'the model skipping {page, root} must not cost the whole layout');
  assert.equal(countLeaves(spec.root), 1);
  assert.equal(spec.page?.margin, 'md', 'the page envelope falls back to defaults');
});

test('`layout` and `tree` are accepted as aliases for `root`', () => {
  const node = { kind: 'col', children: [{ weight: 1, node: { kind: 'leaf', role: 'body', contentRef: 'body' } }] };
  for (const key of ['layout', 'tree']) {
    const spec = normalizeLayoutSpec({ page: { margin: 'lg' }, [key]: node });
    assert.ok(spec, `expected \`${key}\` to be accepted`);
    assert.equal(countLeaves(spec.root), 1);
  }
});

test('tolerance has limits — a genuinely unusable tree still returns null', () => {
  assert.equal(normalizeLayoutSpec({ root: { kind: 'col', children: [{ node: { kind: 'nope' } }] } }), null);
  assert.equal(normalizeLayoutSpec({ page: { margin: 'md' } }), null);
});

test('unknown tokens fall back instead of being passed through', () => {
  const spec = normalizeLayoutSpec({
    page: { background: { ref: 'chartreuse' }, margin: 'gigantic' },
    root: { kind: 'leaf', role: 'not-a-role', colorRef: 'nope', fontRef: 'comic', align: 'sideways', weightHint: 613 },
  });
  assert.ok(spec);
  assert.equal(spec!.page!.background!.ref, 'bg');
  assert.equal(spec!.page!.margin, 'md');
  const root = spec!.root as { kind: string; role: string; colorRef?: string; fontRef?: string; align?: string; weightHint?: number };
  assert.equal(root.role, 'body', 'an unknown leaf role collapses to body');
  assert.equal(root.colorRef, undefined);
  assert.equal(root.fontRef, undefined);
  assert.equal(root.align, undefined);
  assert.equal(root.weightHint, undefined, 'a non-scale font weight is dropped, not rounded');
});

test('the leaf budget is global and hard', () => {
  const spec = normalizeLayoutSpec({
    root: {
      kind: 'col',
      children: Array.from({ length: 8 }, () => ({
        node: { kind: 'row', children: Array.from({ length: 8 }, () => ({ node: { kind: 'leaf', role: 'body', contentRef: 'b' } })) },
      })),
    },
  });
  assert.ok(spec);
  assert.ok(countLeaves(spec!.root) <= MAX_LEAVES, `${countLeaves(spec!.root)} leaves exceeds the ${MAX_LEAVES} cap`);
});

test('depth, child-count and stack-layer caps all bind', () => {
  // A chain 10 cols deep.
  let deep: unknown = { kind: 'leaf', role: 'body', contentRef: 'b' };
  for (let i = 0; i < 10; i++) deep = { kind: 'col', children: [{ node: deep }] };
  const deepSpec = normalizeLayoutSpec({ root: deep });
  if (deepSpec) assert.ok(treeDepth(deepSpec.root) <= MAX_TREE_DEPTH, `depth ${treeDepth(deepSpec.root)} exceeds ${MAX_TREE_DEPTH}`);

  const wide = normalizeLayoutSpec({
    root: { kind: 'row', children: Array.from({ length: 20 }, () => ({ node: { kind: 'leaf', role: 'body', contentRef: 'b' } })) },
  });
  assert.ok(wide);
  assert.ok((wide!.root as { children: unknown[] }).children.length <= MAX_CHILDREN);

  const stacked = normalizeLayoutSpec({
    root: { kind: 'stack', layers: Array.from({ length: 12 }, () => ({ kind: 'leaf', role: 'image', contentRef: 'hero' })) },
  });
  assert.ok(stacked);
  const layers = (stacked!.root as { kind: string; layers?: unknown[] }).layers;
  if (layers) assert.ok(layers.length <= MAX_STACK_LAYERS);
});

test('weights are clamped into [0, MAX_WEIGHT] and non-numbers default to 1', () => {
  const spec = normalizeLayoutSpec({
    root: {
      kind: 'col',
      children: [
        { weight: -50, node: { kind: 'leaf', role: 'body', contentRef: 'a' } },
        { weight: 9e9, node: { kind: 'leaf', role: 'body', contentRef: 'b' } },
        { weight: 'lots', node: { kind: 'leaf', role: 'body', contentRef: 'c' } },
        { weight: Number.NaN, node: { kind: 'leaf', role: 'body', contentRef: 'd' } },
      ],
    },
  });
  assert.ok(spec);
  const weights = (spec!.root as { children: { weight?: number }[] }).children.map((c) => c.weight);
  assert.deepEqual(weights, [0, MAX_WEIGHT, 1, 1]);
});

test('an empty container is dropped rather than kept as a hole', () => {
  assert.equal(normalizeLayoutSpec({ root: { kind: 'col', children: [] } }), null);
  assert.equal(normalizeLayoutSpec({ root: { kind: 'stack', layers: [] } }), null);
  // A container whose only child is unusable also collapses.
  assert.equal(normalizeLayoutSpec({ root: { kind: 'row', children: [{ node: { kind: 'bogus' } }] } }), null);
});

test('repairStackLayers reflows two content layers into a col instead of overlaying them', () => {
  // Two headline layers on one rect would print on top of each other; layout QA
  // would then reject the page as text-on-text and send it to the fixed template.
  const spec = normalizeLayoutSpec({
    root: {
      kind: 'stack',
      layers: [
        { kind: 'leaf', role: 'headline', contentRef: 'headline' },
        { kind: 'leaf', role: 'headline', contentRef: 'headline2' },
      ],
    },
  });
  assert.ok(spec);
  const root = spec!.root as { kind: string; justify?: string; children?: { sizing?: string }[] };
  assert.equal(root.kind, 'col', 'a no-backing content stack should BECOME the col');
  assert.equal(root.justify, 'center', 'centring keeps the flowed lines tight (and dodges the FR-guarantee)');
  assert.deepEqual(root.children!.map((c) => c.sizing), ['content', 'content']);
});

test('a stack with backing keeps the backing and nests only the content layers', () => {
  const spec = normalizeLayoutSpec({
    root: {
      kind: 'stack',
      layers: [
        { kind: 'leaf', role: 'image', contentRef: 'hero' },
        { kind: 'leaf', role: 'shape', colorRef: 'text' },
        { kind: 'leaf', role: 'kicker', contentRef: 'kicker' },
        { kind: 'leaf', role: 'headline', contentRef: 'headline' },
      ],
    },
  });
  assert.ok(spec);
  const root = spec!.root as { kind: string; layers: { kind: string; role?: string }[] };
  assert.equal(root.kind, 'stack');
  assert.equal(root.layers.length, 3, 'image + shape + one wrapped col');
  assert.equal(root.layers[0]!.role, 'image');
  assert.equal(root.layers[1]!.role, 'shape');
  assert.equal(root.layers[2]!.kind, 'col', 'the two text layers flow down a col');
});

test('a single-content stack is left exactly as authored', () => {
  const spec = normalizeLayoutSpec({
    root: {
      kind: 'stack',
      layers: [
        { kind: 'leaf', role: 'image', contentRef: 'hero' },
        { kind: 'leaf', role: 'headline', contentRef: 'headline' },
      ],
    },
  });
  assert.ok(spec);
  const root = spec!.root as { kind: string; layers: { role?: string }[] };
  assert.equal(root.kind, 'stack');
  assert.deepEqual(root.layers.map((l) => l.role), ['image', 'headline']);
});

test('contentRef is trimmed and length-capped', () => {
  const spec = normalizeLayoutSpec({
    root: { kind: 'leaf', role: 'body', contentRef: `  ${'x'.repeat(500)}  ` },
  });
  assert.ok(spec);
  const ref = (spec!.root as { contentRef?: string }).contentRef!;
  assert.equal(ref.length, 64);
  assert.equal(ref, 'x'.repeat(64));
});
