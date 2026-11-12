// ---------------------------------------------------------------------------
// The QA loop can now SEE slivers, oversize boxes and dead bands — and the pieces that
// prevent them hold: a scrim that blankets the sheet is lightened, and a section that
// lost its body loses its stranded heading too.
//
// Before this, a page carrying a 74px photo strip, a 787px title box and a 660px stripe
// of bare paper measured CLEAN: validatePageLayout said ok, fitReport counted nothing,
// and the page shipped on its first attempt.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fitReport, fitHint, seriousFlaws } from '../../src/lib/magazineV2/fitReport.js';
import { validatePageLayout, pageQuality } from '../../src/lib/magazineV2/layoutValidate.js';
import { composeFromSolved } from '../../src/lib/magazineV2/composeFromSolved.js';
import { pruneLayoutSpec } from '../../src/lib/magazineV2/pruneSpec.js';
import { MAX_COVERING_SCRIM_OPACITY } from '../../src/lib/magazineV2/layoutQuality.js';
import type { SolvedLayout } from '../../src/lib/magazineV2/solveLayout.js';
import type { LayoutNode, LayoutSpec, LeafNode } from '../../src/lib/magazineV2/layoutSpec.js';
import type { ResolvedContent } from '../../src/lib/magazineV2/composeFromSolved.js';
import type { MagazineElement } from '../../src/lib/magazineV2/model.js';
import { PAGE_W, PAGE_H } from '../../src/lib/magazineV2/config.js';

const PAGE = { width: PAGE_W, height: PAGE_H };
const fonts = { display: 'Oswald, Arial, sans-serif', body: "Georgia, 'Times New Roman', serif" };
const palette = { primary: '#0B1F3A', secondary: '#7E929B', accent: '#B72E3B', bg: '#F7F5EF', text: '#121820' };
const photo = (ref: string) => ({ image: { url: `https://cdn.example.com/${ref}.jpg`, assetId: ref, alt: '' } });

const solvedOf = (leaves: [Partial<LeafNode> & { role: string }, [number, number, number, number]][]): SolvedLayout => ({
  background: { ref: 'bg' },
  margin: 60,
  page: PAGE,
  leaves: leaves.map(([node, [x, y, w, h]], i) => ({ node: { kind: 'leaf', ...node } as LeafNode, box: { x, y, w, h }, z: i })),
});

// ── fitReport ───────────────────────────────────────────────────────────────

test('fitReport counts a sliver photo — it used to say nothing about images at all', () => {
  const fit = fitReport(
    solvedOf([
      [{ role: 'headline', contentRef: 'h', fontPt: 40 }, [60, 60, 1000, 100]],
      [{ role: 'body', contentRef: 'b', fontPt: 10 }, [60, 180, 980, 1514]],
      [{ role: 'image', contentRef: 'strip' }, [1106, 60, 74, 1634]],
    ]),
    { h: { text: 'Tradition, Recast' }, b: { text: 'Copy. '.repeat(900) }, strip: photo('strip') },
    fonts,
  );
  const sliver = fit.findings.find((f) => f.kind === 'sliver');
  assert.ok(sliver, fit.findings.map((f) => f.kind).join(', '));
  assert.match(sliver!.detail, /74×1634/);
  assert.ok(seriousFlaws(fit) >= 1);
  assert.match(fitHint(fit), /strip: the photo is 74×1634px/);
});

test('fitReport counts a dead band, measured from the type’s real lines rather than its box', () => {
  // The page-4 shape: a 787px title box holding two lines, then the photo grid.
  const content: ResolvedContent = { h: { text: 'Stars in the Making' }, grid: photo('grid') };
  const fit = fitReport(
    solvedOf([
      [{ role: 'headline', contentRef: 'h', fontPt: 44 }, [60, 60, 549, 787]],
      [{ role: 'image', contentRef: 'grid' }, [60, 907, 1120, 787]],
    ]),
    content,
    fonts,
  );
  const band = fit.findings.find((f) => f.kind === 'deadband');
  assert.ok(band, fit.findings.map((f) => f.kind).join(', '));
  assert.match(band!.detail, /dead band/);
  assert.ok(seriousFlaws(fit) >= 2, 'the slack box AND the band it leaves are both counted');

  // The same title hugging its copy, with the photo taking the room: clean.
  const fixed = fitReport(
    solvedOf([
      [{ role: 'headline', contentRef: 'h', fontPt: 44 }, [60, 60, 549, 200]],
      [{ role: 'image', contentRef: 'grid' }, [60, 320, 1120, 1374]],
    ]),
    content,
    fonts,
  );
  assert.deepEqual(fixed.findings.filter((f) => f.kind === 'deadband' || f.kind === 'sliver'), []);
});

test('a photo under a near-opaque wash is not ink — that is the black-gap page; at the capped wash it is', () => {
  const content: ResolvedContent = { hero: photo('hero'), h: { text: 'Karaka Calls' }, cap: { text: 'A caption at the foot.' } };
  const page = (opacity: number) =>
    solvedOf([
      [{ role: 'image', contentRef: 'hero' }, [0, 0, PAGE_W, PAGE_H]],
      [{ role: 'shape', opacity }, [0, 0, PAGE_W, PAGE_H]],
      [{ role: 'headline', contentRef: 'h', fontPt: 42 }, [96, 96, 1048, 100]],
      [{ role: 'caption', contentRef: 'cap', fontPt: 9 }, [96, 1630, 1048, 28]],
    ]);
  // An exact 0.88 wash is CAPPED to the covering ceiling when composed — so even a page
  // that asked for 0.88 prints with its photo showing, and measures that way.
  assert.ok(MAX_COVERING_SCRIM_OPACITY < 0.8);
  assert.deepEqual(fitReport(page(0.88), content, fonts).findings.filter((f) => f.kind === 'deadband'), []);
  // A wash that really hides the photo (a small, dark band) does count — see layoutValidate below.
});

// ── layoutValidate: element-level advisories, never changing `ok` ───────────

const textEl = (id: string, x: number, y: number, w: number, h: number, content: string, fontSize = 92, z = 1): MagazineElement =>
  ({ id, type: 'text', x, y, w, h, rotation: 0, zIndex: z, locked: false, source: 'ai-agent', text: { content, role: 'headline', fontFamily: fonts.display, fontSize, maxFontSize: fontSize, fontWeight: 800, color: '#121820', align: 'left', lineHeight: 1.05, autoFit: 'shrink' } }) as MagazineElement;
const imgEl = (id: string, x: number, y: number, w: number, h: number, z = 0): MagazineElement =>
  ({ id, type: 'image', x, y, w, h, rotation: 0, zIndex: z, locked: false, source: 'ai-agent', image: { assetId: id, url: `https://cdn.example.com/${id}.jpg`, alt: '', fit: 'cover' } }) as MagazineElement;
const shapeEl = (id: string, x: number, y: number, w: number, h: number, opacity: number, z: number): MagazineElement =>
  ({ id, type: 'shape', x, y, w, h, rotation: 0, zIndex: z, locked: false, source: 'ai-agent', shape: { fill: '#0B1F3A', opacity } }) as MagazineElement;

test('validatePageLayout reports the three quality defects as ADVISORIES — `ok` and `issues` are unchanged', () => {
  const els = [
    textEl('title', 60, 60, 549, 787, 'Stars in the Making'),
    imgEl('ribbon', 729, 913, 451, 28),
    imgEl('photo', 60, 907, 529, 787),
  ];
  const report = validatePageLayout(els, PAGE);
  assert.equal(report.ok, true, 'still a LEGAL page — nothing here may send it to a fallback');
  assert.deepEqual(report.issues, []);
  const kinds = report.advisories.map((a) => a.kind).sort();
  assert.deepEqual(kinds, ['dead-band', 'empty-box', 'sliver']);
});

test('pageQuality: a photo hidden under a dark full-page wash is not ink; furniture is never content', () => {
  const els = [
    imgEl('hero', 0, 0, PAGE_W, PAGE_H, 0),
    shapeEl('wash', 0, 0, PAGE_W, PAGE_H, 0.88, 1),
    textEl('h', 96, 153, 1048, 120, 'Karaka Calls', 87, 3),
    textEl('cap', 96, 1633, 1048, 25, 'At Karaka, pedigree shapes every bid.', 18, 8),
    textEl('furniture-folio', 60, 900, 100, 20, '5', 16, 990),
  ];
  const hidden = pageQuality(els, PAGE);
  assert.equal(hidden.deadBands.length, 1, 'the "black gap" between the headline and the caption');
  const shown = pageQuality(els.map((e) => (e.id === 'wash' ? { ...e, shape: { ...e.shape!, opacity: 0.7 } } : e)), PAGE);
  assert.deepEqual(shown.deadBands, [], 'at the capped wash the photograph is the content');
});

// ── composeFromSolved caps a covering scrim ─────────────────────────────────

test('a scrim spread over the whole sheet prints at the ceiling, a small one as asked', () => {
  const solved = solvedOf([
    [{ role: 'image', contentRef: 'hero' }, [0, 0, PAGE_W, PAGE_H]],
    [{ role: 'shape', opacity: 0.88 }, [0, 0, PAGE_W, PAGE_H]],
    [{ role: 'image', contentRef: 'inset' }, [60, 1200, 600, 400]],
    [{ role: 'shape', opacity: 0.9 }, [60, 1200, 600, 400]],
  ]);
  const { elements } = composeFromSolved(solved, { hero: photo('hero'), inset: photo('inset') }, { palette, fonts });
  const shapes = (elements as MagazineElement[]).filter((e) => e.type === 'shape');
  assert.equal(shapes[0]!.shape!.opacity, MAX_COVERING_SCRIM_OPACITY);
  assert.equal(shapes[1]!.shape!.opacity, 0.9);
});

// ── pruneSpec: a section that lost its body loses its stranded heading ──────

const leaf = (role: string, contentRef: string): LayoutNode => ({ kind: 'leaf', role, contentRef }) as LayoutNode;
const c = (node: LayoutNode) => ({ weight: 1, sizing: 'content' as const, node });

test('a venue whose body came back empty loses its date line and heading too — the Trentham defect', () => {
  const spec: LayoutSpec = {
    page: { background: { ref: 'bg' }, margin: 'lg' },
    root: {
      kind: 'col',
      children: [
        c(leaf('caption', 'date2')), c(leaf('subhead', 'venue2')), c(leaf('body', 'body2')),
        c(leaf('caption', 'date3')), c(leaf('subhead', 'venue3')), { weight: 1, sizing: 'fr', node: leaf('body', 'body3') },
      ],
    },
  };
  const content: ResolvedContent = {
    date2: { text: 'January: Wellington Cup week.' }, venue2: { text: 'Trentham' },
    date3: { text: 'Spring: Cup week in Canterbury.' }, venue3: { text: 'Riccarton Park' }, body3: { text: 'Riccarton supplies the spring summit.' },
  };
  const pruned = pruneLayoutSpec(spec, content)!;
  const refs = (pruned.root as { children: { node: { contentRef?: string } }[] }).children.map((k) => k.node.contentRef);
  assert.deepEqual(refs, ['date3', 'venue3', 'body3'], 'no heading is left standing over nothing');
});

test('nested sections: a card reduced to its headings goes when its twin kept a body', () => {
  const card = (n: number): LayoutNode => ({ kind: 'col', children: [c(leaf('kicker', `k${n}`)), c(leaf('subhead', `s${n}`)), c(leaf('body', `b${n}`))] });
  const spec: LayoutSpec = { page: { margin: 'lg' }, root: { kind: 'row', children: [1, 2].map((n) => ({ weight: 1, sizing: 'fr' as const, node: card(n) })) } };
  const content: ResolvedContent = { k1: { text: 'NORTH' }, s1: { text: 'Ellerslie' }, k2: { text: 'SOUTH' }, s2: { text: 'Riccarton' }, b2: { text: 'Body.' } };
  const pruned = pruneLayoutSpec(spec, content)!;
  assert.equal((pruned.root as { children: unknown[] }).children.length, 1);
});

test('a photo’s own caption is never mistaken for a stranded heading', () => {
  const spec: LayoutSpec = {
    page: { margin: 'lg' },
    root: {
      kind: 'col',
      children: [
        c(leaf('image', 'p1')), c(leaf('caption', 'cap1')), c(leaf('body', 'b1')),
        c(leaf('image', 'p2')), c(leaf('caption', 'cap2')), { weight: 1, sizing: 'fr', node: leaf('body', 'b2') },
      ],
    },
  };
  const pruned = pruneLayoutSpec(spec, { p1: photo('p1'), cap1: { text: 'The yearling ring.' }, p2: photo('p2'), cap2: { text: 'Dawn work.' }, b2: { text: 'Body.' } })!;
  const refs = (pruned.root as { children: { node: { contentRef?: string } }[] }).children.map((k) => k.node.contentRef);
  assert.deepEqual(refs, ['p1', 'cap1', 'p2', 'cap2', 'b2']);
});

test('a page masthead over an empty body is NOT an orphan — there is no twin to compare it with', () => {
  const spec: LayoutSpec = {
    page: { margin: 'lg' },
    root: { kind: 'col', children: [c(leaf('kicker', 'k')), c(leaf('headline', 'h')), c(leaf('body', 'b1')), { weight: 1, sizing: 'fr', node: leaf('body', 'b2') }] },
  };
  const pruned = pruneLayoutSpec(spec, { k: { text: 'FEATURE' }, h: { text: 'Karaka Calls' }, b2: { text: 'The body that did arrive.' } })!;
  const refs = (pruned.root as { children: { node: { contentRef?: string } }[] }).children.map((k) => k.node.contentRef);
  assert.deepEqual(refs, ['k', 'h', 'b2']);
});
