// ---------------------------------------------------------------------------
// The design devices (2026-11-12): 12-column grid spans, bleed, overlap, placed stack
// layers, stack pad, rules, drop caps, ornament glyphs, collage tilt, and the
// composer's auto-backing for type on photographs — each solved, composed and judged
// by the same QA layer as everything else. The last test builds a whole page out of
// them and requires it to pass that layer clean.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeLayoutSpec, expandSpecDevices, type LayoutNode, type LayoutSpec, type LayoutChild } from '../../src/lib/magazineV2/layoutSpec.js';
import { solveLayout, type SolvedLayout } from '../../src/lib/magazineV2/solveLayout.js';
import { pruneLayoutSpec } from '../../src/lib/magazineV2/pruneSpec.js';
import { makeMeasureLeaf } from '../../src/lib/magazineV2/measureLeaf.js';
import { composeFromSolved, type ResolvedContent } from '../../src/lib/magazineV2/composeFromSolved.js';
import { normalizeElements } from '../../src/lib/magazineV2/writePipeline.js';
import { validatePageLayout } from '../../src/lib/magazineV2/layoutValidate.js';
import { planDropCap, isDropCapPiece } from '../../src/lib/magazineV2/dropCap.js';
import { contrastRatio } from '../../src/lib/magazineV2/layout.js';
import type { MagazineElement } from '../../src/lib/magazineV2/model.js';
import { PAGE, FONTS, PALETTE, prose, runSpec } from './seedHarness.js';

const theme = { palette: PALETTE, fonts: FONTS };
const leaf = (role: string, contentRef?: string, extra: Record<string, unknown> = {}): LayoutNode =>
  ({ kind: 'leaf', role, ...(contentRef ? { contentRef } : {}), ...extra }) as LayoutNode;
const fr = (node: LayoutNode, weight = 1, extra: Partial<LayoutChild> = {}): LayoutChild => ({ weight, sizing: 'fr', node, ...extra });
const hug = (node: LayoutNode, extra: Partial<LayoutChild> = {}): LayoutChild => ({ weight: 1, sizing: 'content', node, ...extra });
const spec = (root: LayoutNode, margin: number | string = 'lg'): LayoutSpec => ({ page: { background: { ref: 'bg' }, margin }, root }) as LayoutSpec;
const photo = (ref: string) => ({ image: { url: `https://cdn.example.com/${ref}.jpg`, assetId: ref, alt: '' } });
const boxOf = (s: SolvedLayout, ref: string) => {
  const l = s.leaves.find((x) => x.node.contentRef === ref);
  assert.ok(l, `no leaf "${ref}"`);
  return l!.box;
};
const compose = (s: SolvedLayout, content: ResolvedContent, autoBacking = true) =>
  normalizeElements(composeFromSolved(s, content, theme, { autoBacking }).elements, PAGE);

// ── The trust boundary ──────────────────────────────────────────────────────

test('normalize: every device is coerced, bounded, and honoured only where it means something', () => {
  const s = normalizeLayoutSpec({
    root: {
      kind: 'row', grid: 40, children: [
        { span: 30, overlap: 9999, node: { kind: 'leaf', role: 'image', contentRef: 'p', bleed: true, rotate: 40 } },
        { span: 4, node: { kind: 'leaf', role: 'body', contentRef: 'b', bleed: true, dropCap: true, rotate: 3 } },
        { node: { kind: 'leaf', role: 'headline', contentRef: 'h', dropCap: true, glyph: 'way too long' } },
        { node: { kind: 'leaf', role: 'figure', glyph: '01' } },
        { node: { kind: 'leaf', role: 'shape', thickness: 500 } },
        { node: { kind: 'stack', pad: 'md', place: { x: 'sideways', w: 99, h: 'content' }, layers: [{ kind: 'leaf', role: 'image', contentRef: 'q' }] } },
      ],
    },
  })!;
  const row = s.root as Extract<LayoutNode, { kind: 'row' }>;
  assert.equal(row.grid, 12, 'grid clamped to 12 columns');
  assert.equal(row.children[0]!.span, 12);
  assert.equal(row.children[0]!.overlap, 400, 'overlap clamped to the space ceiling');
  const img = row.children[0]!.node as Record<string, unknown>;
  assert.equal(img.bleed, true);
  assert.equal(img.rotate, 5, 'tilt clamped to ±5°');
  const body = row.children[1]!.node as Record<string, unknown>;
  assert.equal(body.bleed, undefined, 'text never bleeds');
  assert.equal(body.dropCap, true);
  assert.equal(body.rotate, undefined, 'body copy is never tilted');
  const head = row.children[2]!.node as Record<string, unknown>;
  assert.equal(head.dropCap, undefined, 'only body takes a drop cap');
  assert.equal(head.glyph, undefined, 'a glyph is ornament, not copy: long text is dropped');
  assert.equal((row.children[3]!.node as Record<string, unknown>).glyph, '01');
  assert.equal((row.children[4]!.node as Record<string, unknown>).thickness, 24, 'a rule, not a panel');
  const st = row.children[5]!.node as Record<string, unknown>;
  assert.equal(st.pad, 'md');
  assert.deepEqual(st.place, { w: 12, h: 'content' }, 'junk anchor dropped, share clamped');
});

test('normalize: a text rule is expanded into a real rule shape beside the leaf, outside the leaf budget', () => {
  const s = normalizeLayoutSpec({ root: { kind: 'col', children: [{ sizing: 'content', node: { kind: 'leaf', role: 'pullquote', contentRef: 'q', rule: 'both' } }] } })!;
  const wrap = (s.root as Extract<LayoutNode, { kind: 'col' }>).children[0]!.node as Extract<LayoutNode, { kind: 'col' }>;
  assert.equal(wrap.kind, 'col');
  assert.deepEqual(wrap.children.map((c) => (c.node as { role: string }).role), ['shape', 'pullquote', 'shape']);
  assert.ok(wrap.children[0]!.node.kind === 'leaf' && wrap.children[0]!.node.thickness! > 0);
  assert.equal((wrap.children[1]!.node as Record<string, unknown>).rule, undefined, 'the sugar is gone once expanded');
});

test('normalize: PLACED layers may share a stack — only layers that fill it are flowed into a col', () => {
  const s = normalizeLayoutSpec({
    root: { kind: 'stack', layers: [
      { kind: 'leaf', role: 'image', contentRef: 'hero' },
      { kind: 'leaf', role: 'headline', contentRef: 'h', place: { x: 'start', y: 'start', w: 8, h: 'content' } },
      { kind: 'leaf', role: 'caption', contentRef: 'c', place: { x: 'end', y: 'end', w: 4, h: 'content' } },
    ] },
  })!;
  const st = s.root as Extract<LayoutNode, { kind: 'stack' }>;
  assert.equal(st.kind, 'stack');
  assert.deepEqual(st.layers.map((l) => (l as { role: string }).role), ['image', 'headline', 'caption']);
});

// ── The solver ──────────────────────────────────────────────────────────────

test('GRID: tracks of the same 12-column grid share column lines, whatever their spans', () => {
  const g = (spans: number[]): LayoutChild => fr({ kind: 'row', grid: 12, gap: 'md', children: spans.map((n, i) => ({ span: n, node: leaf('image', `r${spans.join('')}-${i}`) })) });
  const s = solveLayout(spec({ kind: 'col', gap: 'md', children: [g([8, 4]), g([4, 4, 4]), g([3, 9])] }), PAGE);
  const x = (row: string, i: number) => boxOf(s, `r${row}-${i}`);
  assert.equal(x('84', 1).x, x('444', 2).x, '8+4 and 4+4+4 meet the same column line');
  assert.equal(x('84', 0).x + x('84', 0).w, x('444', 1).x + x('444', 1).w, 'span-8 ends where the second span-4 ends');
  assert.equal(x('39', 1).x - x('39', 0).x, x('444', 1).x - x('444', 0).x - (x('444', 0).w - x('39', 0).w), 'offsets are column-true');
  // Every grid row still ends exactly on the content edge.
  for (const r of ['84', '444', '39']) {
    const last = r.length - 1;
    assert.equal(x(r, last).x + x(r, last).w, PAGE.width - 60);
  }
});

test('GRID: spans that do not fill the grid leave the rest to justify (an offset column)', () => {
  const s = solveLayout(spec({ kind: 'row', grid: 12, gap: 'md', justify: 'end', children: [{ span: 8, node: leaf('image', 'p') }] }), PAGE);
  assert.equal(boxOf(s, 'p').x + boxOf(s, 'p').w, PAGE.width - 60, 'justify end pushes the 8 columns to the right edge');
  assert.ok(boxOf(s, 'p').x > 400);
});

test('BLEED: a photo on the margin runs off every edge it touches; the text beside it stays inside', () => {
  const s = solveLayout(spec({ kind: 'col', children: [fr(leaf('image', 'hero', { bleed: true }), 3), fr(leaf('body', 'body'), 2)] }), PAGE);
  const hero = boxOf(s, 'hero');
  assert.deepEqual([hero.x, hero.y, hero.x + hero.w], [0, 0, PAGE.width], 'top, left and right to the trim');
  assert.ok(hero.y + hero.h < PAGE.height - 60, 'not the bottom: it does not touch it');
  assert.equal(boxOf(s, 'body').x, 60, 'text keeps the margin');
  assert.equal(s.leaves.find((l) => l.node.contentRef === 'hero')!.bleed, true);
});

test('BLEED: inside a padded container there is no margin edge to run off, so nothing moves', () => {
  const s = solveLayout(spec({ kind: 'col', pad: 'md', children: [fr(leaf('image', 'p', { bleed: true }))] }), PAGE);
  assert.equal(boxOf(s, 'p').x, 96);
  assert.equal(s.leaves[0]!.bleed, undefined);
});

test('BLEED: a scrim in a stack whose photo bleeds bleeds with it', () => {
  const s = solveLayout(spec({ kind: 'stack', layers: [leaf('image', 'hero', { bleed: true }), leaf('shape'), leaf('headline', 'h')] }), PAGE);
  const [img, scrim, head] = s.leaves;
  assert.deepEqual(scrim!.box, img!.box, 'the wash covers exactly the photo');
  assert.equal(head!.box.x, 60, 'the type stays inside the margin');
});

test('OVERLAP: a panel rides up over the photo, drawn on top, and the column still tiles exactly', () => {
  const content: ResolvedContent = { hero: photo('hero'), h: { text: 'Racing, Recast' } };
  const s = solveLayout(
    spec({ kind: 'col', children: [fr(leaf('image', 'hero')), hug({ kind: 'stack', pad: 'lg', layers: [leaf('shape', undefined, { colorRef: 'bg' }), leaf('headline', 'h', { fontPt: 50 })] }, { overlap: 200 })] }),
    PAGE,
    { measureLeaf: makeMeasureLeaf(content, FONTS) },
  );
  const hero = boxOf(s, 'hero');
  const panel = s.leaves.find((l) => l.node.role === 'shape')!;
  // Capped at half of either neighbour: a panel never sits more than half on the photo.
  const ridden = hero.y + hero.h - panel.box.y;
  assert.equal(ridden, Math.min(200, Math.floor(panel.box.h / 2)), 'the panel starts inside the photo by the (capped) overlap');
  assert.ok(ridden > 80);
  assert.equal(panel.box.y + panel.box.h, PAGE.height - 60, 'and still ends on the content edge');
  assert.ok(panel.z > s.leaves.find((l) => l.node.role === 'image')!.z, 'drawn above the photo');

  // With more in the panel, the full 200px is honoured.
  const tall: ResolvedContent = { ...content, d: { text: prose(260) } };
  const s2 = solveLayout(
    spec({ kind: 'col', children: [fr(leaf('image', 'hero')), hug({ kind: 'stack', pad: 'lg', layers: [leaf('shape', undefined, { colorRef: 'bg' }), { kind: 'col', children: [hug(leaf('headline', 'h', { fontPt: 50 })), hug(leaf('subhead', 'd', { fontPt: 16 }))] } as LayoutNode] }, { overlap: 200 })] }),
    PAGE,
    { measureLeaf: makeMeasureLeaf(tall, FONTS) },
  );
  const hero2 = boxOf(s2, 'hero');
  const panel2 = s2.leaves.find((l) => l.node.role === 'shape')!;
  assert.equal(hero2.y + hero2.h - panel2.box.y, 200);
});

test('OVERLAP never covers words: it is reduced to stop short of the previous track\'s copy', () => {
  const content: ResolvedContent = { cap: { text: 'A caption under the photograph that must stay readable.' }, p: photo('p'), b: { text: prose(500) } };
  const s = solveLayout(
    spec({ kind: 'col', children: [fr({ kind: 'col', children: [fr(leaf('image', 'p')), hug(leaf('caption', 'cap'))] }), hug(leaf('body', 'b'), { overlap: 300 })] }),
    PAGE,
    { measureLeaf: makeMeasureLeaf(content, FONTS) },
  );
  const cap = boxOf(s, 'cap');
  const body = boxOf(s, 'b');
  assert.ok(body.y >= cap.y + cap.h, `the body (y=${body.y}) does not start over the caption (ends ${cap.y + cap.h})`);
});

test('PLACE: a caption anchored in a photo corner hugs its copy and stays inside the stack', () => {
  const content: ResolvedContent = { p: photo('p'), c: { text: 'Dawn work on the Matamata track.' } };
  const s = solveLayout(
    spec({ kind: 'stack', layers: [leaf('image', 'p'), leaf('caption', 'c', { place: { x: 'end', y: 'end', w: 4, h: 'content', inset: 'md' } })] }),
    PAGE,
    { measureLeaf: makeMeasureLeaf(content, FONTS) },
  );
  const p = boxOf(s, 'p');
  const c = boxOf(s, 'c');
  assert.equal(c.x + c.w, p.x + p.w - 36, 'right edge inset by md');
  assert.equal(c.y + c.h, p.y + p.h - 36, 'bottom edge inset by md');
  assert.ok(Math.abs(c.w - Math.round((p.w - 72) / 3)) <= 1, 'four twelfths wide');
  assert.ok(c.h < 120, `hugs its one line of copy (${c.h}px)`);
});

test('STACK PAD: the panel fills the stack, its copy sits inside the pad', () => {
  const s = solveLayout(spec({ kind: 'stack', pad: 'lg', layers: [leaf('shape'), leaf('body', 'b')] }), PAGE);
  const [panel, body] = s.leaves;
  assert.equal(body!.box.x - panel!.box.x, 60);
  assert.equal(panel!.box.w - body!.box.w, 120);
});

test('RULE: exactly its thickness along its container, and it goes when the copy it decorates is pruned', () => {
  const sp = expandSpecDevices(spec({ kind: 'col', children: [hug(leaf('headline', 'h')), fr(leaf('body', 'b', { rule: 'above' }))] }));
  const s = solveLayout(sp, PAGE);
  const rule = s.leaves.find((l) => l.node.role === 'shape')!;
  assert.equal(rule.box.h, 3);
  assert.equal(rule.box.w, PAGE.width - 120, 'a horizontal rule spans its column');
  const pruned = pruneLayoutSpec(sp, { h: { text: 'Title' } })!;
  const left = solveLayout(pruned, PAGE).leaves;
  assert.deepEqual(left.map((l) => l.node.role), ['headline'], 'no orphan rule under an empty body');
});

// ── The composer ────────────────────────────────────────────────────────────

test('DROP CAP: three elements — the initial, the opening lines beside it, the rest — on one pinned size', () => {
  const text = prose(1100, 3);
  const content: ResolvedContent = { b: { text } };
  const sp = spec({ kind: 'col', children: [hug(leaf('body', 'b', { dropCap: true, fontPt: 10 }))] });
  const s = solveLayout(sp, PAGE, { measureLeaf: makeMeasureLeaf(content, FONTS) });
  const els = compose(s, content).filter((e) => e.type === 'text');
  assert.equal(els.length, 3);
  const [cap, first, rest] = els as [MagazineElement, MagazineElement, MagazineElement];
  assert.equal(cap.text!.content, text[0]);
  assert.ok(cap.text!.fontSize > first.text!.fontSize * 3, 'the initial spans three lines');
  assert.ok(first.x > cap.x + cap.w - 1, 'the opening lines sit beside the cap');
  assert.equal(first.text!.fontSize, rest.text!.fontSize);
  assert.equal(first.text!.minFontSize, first.text!.maxFontSize, 'pinned: a refit can never split the paragraph into two sizes');
  assert.equal(rest.x, cap.x);
  assert.equal(rest.y, first.y + first.h, 'the rest starts exactly three lines down');
  // Recognisable, so a box-by-box copy editor never "corrects" the lead piece's opening.
  assert.ok([cap, first, rest].every((e) => isDropCapPiece(e.id)));
  assert.deepEqual([cap, first, rest].map((e) => e.id.split('-').pop()), ['cap', 'lead', 'rest']);
  // Nothing lost, nothing doubled.
  const joined = (cap.text!.content + first.text!.content + ' ' + rest.text!.content).replace(/\s+/g, ' ');
  assert.equal(joined, text.replace(/\s+/g, ' '));
  // The measured box held it: no overflow, no collision.
  const r = validatePageLayout(els as MagazineElement[], PAGE);
  assert.deepEqual(r.issues, []);
});

test('DROP CAP: copy that cannot carry one (a leading quote, too few words) is set plainly', () => {
  const base = { fontSize: 21, lineHeight: 1.45, boxW: 560, bodyFamily: FONTS.body, bodyWeight: 400, capFamily: FONTS.display };
  assert.equal(planDropCap({ ...base, text: '“Quoted openings take no cap,” she said. ' + prose(400) }), null);
  assert.equal(planDropCap({ ...base, text: 'Too short for a cap.' }), null);
  assert.ok(planDropCap({ ...base, text: prose(600) }));
});

test('GLYPH: an ornament numeral prints with no copy and survives pruning', () => {
  const sp = spec({ kind: 'row', children: [hug(leaf('figure', undefined, { glyph: '1', fontPt: 48 })), fr(leaf('entry', 'e'))] });
  const content: ResolvedContent = { e: { text: 'Walk the course: learn the ground before race day.' } };
  const pruned = pruneLayoutSpec(sp, content)!;
  const s = solveLayout(pruned, PAGE, { measureLeaf: makeMeasureLeaf(content, FONTS) });
  const els = compose(s, content);
  assert.ok(els.some((e) => e.type === 'text' && e.text!.content === '1'));
});

test('AUTO-BACKING: type placed on a photo gets a band scrim between the photo and the words', () => {
  const content: ResolvedContent = { p: photo('p'), h: { text: 'Into the Light' } };
  const sp = spec({ kind: 'stack', layers: [leaf('image', 'p'), leaf('headline', 'h', { fontPt: 48, colorRef: 'text', place: { x: 'start', y: 'end', w: 8, h: 'content', inset: 'lg' } })] }, 'none');
  const s = solveLayout(sp, PAGE, { measureLeaf: makeMeasureLeaf(content, FONTS) });
  const els = compose(s, content);
  const img = els.find((e) => e.type === 'image')!;
  const scrim = els.find((e) => e.type === 'shape')!;
  const head = els.find((e) => e.type === 'text')!;
  assert.ok(scrim, 'a scrim was added');
  assert.ok(img.zIndex < scrim.zIndex && scrim.zIndex < head.zIndex, 'photo → scrim → type');
  assert.equal(scrim.w, img.w, 'a band across the photo, not a box around the words');
  assert.ok((scrim.shape!.opacity ?? 1) < 0.8, 'a wash the photo shows through');
  assert.ok(contrastRatio(head.text!.color, '#0e0e0e') >= 3.5, 'the dark-ink headline was repaired to read on the wash');
  // The reference path opts out: its own treatment is the design.
  assert.equal(compose(s, content, false).filter((e) => e.type === 'shape').length, 0);
});

test('AUTO-BACKING: type straddling a photo\'s edge gets an opaque panel of the page ground', () => {
  const content: ResolvedContent = { p: photo('p'), h: { text: 'Half on the photo, half on the paper' } };
  const sp = spec({ kind: 'col', children: [fr(leaf('image', 'p')), hug(leaf('headline', 'h', { fontPt: 40 }), { overlap: 30 })] });
  const s = solveLayout(sp, PAGE, { measureLeaf: makeMeasureLeaf(content, FONTS) });
  const els = compose(s, content);
  const panel = els.find((e) => e.type === 'shape');
  assert.ok(panel, 'a panel was added');
  assert.equal(panel!.shape!.opacity, undefined, 'opaque');
  assert.equal(panel!.shape!.fill.toLowerCase(), PALETTE.bg.toLowerCase());
});

test('PANEL vs SCRIM: a stack\'s own first-layer panel placed over a photo stays opaque; a later shape over it is a wash', () => {
  const content: ResolvedContent = { p: photo('p'), h: { text: 'Card' } };
  const sp = spec({
    kind: 'stack', layers: [
      leaf('image', 'p'),
      leaf('shape', undefined, { fill: '#000000', opacity: 0.4 }),
      { kind: 'stack', pad: 'md', place: { x: 'start', y: 'end', w: 6, h: 'content', inset: 'lg' }, layers: [leaf('shape', undefined, { colorRef: 'bg' }), leaf('headline', 'h')] } as LayoutNode,
    ],
  }, 'none');
  const s = solveLayout(sp, PAGE, { measureLeaf: makeMeasureLeaf(content, FONTS) });
  const shapes = compose(s, content).filter((e) => e.type === 'shape');
  const wash = shapes.find((e) => e.shape!.fill === '#000000')!;
  const card = shapes.find((e) => e.shape!.fill.toLowerCase() === PALETTE.bg.toLowerCase())!;
  assert.equal(wash.shape!.opacity, 0.4, 'the wash keeps its opacity');
  assert.equal(card.shape!.opacity, undefined, 'the card is a solid panel, not a scrim');
  const head = compose(s, content).find((e) => e.type === 'text')!;
  assert.ok(contrastRatio(head.text!.color, PALETTE.bg) >= 3.5, 'the headline reads on the card it sits on');
});

test('ROTATE: a collage tilt reaches the element — but never on a bleed or at the trim', () => {
  const content: ResolvedContent = { a: photo('a'), b: photo('b') };
  const sp = spec({ kind: 'row', gap: 'lg', children: [fr(leaf('image', 'a', { rotate: 3 })), fr(leaf('image', 'b', { rotate: -3, bleed: true }))] });
  const s = solveLayout(sp, PAGE);
  const els = compose(s, content);
  const a = els.find((e) => e.image?.assetId === 'a')!;
  const b = els.find((e) => e.image?.assetId === 'b')!;
  assert.equal(a.rotation, 3);
  assert.equal(b.rotation, 0, 'a tilted bleed would expose a wedge of bare page');
});

// ── QA ──────────────────────────────────────────────────────────────────────

test('COLLAGE QA: a photo partly over another is a collage; one hiding most of another is a defect', () => {
  const img = (id: string, x: number, y: number, w: number, h: number, z: number) =>
    ({ id, type: 'image', x, y, w, h, rotation: 0, zIndex: z, locked: false, source: 'ai-agent', image: { assetId: id, url: `https://cdn.example.com/${id}.jpg`, alt: '', fit: 'cover' } }) as MagazineElement;
  const ok = validatePageLayout([img('a', 100, 100, 500, 400, 1), img('b', 450, 400, 400, 300, 2)], PAGE);
  assert.equal(ok.ok, true, ok.issues.map((i) => i.detail).join('; '));
  const bad = validatePageLayout([img('a', 100, 100, 500, 400, 1), img('b', 120, 120, 460, 360, 2)], PAGE);
  assert.equal(bad.ok, false);
  assert.match(bad.issues[0]!.detail, /hides most of image a/);
  // Text on text is still strict.
  const txt = (id: string, y: number) =>
    ({ id, type: 'text', x: 100, y, w: 400, h: 100, rotation: 0, zIndex: 1, locked: false, source: 'ai-agent', text: { content: 'Words', role: 'body', fontFamily: FONTS.body, fontSize: 20, fontWeight: 400, color: '#111111', align: 'left', lineHeight: 1.3, autoFit: 'shrink' } }) as MagazineElement;
  assert.equal(validatePageLayout([txt('t1', 100), txt('t2', 150)], PAGE).ok, false);
});

// ── A whole page built from the devices ─────────────────────────────────────

test('A DESIGNED PAGE — bleed photo, overlapping panel, grid, drop cap, ruled pull quote, sidebar — passes QA clean', () => {
  const sp = normalizeLayoutSpec({
    page: { background: { ref: 'bg' }, margin: 'lg' },
    root: {
      kind: 'col', gap: 'md', children: [
        { weight: 4, node: { kind: 'leaf', role: 'image', contentRef: 'hero', bleed: true } },
        { sizing: 'content', overlap: 180, node: { kind: 'row', grid: 12, gap: 'none', children: [
          { span: 9, node: { kind: 'stack', pad: 'lg', layers: [
            { kind: 'leaf', role: 'shape', colorRef: 'bg' },
            { kind: 'col', gap: 'sm', children: [
              { sizing: 'content', node: { kind: 'leaf', role: 'kicker', contentRef: 'kicker', caps: true, tracking: 3, fontPt: 9, colorRef: 'accent' } },
              { sizing: 'content', node: { kind: 'leaf', role: 'headline', contentRef: 'headline', fontPt: 46, fontRef: 'display' } },
              { sizing: 'content', node: { kind: 'leaf', role: 'subhead', contentRef: 'deck', fontPt: 14 } },
            ] },
          ] } },
          { span: 3, node: { kind: 'leaf', role: 'spacer' } },
        ] } },
        { weight: 6, node: { kind: 'row', grid: 12, gap: 'md', children: [
          { span: 4, node: { kind: 'leaf', role: 'body', contentRef: 'body', dropCap: true, fontPt: 10 } },
          { span: 4, node: { kind: 'col', gap: 'sm', children: [
            { weight: 1, node: { kind: 'leaf', role: 'body', contentRef: 'body2', fontPt: 10 } },
            { sizing: 'content', node: { kind: 'leaf', role: 'pullquote', contentRef: 'pullquote', rule: 'both', fontPt: 13 } },
          ] } },
          { span: 4, node: { kind: 'stack', pad: 'md', layers: [
            { kind: 'leaf', role: 'shape', colorRef: 'secondary', opacity: 0.12 },
            { kind: 'col', gap: 'sm', justify: 'center', children: [
              { sizing: 'content', node: { kind: 'leaf', role: 'label', contentRef: 'sidebarTitle', caps: true, tracking: 2 } },
              { sizing: 'content', node: { kind: 'leaf', role: 'entry', contentRef: 'entry1', fontPt: 9.5 } },
              { sizing: 'content', node: { kind: 'leaf', role: 'entry', contentRef: 'entry2', fontPt: 9.5 } },
              { sizing: 'content', node: { kind: 'leaf', role: 'entry', contentRef: 'entry3', fontPt: 9.5 } },
            ] },
          ] } },
        ] } },
      ],
    },
  })!;
  const r = runSpec(sp);
  assert.deepEqual(r.report.issues, [], 'no collision, nothing off the page, no overflow');
  assert.deepEqual(r.report.advisories, [], 'no sliver photo, no oversize box, no dead band');
  assert.equal(r.flaws, 0, r.fit.findings.map((f) => `${f.kind}@${f.where}`).join(', '));
  const hero = r.elements.find((e) => e.type === 'image')!;
  assert.deepEqual([hero.x, hero.y, hero.w], [0, 0, PAGE.width], 'the photo bleeds');
  const panel = r.elements.find((e) => e.type === 'shape' && e.shape!.opacity === undefined && e.y < hero.y + hero.h)!;
  assert.ok(panel && panel.y < hero.y + hero.h - 100, 'the panel rides up over the photo');
  assert.ok(r.elements.filter((e) => e.type === 'text' && e.text!.role === 'other').length === 1, 'one drop cap');
  assert.ok(r.elements.filter((e) => e.type === 'shape' && e.h === 3).length >= 2, 'the pull quote is ruled above and below');
});
