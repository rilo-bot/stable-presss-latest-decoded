// ---------------------------------------------------------------------------
// The fallback designs and the art director's brief.
//
// A page whose art-director call fails is built from its PAGE TYPE's seed, so every
// seed must be a page the QA layer passes clean with the copy the pipeline would write
// for it (seedHarness: drafting pre-solve → copy to each box's budget → prune → balance
// → compose → QA). And the brief must actually carry what makes issues differ: the
// type's layout guide, the issue's visual system, and a composition steer that varies
// by issue and by occurrence.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PAGE_TYPE_SEEDS, SEED_SPECS, seedSpecForPage, seedSpecFor } from '../../src/lib/magazineV2/seedSpecs.js';
import { PAGE_TYPES } from '../../src/lib/magazineV2/pageTypes.js';
import { normalizeLayoutSpec, countLeaves, treeDepth, expandSpecDevices, MAX_LEAVES, MAX_TREE_DEPTH, type LayoutNode, type LayoutSpec } from '../../src/lib/magazineV2/layoutSpec.js';
import { archetypeForPage, typesWithoutArchetype, familyLayoutSteer } from '../../src/lib/magazineV2/layoutArchetypes.js';
import { artDirectorSystem, artDirectorBrief } from '../../src/lib/magazineV2/artDirectorPrompt.js';
import { PAGE_TEMPLATE_KINDS } from '../../src/lib/magazineV2/templates.js';
import { solveLayout } from '../../src/lib/magazineV2/solveLayout.js';
import { draftingMeasure } from '../../src/lib/magazineV2/measureLeaf.js';
import { runSpec, PALETTE, FONTS, PAGE } from './seedHarness.js';

test('every page type has a seed of its own', () => {
  for (const t of PAGE_TYPES) assert.ok(PAGE_TYPE_SEEDS[t.id], `no seed for "${t.id}"`);
  for (const k of PAGE_TEMPLATE_KINDS) assert.ok(SEED_SPECS[k], `no seed for kind "${k}"`);
});

for (const t of PAGE_TYPES) {
  test(`seed "${t.id}" passes layout QA clean with the copy the pipeline writes for it`, () => {
    const r = runSpec(seedSpecForPage({ kind: t.baseKind, pageType: t.id }));
    assert.deepEqual(r.report.issues, [], 'no collision, nothing off the page, no overflow');
    assert.deepEqual(r.report.advisories.map((a) => `${a.kind}: ${a.detail}`), [], 'no sliver, no oversize box, no dead band');
    assert.equal(r.flaws, 0, r.fit.findings.map((f) => `${f.kind}@${f.where}: ${f.detail}`).join('\n'));
    assert.ok(r.elements.filter((e) => e.type === 'text' || e.type === 'image').length >= 4, 'a real page, not a sketch');
  });
}

test('seeds stay inside the caps the art-director is held to, and survive the trust boundary', () => {
  for (const [id, seed] of Object.entries(PAGE_TYPE_SEEDS)) {
    assert.ok(countLeaves(seed.root) <= MAX_LEAVES, `${id}: ${countLeaves(seed.root)} leaves`);
    assert.ok(treeDepth(seed.root) <= MAX_TREE_DEPTH, `${id}: depth ${treeDepth(seed.root)}`);
    const n = normalizeLayoutSpec(JSON.parse(JSON.stringify(seed)));
    assert.ok(n, `${id} normalizes`);
    // Normalize spells out defaults (weight 1, sizing fr); what must not change is the page.
    const boxes = (s: LayoutSpec) => solveLayout(s, PAGE, { measureLeaf: draftingMeasure(FONTS) }).leaves.map((l) => `${l.node.role}:${l.box.x},${l.box.y},${l.box.w},${l.box.h}`);
    assert.deepEqual(boxes(n!), boxes(expandSpecDevices(seed)), `${id} solves identically after crossing the trust boundary`);
  }
});

test('seeds are genuinely different designs, not one skeleton relabelled', () => {
  const sig = (n: LayoutNode): string =>
    n.kind === 'leaf' ? n.role : n.kind === 'stack' ? `S(${n.layers.map(sig).join(',')})` : `${n.kind}${n.grid ? 'G' : ''}(${n.children.map((c) => `${c.span ?? ''}${sig(c.node)}`).join(',')})`;
  const sigs = new Set(Object.values(PAGE_TYPE_SEEDS).map((s) => sig(s.root)));
  assert.equal(sigs.size, Object.keys(PAGE_TYPE_SEEDS).length);
  // …and between them they use the whole device vocabulary.
  const all = JSON.stringify(PAGE_TYPE_SEEDS);
  for (const device of ['"bleed":true', '"overlap"', '"place"', '"grid":12', '"dropCap":true', '"rule"', '"glyph"', '"thickness"']) {
    assert.ok(all.includes(device), `no seed uses ${device}`);
  }
});

test('seedSpecForPage: the type\'s own seed, a fresh copy, sugar expanded; unknown types fall back by kind', () => {
  const a = seedSpecForPage({ kind: 'two-column-article', pageType: 'interview-qa' });
  const b = seedSpecForPage({ kind: 'two-column-article', pageType: 'interview-qa' });
  assert.notEqual(a, b);
  (a.root as { kind: string }).kind = 'mutated';
  assert.notEqual((seedSpecForPage({ kind: 'two-column-article', pageType: 'interview-qa' }).root as { kind: string }).kind, 'mutated');
  assert.ok(!JSON.stringify(a).includes('"rule":'), 'rules are expanded into shapes');
  const fallback = seedSpecForPage({ kind: 'photo-grid', pageType: 'no-such-type' });
  assert.ok(fallback.root);
  assert.deepEqual(seedSpecFor('cover').root, expandSpecDevices(SEED_SPECS.cover).root);
});

// ── The steer ───────────────────────────────────────────────────────────────

test('every page type has archetypes of its own to be steered to', () => {
  assert.deepEqual(typesWithoutArchetype(), []);
});

test('the steer varies BY ISSUE and BY OCCURRENCE — the "same template" complaint, mechanically', () => {
  const pages = [
    { kind: 'cover' as const, pageType: 'cover' },
    { kind: 'two-column-article' as const, pageType: 'feature-article' },
    { kind: 'two-column-article' as const, pageType: 'feature-article' },
    { kind: 'two-column-article' as const, pageType: 'feature-article' },
  ];
  // Within one issue, repeated types rotate through the shelf.
  const plan = { title: 'The New Zealand Racing Scene', pages };
  const p2 = archetypeForPage(plan, pages[1]!, 2).primary.id;
  const p3 = archetypeForPage(plan, pages[2]!, 3).primary.id;
  assert.notEqual(p2, p3, 'the second feature article is steered elsewhere');
  // Deterministic: a retry gets the same steer.
  assert.equal(archetypeForPage(plan, pages[1]!, 2).primary.id, p2);
  // Across issues, the starting point moves.
  const starts = new Set(
    ['Racing Recast', 'Bloodlines', 'Spring Carnival', 'The Yearling Issue', 'Country Cups', 'Stable Life', 'Winter Gallops', 'Raceday Style']
      .map((title) => archetypeForPage({ title, pages }, pages[0]!, 1).primary.id),
  );
  assert.ok(starts.size >= 2, 'different issues open with different covers');
  // Neighbours are never steered to the same composition (shelves permitting).
  const mixed = { title: 'Any', pages: PAGE_TYPES.map((t) => ({ kind: t.baseKind, pageType: t.id })) };
  for (let n = 2; n <= mixed.pages.length; n++) {
    const a = archetypeForPage(mixed, mixed.pages[n - 2]!, n - 1).primary;
    const b = archetypeForPage(mixed, mixed.pages[n - 1]!, n);
    if (b.others.length > 0) assert.notEqual(a.id, b.primary.id, `pages ${n - 1} and ${n} share "${a.id}"`);
  }
});

test('the family steer reads the Creative Director\'s family, with a keyword fallback', () => {
  assert.match(familyLayoutSteer({ family: 'bold-sport' }), /bleed/i);
  assert.match(familyLayoutSteer({ family: 'unknown', mood: 'Hushed, refined luxury' }), /margins/i);
  assert.equal(familyLayoutSteer(undefined), '');
});

// ── The brief ───────────────────────────────────────────────────────────────

const plan = {
  title: 'Racing, Recast',
  subtitle: 'Aotearoa at pace',
  palette: PALETTE,
  fonts: FONTS,
  pages: [
    { kind: 'cover' as const, pageType: 'cover' },
    { kind: 'feature-full-bleed' as const, pageType: 'feature-opener' },
    { kind: 'two-column-article' as const, pageType: 'profile' },
  ],
  concept: { family: 'heritage-racing', name: 'Silks & Sepia', mood: 'Storied and warm.', grid: 'Classical 12-column grid', typeVoice: 'Old-style serif, small caps', motifs: ['double rules', 'dates as display figures'] },
};

test('the system brief teaches the device vocabulary and carries the issue\'s one visual system', () => {
  const sys = artDirectorSystem(plan, 'SUBJECT: racing.');
  for (const w of ['"grid":12', '"bleed":true', '"overlap"', '"place"', 'dropCap', '"rule"', 'glyph', 'thickness', 'rotate']) assert.ok(sys.includes(w), `brief lacks ${w}`);
  assert.match(sys, /Silks & Sepia/);
  assert.match(sys, /double rules/);
  assert.match(sys, /Classical 12-column grid/);
  assert.match(sys, /drop caps on every article/, 'the family steer is included');
  assert.match(sys, /SUBJECT: racing\./);
  // Compact: the old brief plus its archetype library ran to ~16k characters.
  assert.ok(sys.length < 13000, `system brief is ${sys.length} chars`);
});

test('the page brief carries the type\'s layout guide, a composition to start from, and the neighbours', () => {
  const brief = artDirectorBrief(plan, { kind: 'two-column-article', pageType: 'profile', intent: 'A trainer\'s first season', sectionTitle: 'People' }, 3, { retryHint: 'dead band under the title' });
  assert.match(brief, /"Profile" page/);
  assert.ok(brief.includes(PAGE_TYPES.find((t) => t.id === 'profile')!.layoutGuide));
  assert.match(brief, /START FROM THIS COMPOSITION/);
  assert.match(brief, /p2 Feature opener/);
  assert.match(brief, /FAILED THE QUALITY CHECK: dead band under the title/);
});

test('a plan stored before page types and concepts still gets a working brief', () => {
  const old = { title: 'Old', palette: PALETTE, fonts: FONTS, pages: [{ kind: 'pull-quote' as const }] };
  assert.ok(artDirectorSystem(old, '').length > 1000);
  assert.match(artDirectorBrief(old, { kind: 'pull-quote', intent: 'a quote' }, 1), /Quote page/);
  const s: LayoutSpec = seedSpecForPage({ kind: 'pull-quote' });
  assert.ok(s.root);
});
