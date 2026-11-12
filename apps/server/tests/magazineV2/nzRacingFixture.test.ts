// ---------------------------------------------------------------------------
// REGRESSION — "The New Zealand Racing Scene", a real 6-page generated issue.
//
// fixtures/nz-racing-scene.json is a read-only dump of the issue the user reported as
// "the positioning of image and content is not proper, some images are similar size,
// some pages have just black gaps". Measured on the stored pages:
//
//   p1  cover masthead in a 740px box (one line of type), last cover line in 523px,
//       cover lines printing "PAGE 2 — …PAGE 6 —" (and page 5 missing)
//   p2  a 74×1634 photo strip down the contents page
//   p3  a 283px stripe of bare paper under the title; "3 — THREE COURSES, ONE SEASON:"
//       printed under the headline "Three Courses, One Season"; Trentham with no body
//   p4  a 787px title row holding ~190px of type, a 660px dead band under it, a 451×28
//       ribbon and a 529×123 (4.3:1) photo; every item numbered "04 —"
//   p5  a 1173px masthead box over a photo hidden under a 0.88 wash: a 1119px black gap
//   p6  a 403×1183 photo (aspect 0.34)
//
// Three things are pinned here, all offline (no model, no database, no network):
//   1. the QA can SEE every one of those defects on the stored pages;
//   2. the Adjust pass (relayoutPage + copy hygiene) repairs the stored pages;
//   3. the GENERATOR path — the art-director's trees for these pages, rebuilt from the
//      stored geometry, run through prune → solve → compose — reproduced the defects,
//      and with the balancer it does not.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { pageQuality, validatePageLayout } from '../../src/lib/magazineV2/layoutValidate.js';
import { relayoutPage } from '../../src/lib/magazineV2/relayoutPage.js';
import { pageCopyEdits } from '../../src/lib/magazineV2/copyHygiene.js';
import { pruneLayoutSpec } from '../../src/lib/magazineV2/pruneSpec.js';
import { solveLayout } from '../../src/lib/magazineV2/solveLayout.js';
import { balanceLayout } from '../../src/lib/magazineV2/balanceLayout.js';
import { makeMeasureLeaf } from '../../src/lib/magazineV2/measureLeaf.js';
import { composeFromSolved, type ResolvedContent } from '../../src/lib/magazineV2/composeFromSolved.js';
import { normalizeElements } from '../../src/lib/magazineV2/writePipeline.js';
import { fitReport } from '../../src/lib/magazineV2/fitReport.js';
import { imageShapeProblem } from '../../src/lib/magazineV2/layoutQuality.js';
import { FURNITURE_IDS } from '../../src/lib/magazineV2/pageFurniture.js';
import type { MagazineElement } from '../../src/lib/magazineV2/model.js';
import type { LayoutChild, LayoutNode, LayoutSpec } from '../../src/lib/magazineV2/layoutSpec.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(fs.readFileSync(path.join(here, 'fixtures', 'nz-racing-scene.json'), 'utf8')) as {
  magazine: { genTheme: { palette: Record<string, string> & { primary: string; secondary: string; accent: string; bg: string; text: string }; fonts: { display: string; body: string } }; genPlanPages: { kind: string; sectionTitle: string }[] };
  pages: { index: number; width: number; height: number; elements: MagazineElement[] }[];
};
const theme = { palette: fx.magazine.genTheme.palette, fonts: fx.magazine.genTheme.fonts };
const pageN = (n: number) => fx.pages[n - 1]!;
const dims = (n: number) => ({ width: pageN(n).width, height: pageN(n).height });
const plain = (s: string) => s.replace(/<[^>]+>/g, '').trim();
const textOf = (n: number, startsWith: string): string => {
  const el = pageN(n).elements.find((e) => e.type === 'text' && plain(e.text!.content).startsWith(startsWith));
  assert.ok(el, `page ${n} has no text starting "${startsWith}"`);
  return el!.text!.content;
};
const longestBand = (els: MagazineElement[], d: { width: number; height: number }) =>
  Math.max(0, ...pageQuality(els, d).deadBands.map((b) => b.y1 - b.y0));

// ── 1. The QA sees what the user saw ────────────────────────────────────────

test('BEFORE: every reported defect is measured on the stored pages', () => {
  const q = (n: number) => pageQuality(pageN(n).elements, dims(n));
  assert.equal(q(1).emptyBoxes.length, 2, 'the masthead box and the stretched last cover line');
  assert.match(q(2).slivers[0]!.problem.detail, /74×1634/);
  assert.ok(longestBand(pageN(3).elements, dims(3)) >= 250, 'the stripe under the page-3 title');
  const p4 = q(4);
  assert.deepEqual(p4.slivers.map((s) => s.problem.kind).sort(), ['tiny', 'too-wide']);
  assert.ok(longestBand(pageN(4).elements, dims(4)) >= 600, 'the band under the page-4 title row');
  assert.ok(longestBand(pageN(5).elements, dims(5)) >= 1000, 'the black gap: a photo hidden under a 0.88 wash');
  assert.equal(q(6).slivers[0]!.problem.kind, 'too-tall');
  // …and on every one of them the old QA said "fine".
  for (const p of fx.pages) assert.equal(validatePageLayout(p.elements, { width: p.width, height: p.height }).ok, true);
});

// ── 2. Adjust repairs the stored pages ──────────────────────────────────────

function adjust(n: number) {
  const p = pageN(n);
  const plan = fx.magazine.genPlanPages[p.index]!;
  const edits = pageCopyEdits(p.elements, [], { pageKind: plan.kind, totalPages: fx.pages.length, sectionTitle: plan.sectionTitle });
  const byId = new Map(edits.map((e) => [e.elementId, e.content]));
  const edited = p.elements.map((e) => (byId.has(e.id) && e.text ? { ...e, text: { ...e.text, content: byId.get(e.id)! } } : e));
  const r = relayoutPage(edited, dims(n));
  assert.ok(r, `page ${n} could not be re-balanced`);
  return { edits, r: r!, before: p.elements };
}

test('AFTER Adjust: no sliver, no oversize box, and no dead band where the page has the content to fill it', () => {
  for (let n = 1; n <= 6; n++) {
    const { r } = adjust(n);
    assert.deepEqual(r.after.slivers, [], `page ${n} slivers`);
    assert.deepEqual(r.after.emptyBoxes, [], `page ${n} oversize boxes`);
    if (n !== 2) assert.deepEqual(r.after.deadBands, [], `page ${n} dead bands`);
    for (const e of r.elements.filter((x) => x.type === 'image')) assert.equal(imageShapeProblem(e, dims(n)), null, `page ${n} photo ${e.w}×${e.h}`);
  }
});

test('AFTER Adjust, page 2 loses its photo strip and says it is short of copy rather than hiding it', () => {
  const { r } = adjust(2);
  assert.equal(r.removes.length, 1, 'the 74px strip cannot be a photograph anywhere on this page');
  // The stored contents page lists four invented stories with no page numbers or
  // descriptions; there is not enough copy to fill it, and the report says so.
  assert.ok(r.after.deadBands.length > 0);
});

test('Adjust never collides, never leaves the sheet, never touches furniture or the stacking order', () => {
  for (let n = 1; n <= 6; n++) {
    const { r, before } = adjust(n);
    const d = dims(n);
    assert.ok(validatePageLayout(r.elements, d).issues.filter((i) => i.kind !== 'overflow').length === 0, `page ${n} hard issues`);
    for (const id of FURNITURE_IDS) {
      const was = before.find((e) => e.id === id);
      const now = r.elements.find((e) => e.id === id);
      assert.deepEqual(now, was, `page ${n} furniture ${id}`);
    }
    for (const e of r.elements) assert.equal(e.zIndex, before.find((b) => b.id === e.id)!.zIndex);
    assert.equal(r.elements.length, before.length - r.removes.length);
  }
});

test('Adjust makes the photographs the beneficiaries: page 4’s four photos end up sane and equal per column', () => {
  const { r } = adjust(4);
  const photos = r.elements.filter((e) => e.type === 'image');
  assert.equal(photos.length, 4);
  for (const p of photos) assert.ok(p.w / p.h >= 0.8 && p.w / p.h <= 1.3, `${p.w}×${p.h}`);
  const title = r.elements.find((e) => e.type === 'text' && plain(e.text!.content) === 'Stars in the Making')!;
  assert.ok(title.h < 250, `the title row hugs its type (${title.h}px, was 787)`);
});

test('Adjust over a photo: masthead up top, the rest at the foot, and the black wash lightened', () => {
  const p5 = adjust(5).r;
  assert.deepEqual(p5.scrims.map((s) => s.opacity), [0.7]);
  const head = p5.elements.find((e) => e.type === 'text' && plain(e.text!.content) === 'Karaka Calls')!;
  assert.ok(head.h < 120, `masthead hugs (${head.h}px, was 1173)`);
  const p1 = adjust(1).r;
  const lines = p1.elements.filter((e) => e.type === 'text' && /CUP WEEK|THE NEXT FURLONG/.test(plain(e.text!.content)));
  assert.equal(lines.length, 2);
  const last = lines.find((e) => /THE NEXT FURLONG/.test(plain(e.text!.content)))!;
  assert.equal(last.y + last.h, 1754 - 96, 'cover lines anchored at the foot of the cover');
});

test('Adjust cleans the printed plumbing out of the stored copy', () => {
  const after = (n: number) => {
    const { edits } = adjust(n);
    return edits.map((e) => plain(e.content));
  };
  const cover = after(1);
  assert.equal(cover.length, 4);
  assert.ok(cover.every((t) => !/^PAGE\b/i.test(t)), cover.join(' | '));
  assert.ok(cover.includes('CUP WEEK: Tradition, theatre and top-flight racing converge at Riccarton.'));
  const grid = after(4);
  assert.equal(grid.length, 4);
  assert.ok(grid.every((t) => !/^04\b/.test(t)), grid.join(' | '));
  assert.deepEqual(after(3), ['The carnivals that give the national calendar its rhythm.']);
  assert.deepEqual(after(6), [], 'a real 01–05 sequence keeps its numbers');
});

// ── 3. The generator path, before and after the balancer ────────────────────

const leaf = (role: string, contentRef: string, extra: Record<string, unknown> = {}): LayoutNode =>
  ({ kind: 'leaf', role, contentRef, ...extra }) as LayoutNode;
const fr = (node: LayoutNode, weight = 1): LayoutChild => ({ weight, sizing: 'fr', node });
const hug = (node: LayoutNode): LayoutChild => ({ weight: 1, sizing: 'content', node });
const photo = (ref: string) => ({ image: { url: `https://cdn.example.com/fixture/${ref}.png`, assetId: ref, alt: '' } });

function generate(spec: LayoutSpec, content: ResolvedContent, balanced: boolean) {
  const page = { width: 1240, height: 1754 };
  const pruned = pruneLayoutSpec(spec, content)!;
  const measure = makeMeasureLeaf(content, theme.fonts);
  const b = balanced ? balanceLayout(pruned, { page, measure, content }) : null;
  const solved = b ? b.solved : solveLayout(pruned, page, { measureLeaf: measure });
  const used = b ? b.content : content;
  const elements = normalizeElements(composeFromSolved(solved, used, theme).elements, page);
  return { elements, report: validatePageLayout(elements, page), fit: fitReport(solved, used, theme.fonts), quality: pageQuality(elements, page) };
}

const clean = (g: ReturnType<typeof generate>, label: string) => {
  assert.equal(g.report.ok, true, `${label}: ${g.report.issues.map((i) => i.detail).join('; ')}`);
  assert.deepEqual(g.report.advisories.map((a) => a.kind), [], `${label}: ${g.report.advisories.map((a) => a.detail).join('; ')}`);
  assert.deepEqual(g.fit.findings.filter((f) => f.kind === 'sliver' || f.kind === 'deadband'), [], label);
};

test('GENERATOR p4: the art-director’s tree reproduces the ribbon photos and the dead band — and balanced, does not', () => {
  const content: ResolvedContent = {
    headline: { text: 'Stars in the Making' },
    deck: { text: textOf(4, 'Meet the emerging') },
  };
  const card = (i: number, w: number, label: string, cap: string): LayoutChild => {
    content[`photo${i}`] = photo(`p${i}`);
    content[`entry${i}`] = { text: textOf(4, `04 — ${label}`) };
    content[`cap${i}`] = { text: textOf(4, cap) };
    return fr({ kind: 'col', gap: 'xs', children: [fr(leaf('image', `photo${i}`), 3), hug(leaf('label', `entry${i}`, { fontPt: 15, weightHint: 800 })), hug(leaf('caption', `cap${i}`, { fontPt: 9.5 }))] }, w);
  };
  const spec: LayoutSpec = {
    page: { background: { ref: 'bg' }, margin: 'lg' },
    root: {
      kind: 'col',
      gap: 'lg',
      children: [
        fr({ kind: 'row', gap: 140, children: [fr(leaf('headline', 'headline', { fontPt: 44 }), 5), fr(leaf('subhead', 'deck', { fontPt: 13.5 }), 4)] }),
        fr({
          kind: 'row',
          gap: 140,
          children: [
            fr({ kind: 'col', gap: 'md', children: [card(1, 3, 'PROVINCIAL', 'Provincial trainers'), card(2, 2, 'SPEED', 'The modern sprinter')] }, 529),
            fr({ kind: 'col', gap: 'md', children: [card(3, 1, 'RIDING', 'Claiming allowances'), card(4, 2, 'STAYING', 'Future stayers')] }, 451),
          ],
        }),
      ],
    },
  };
  const old = generate(spec, content, false);
  assert.ok(old.quality.deadBands.length > 0 && old.quality.emptyBoxes.length > 0, 'the stretched title row and its band, reproduced');
  assert.ok(old.fit.findings.some((f) => f.kind === 'deadband'), 'and the fit report now catches it');
  const fresh = generate(spec, content, true);
  clean(fresh, 'p4');
  assert.equal(fresh.elements.filter((e) => e.type === 'image').length, 4, 'all four photos kept — re-flowed, not dropped');
});

test('GENERATOR p1: the cover masthead hugs its line and the cover lines anchor at the foot', () => {
  const content: ResolvedContent = {
    hero: photo('hero'),
    kicker: { text: 'AOTEAROA AT PACE' },
    headline: { text: 'RACING, RECAST' },
    entry1: { text: textOf(1, 'PAGE 2') },
    entry2: { text: textOf(1, 'PAGE 3') },
    entry3: { text: textOf(1, 'PAGE 4') },
    entry4: { text: textOf(1, 'PAGE 6') },
  };
  const spec: LayoutSpec = {
    page: { background: { ref: 'primary' }, margin: 'none' },
    root: {
      kind: 'stack',
      layers: [
        leaf('image', 'hero'),
        { kind: 'leaf', role: 'shape', colorRef: 'primary', opacity: 0.48 } as LayoutNode,
        {
          kind: 'col',
          pad: 'xl',
          gap: 'sm',
          children: [
            hug(leaf('kicker', 'kicker', { fontPt: 10, caps: true })),
            fr(leaf('headline', 'headline', { fontPt: 64, caps: true }), 3),
            hug(leaf('entry', 'entry1', { fontPt: 15 })),
            hug(leaf('entry', 'entry2', { fontPt: 11.5 })),
            hug(leaf('entry', 'entry3', { fontPt: 11.5 })),
            fr(leaf('entry', 'entry4', { fontPt: 11.5 }), 2),
          ],
        },
      ],
    },
  };
  const old = generate(spec, content, false);
  assert.equal(old.quality.emptyBoxes.length, 2, 'the 740px masthead box and the 523px last line, reproduced');
  const fresh = generate(spec, content, true);
  clean(fresh, 'p1');
  const last = fresh.elements.find((e) => e.type === 'text' && plain(e.text!.content).startsWith('PAGE 6'))!;
  assert.equal(last.y + last.h, 1754 - 96);
});

test('GENERATOR p3: a venue whose body came back empty no longer leaves its heading standing; no dead band', () => {
  const content: ResolvedContent = {
    hero: photo('hero'),
    kicker: { text: 'A SEASON IN MOTION' },
    headline: { text: 'Three Courses, One Season' },
    deck: { text: textOf(3, 'Three great racecourses') },
    byline: { text: 'By the Racing Desk' },
    meta: { text: 'The carnivals that give the national calendar its rhythm.' },
    date1: { text: textOf(3, 'Summer:') },
    venue1: { text: 'Ellerslie' },
    body1: { text: textOf(3, 'Ellerslie opens') },
    date2: { text: textOf(3, 'January:') },
    venue2: { text: 'Trentham' },
    // body2 never arrived — the stored page printed "Trentham" over nothing.
    date3: { text: textOf(3, 'Spring:') },
    venue3: { text: 'Riccarton Park' },
    body3: { text: textOf(3, 'Riccarton supplies') },
  };
  const venue = (n: number, last: boolean): LayoutChild[] => [
    hug(leaf('caption', `date${n}`, { fontPt: 8.5, caps: true })),
    hug(leaf('subhead', `venue${n}`, { fontPt: 28, fontRef: 'display', caps: true })),
    last ? fr(leaf('body', `body${n}`, { fontPt: 10.2 })) : hug(leaf('body', `body${n}`, { fontPt: 10.2 })),
  ];
  const spec: LayoutSpec = {
    page: { background: { ref: 'bg' }, margin: 'none' },
    root: {
      kind: 'col',
      children: [
        fr(leaf('image', 'hero'), 585),
        fr(
          {
            kind: 'col',
            pad: 'lg',
            gap: 'sm',
            children: [
              hug(leaf('kicker', 'kicker', { fontPt: 9, caps: true })),
              fr({ kind: 'row', gap: 'xl', children: [fr(leaf('headline', 'headline', { fontPt: 39 }), 614), fr({ kind: 'col', gap: 'xs', children: [fr(leaf('subhead', 'deck', { fontPt: 14 })), hug(leaf('byline', 'byline', { fontPt: 9 }))] }, 410)] }, 3),
              hug(leaf('entry', 'meta', { fontPt: 9, caps: true })),
              fr({ kind: 'row', gap: 'xl', children: [fr({ kind: 'col', gap: 'xs', children: venue(1, true) }), fr({ kind: 'col', gap: 'xs', children: [...venue(2, false), ...venue(3, true)] })] }, 3),
            ],
          },
          1109,
        ),
      ],
    },
  };
  const old = generate(spec, content, false);
  assert.ok(old.quality.emptyBoxes.length > 0, 'the stretched title box, reproduced');
  const fresh = generate(spec, content, true);
  clean(fresh, 'p3');
  assert.ok(!fresh.elements.some((e) => e.type === 'text' && plain(e.text!.content) === 'Trentham'), 'no heading over nothing');
  assert.ok(fresh.elements.some((e) => e.type === 'text' && plain(e.text!.content) === 'Riccarton Park'));
});

test('GENERATOR p5: the masthead box no longer fills the page, and the photo shows through the wash', () => {
  const content: ResolvedContent = {
    hero: photo('hero'),
    kicker: { text: 'BORN HERE, BOUND BEYOND' },
    headline: { text: 'Karaka Calls' },
    cap: { text: textOf(5, 'At Karaka') },
  };
  const icon = (name: string) => fr({ kind: 'leaf', role: 'icon', iconName: name } as LayoutNode);
  const spec: LayoutSpec = {
    page: { background: { ref: 'primary' }, margin: 'none' },
    root: {
      kind: 'stack',
      layers: [
        leaf('image', 'hero'),
        { kind: 'leaf', role: 'shape', colorRef: 'primary', opacity: 0.88 } as LayoutNode,
        {
          kind: 'col',
          pad: 'xl',
          gap: 'md',
          children: [
            hug(leaf('kicker', 'kicker', { fontPt: 9, caps: true })),
            fr(leaf('headline', 'headline', { fontPt: 42 }), 5),
            fr({ kind: 'row', gap: 32, children: [icon('Horse'), icon('Award'), icon('Handshake'), icon('Globe')] }, 1),
            hug(leaf('caption', 'cap', { fontPt: 8.5 })),
          ],
        },
      ],
    },
  };
  const old = generate(spec, content, false);
  const oldHead = old.elements.find((e) => e.type === 'text' && plain(e.text!.content) === 'Karaka Calls')!;
  assert.ok(oldHead.h > 1000, `the 1173px masthead box, reproduced (${oldHead.h})`);
  const fresh = generate(spec, content, true);
  clean(fresh, 'p5');
  const wash = fresh.elements.find((e) => e.type === 'shape')!;
  assert.ok(wash.shape!.opacity! <= 0.7, 'the photo is darkened, not erased');
});
