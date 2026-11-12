// ---------------------------------------------------------------------------
// Adjust (relayoutPage) on pages built with the LAYOUT DEVICES — drop caps, overlaps,
// placed layers, bleeds, rules, spread columns, tilts.
//
// Every page here is a real seed composed offline by the generator's own tail (seedHarness:
// copy written to each box's budget → prune → balance → compose with auto-backing → QA),
// then edited the way a user edits copy (longer / shorter body, a longer headline, a
// paragraph cut to one sentence) and run through Adjust. What must hold:
//   • the result passes the QA layer (no collision, nothing off the page, no overflow) and
//     measures no worse;
//   • a drop cap's three pieces still read as one paragraph on one pinned size, split by
//     the same calculation the composer uses — or are folded into a plain body box when
//     the copy can no longer carry a cap;
//   • the design survives: every overlap is still an overlap, every bleed still at the
//     trim, a block placed at a photo's foot still stands on it;
//   • the patches, applied through the server's own element write path in the order the
//     client sends them, produce exactly the page that was judged.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { adjustPageLayout, relayoutPage, RELAYOUT_REFUSALS, type RelayoutResult } from '../../src/lib/magazineV2/relayoutPage.js';
import { seedSpecForPage } from '../../src/lib/magazineV2/seedSpecs.js';
import { PAGE_TYPES } from '../../src/lib/magazineV2/pageTypes.js';
import { validatePageLayout, pageQuality } from '../../src/lib/magazineV2/layoutValidate.js';
import { refitText } from '../../src/lib/magazineV2/layout.js';
import { planDropCap, isDropCapPiece } from '../../src/lib/magazineV2/dropCap.js';
import { WRAP_SAFETY } from '../../src/lib/magazineV2/measureLeaf.js';
import { normalizeElementPatch } from '../../src/lib/magazineV2/writePipeline.js';
import type { MagazineElement } from '../../src/lib/magazineV2/model.js';
import type { LayoutSpec } from '../../src/lib/magazineV2/layoutSpec.js';
import { runSpec, prose, PAGE } from './seedHarness.js';

// ── Pages and edits ─────────────────────────────────────────────────────────

const seedPage = (typeId: string): MagazineElement[] => {
  const t = PAGE_TYPES.find((x) => x.id === typeId);
  assert.ok(t, `no page type "${typeId}"`);
  return refitText(runSpec(seedSpecForPage({ kind: t!.baseKind, pageType: t!.id })).elements);
};

type Edit = (e: MagazineElement) => string | null;
/** Apply a copy edit the way the editor saves one (the server refits shrink-to-fit type;
 *  a drop-cap piece is pinned, so it keeps its size and simply overflows). */
const editCopy = (els: MagazineElement[], edit: Edit): MagazineElement[] =>
  refitText(els.map((e) => {
    if (e.type !== 'text' || !e.text) return e;
    const next = edit(e);
    return next === null ? e : { ...e, text: { ...e.text, content: next } };
  }));

const isBody = (e: MagazineElement) => e.text!.role === 'body' && e.text!.content.length > 200 && !isDropCapPiece(e.id);
const cut = (s: string, share: number) => s.slice(0, Math.floor(s.length * share)).replace(/\s+\S*$/, '') + '.';
const LONG_HEADLINE = 'Racing, Recast: the season the young trainers took over the country';

const EDITS: Record<string, Edit> = {
  'shorter body': (e) => (e.id.endsWith('-rest') ? cut(e.text!.content, 0.3) : isBody(e) ? cut(e.text!.content, 0.4) : null),
  'longer body': (e) => (e.id.endsWith('-rest') || isBody(e) ? `${e.text!.content} ${prose(Math.floor(e.text!.content.length * 0.45), 9)}` : null),
  'longer headline': (e) => (e.text!.role === 'headline' && e.text!.content.length > 4 ? LONG_HEADLINE : null),
  'one sentence': (e) => (e.id.endsWith('-rest') ? '' : e.id.endsWith('-lead') ? 'orning on the gallops starts early.' : null),
};

// ── What must hold ──────────────────────────────────────────────────────────

const plain = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/** Each drop cap: cap + opening lines + rest read as the paragraph, both text pieces on
 *  ONE pinned size, and the split exactly what the composer's calculation makes of that
 *  copy in that measure. */
function assertDropCapsConsistent(els: MagazineElement[], label: string): void {
  const groups = new Map<string, Record<string, MagazineElement>>();
  for (const e of els) {
    if (!isDropCapPiece(e.id)) continue;
    const m = /^(.*)-(cap|lead|rest)$/.exec(e.id)!;
    groups.set(m[1]!, { ...(groups.get(m[1]!) ?? {}), [m[2]!]: e });
  }
  for (const [key, g] of groups) {
    if (!g.cap) {
      // Folded: one plain body box, no longer pinned.
      assert.equal(Object.keys(g).length, 1, `${label}: ${key} lost its cap but kept two pieces`);
      const only = Object.values(g)[0]!;
      assert.ok((only.text!.minFontSize ?? 0) < (only.text!.maxFontSize ?? 0), `${label}: a folded paragraph is shrink-to-fit again`);
      continue;
    }
    const { cap, lead, rest } = g as { cap: MagazineElement; lead: MagazineElement; rest?: MagazineElement };
    assert.ok(lead, `${label}: ${key} has a cap but no opening lines`);
    const size = lead.text!.fontSize;
    assert.equal(lead.text!.minFontSize, lead.text!.maxFontSize, `${label}: opening lines pinned`);
    assert.equal(lead.text!.fontSize, lead.text!.maxFontSize);
    if (rest) {
      assert.equal(rest.text!.fontSize, size, `${label}: both halves on one size`);
      assert.equal(rest.text!.minFontSize, rest.text!.maxFontSize, `${label}: rest pinned`);
      assert.equal(rest.y, lead.y + lead.h, `${label}: the rest starts exactly three lines down`);
      assert.equal(rest.x, cap.x);
    }
    assert.ok(lead.x >= cap.x + cap.w, `${label}: the opening lines sit beside the cap`);
    const text = plain(cap.text!.content + lead.text!.content + (rest ? ' ' + rest.text!.content : ''));
    const plan = planDropCap({
      text, fontSize: size, lineHeight: lead.text!.lineHeight, boxW: rest ? rest.w : lead.x + lead.w - cap.x,
      bodyFamily: lead.text!.fontFamily, bodyWeight: lead.text!.fontWeight, capFamily: cap.text!.fontFamily, capWeight: cap.text!.fontWeight, safety: WRAP_SAFETY,
    });
    assert.ok(plan, `${label}: the paragraph still carries a cap`);
    assert.equal(plain(lead.text!.content), plain(plan!.first), `${label}: the opening lines are the composer's split`);
    assert.equal(cap.text!.content, plan!.cap);
    assert.ok(Math.abs(cap.text!.fontSize - plan!.capFontSize) < 0.01, `${label}: the cap is sized for this body size`);
  }
}

const box = (e: MagazineElement) => ({ x: e.x, y: e.y, w: e.w, h: e.h });
const touches = (e: MagazineElement) =>
  [e.x <= 1 && 'left', e.y <= 1 && 'top', e.x + e.w >= PAGE.width - 1 && 'right', e.y + e.h >= PAGE.height - 1 && 'bottom'].filter(Boolean) as string[];
const meet = (a: MagazineElement, b: MagazineElement) =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) >= 2 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) >= 2;

/** The design survives: bleeds stay at the trim, overlaps stay overlaps (drop-cap pieces
 *  count as their paragraph), and no element is lost except the ones the result removes. */
function assertDesignKept(before: MagazineElement[], r: RelayoutResult, label: string): void {
  const after = new Map(r.elements.map((e) => [e.id, e]));
  assert.equal(r.elements.length, before.length - r.removes.length, `${label}: nothing lost but what was removed`);
  for (const e of before) {
    const now = after.get(e.id);
    if (!now || isDropCapPiece(e.id)) continue;
    for (const edge of touches(e)) assert.ok(touches(now).includes(edge), `${label}: ${e.type} ${e.id} left the ${edge} trim`);
    assert.equal(now.zIndex, e.zIndex, `${label}: stacking order kept`);
  }
  const key = (id: string) => (isDropCapPiece(id) ? id.replace(/-(cap|lead|rest)$/, '') : id);
  const pairs = (els: MagazineElement[]) => {
    const s = new Set<string>();
    for (const a of els) for (const b of els) if (a.id < b.id && key(a.id) !== key(b.id) && meet(a, b)) s.add([key(a.id), key(b.id)].sort().join('|'));
    return s;
  };
  const was = pairs(before.filter((e) => !r.removes.includes(e.id) || isDropCapPiece(e.id)));
  const is = pairs(r.elements);
  assert.deepEqual([...is].filter((p) => !was.has(p)), [], `${label}: no new overlap`);
  assert.deepEqual([...was].filter((p) => !is.has(p)), [], `${label}: every overlap kept`);
}

/** The patches, written the way the client writes them — text patches, then moves, then
 *  scrims, then removals — through the server's element write path, give the page that
 *  was judged. */
function applyAsClient(els: MagazineElement[], r: RelayoutResult): MagazineElement[] {
  const page = new Map(els.map((e) => [e.id, e]));
  const write = (id: string, patch: Record<string, unknown>) => {
    const next = normalizeElementPatch(page.get(id)!, patch, PAGE);
    assert.ok(next, `the write path refused the patch for ${id}`);
    page.set(id, next!);
  };
  for (const t of r.texts) {
    const { elementId, ...patch } = t;
    write(elementId, { text: { ...page.get(elementId)!.text!, ...patch } });
  }
  for (const m of r.moves) write(m.elementId, { x: m.x, y: m.y, w: m.w, h: m.h, ...(m.rotation !== undefined ? { rotation: m.rotation } : {}) });
  for (const s of r.scrims) write(s.elementId, { shape: { ...page.get(s.elementId)!.shape!, opacity: s.opacity } });
  for (const id of r.removes) page.delete(id);
  return [...page.values()];
}

function assertClientParity(els: MagazineElement[], r: RelayoutResult, label: string): void {
  const applied = new Map(applyAsClient(els, r).map((e) => [e.id, e]));
  assert.equal(applied.size, r.elements.length, label);
  for (const e of r.elements) {
    const a = applied.get(e.id)!;
    assert.deepEqual(box(a), box(e), `${label}: ${e.id} box`);
    if (e.text) {
      assert.equal(plain(a.text!.content), plain(e.text.content), `${label}: ${e.id} copy`);
      if (r.texts.some((t) => t.elementId === e.id) || r.moves.some((m) => m.elementId === e.id)) {
        assert.ok(Math.abs(a.text!.fontSize - e.text.fontSize) <= 1, `${label}: ${e.id} size ${a.text!.fontSize} vs ${e.text.fontSize}`);
      }
    }
  }
}

function assertQaPass(before: MagazineElement[], r: RelayoutResult, label: string): void {
  const v = validatePageLayout(r.elements, PAGE);
  assert.deepEqual(v.issues.map((i) => i.detail), [], `${label}: no collision, nothing off the page, no overflow`);
  const q0 = pageQuality(before, PAGE);
  const n = (q: typeof q0) => q.slivers.length + q.emptyBoxes.length + q.deadBands.length;
  assert.ok(n(r.after) <= n(q0), `${label}: measures no worse (${n(q0)} → ${n(r.after)})`);
  assert.deepEqual(r.after.slivers, [], `${label}: no sliver photo`);
}

// ── 1. Every seed is rebuilt from its elements ──────────────────────────────

test('every page type is rebuilt from its own elements and solves back onto itself', () => {
  for (const t of PAGE_TYPES) {
    const els = seedPage(t.id);
    const o = adjustPageLayout(els, PAGE, { always: true });
    assert.equal(o.reason, '', `${t.id}: ${o.reason}`);
    if (!o.result) continue; // reproduced exactly: nothing to move
    assertQaPass(els, o.result, t.id);
    assertDesignKept(els, o.result, t.id);
    assertDropCapsConsistent(o.result.elements, t.id);
    const after = new Map(o.result.elements.map((e) => [e.id, e]));
    const drift = Math.max(...els.map((e) => {
      const a = after.get(e.id)!;
      return Math.max(Math.abs(a.x - e.x), Math.abs(a.y - e.y), Math.abs(a.x + a.w - e.x - e.w), Math.abs(a.y + a.h - e.y - e.h));
    }));
    assert.ok(drift <= 64, `${t.id}: a page that needed nothing moved ${drift}px`);
  }
});

test('a clean device page that needs nothing is left exactly as it is', () => {
  for (const id of ['feature-opener', 'photo-essay', 'cover', 'feature-article', 'editors-letter']) {
    assert.deepEqual(adjustPageLayout(seedPage(id), PAGE), { result: null, reason: '' }, id);
  }
});

// ── 2. Drop caps ────────────────────────────────────────────────────────────

const DROP_CAP_PAGES = ['feature-article', 'editors-letter', 'long-read', 'sidebar-feature'];

for (const id of DROP_CAP_PAGES) {
  for (const [name, edit] of Object.entries(EDITS)) {
    test(`drop cap — ${id}, ${name}: Adjust re-balances it as ONE paragraph and the page passes QA`, () => {
      const els = editCopy(seedPage(id), edit);
      const o = adjustPageLayout(els, PAGE);
      assert.equal(o.reason, '', `${id}/${name} was refused: ${o.reason}`);
      if (!o.result) {
        // Nothing to repair: the page already measures clean and its drop cap still fits.
        assert.deepEqual(validatePageLayout(els, PAGE).issues, []);
        assertDropCapsConsistent(els, `${id}/${name}`);
        return;
      }
      const label = `${id}/${name}`;
      assertQaPass(els, o.result, label);
      assertDesignKept(els, o.result, label);
      assertDropCapsConsistent(o.result.elements, label);
      assertClientParity(els, o.result, label);
    });
  }
}

test('drop cap — copy that outgrew its paragraph takes room from the photo before its type shrinks', () => {
  const els = editCopy(seedPage('feature-article'), (e) => (e.id.endsWith('-rest') ? `${e.text!.content} ${prose(Math.floor(e.text!.content.length * 0.5), 4)}` : null));
  const rest = els.find((e) => e.id.endsWith('-rest'))!;
  const r = relayoutPage(els, PAGE);
  assert.ok(r, 'a pinned paragraph that overflows is a reason to Adjust');
  const after = r!.elements.find((e) => e.id === rest.id)!;
  assert.equal(after.text!.fontSize, rest.text!.fontSize, 'the body keeps its size');
  assert.ok(after.h > rest.h + 60, `the paragraph got the room (${rest.h} → ${after.h})`);
  const photo0 = els.find((e) => e.type === 'image')!;
  const photo1 = r!.elements.find((e) => e.id === photo0.id)!;
  assert.ok(photo1.h < photo0.h, 'the photograph gave it');
  assert.equal(photo1.x, 0, 'and still bleeds');
  assertDropCapsConsistent(r!.elements, 'feature-article grow');
});

test('drop cap — a paragraph cut to one sentence folds back into a plain body box', () => {
  const els = editCopy(seedPage('feature-article'), EDITS['one sentence']!);
  const pieces = els.filter((e) => isDropCapPiece(e.id));
  const cap = pieces.find((e) => e.id.endsWith('-cap'))!;
  const lead = pieces.find((e) => e.id.endsWith('-lead'))!;
  const rest = pieces.find((e) => e.id.endsWith('-rest'))!;
  const r = relayoutPage(els, PAGE);
  assert.ok(r, 'a drop cap whose copy is too short for one is a reason to Adjust');
  assert.deepEqual([...r!.removes].sort(), [cap.id, rest.id].sort(), 'the cap and the rest go');
  const folded = r!.elements.find((e) => e.id === lead.id)!;
  assert.equal(plain(folded.text!.content), `${cap.text!.content}orning on the gallops starts early.`, 'the cap letter is back in its word');
  assert.ok(folded.text!.minFontSize! < folded.text!.maxFontSize!, 'shrink-to-fit again, not pinned');
  assert.equal(folded.x, cap.x, 'it takes the paragraph’s place');
  assert.ok(folded.w > lead.w, 'and its full measure');
  assert.match(r!.notes.join(' '), /without its drop cap/);
  assertQaPass(els, r!, 'fold');
  assertClientParity(els, r!, 'fold');
});

test('drop cap — a first paragraph that ended beside the cap keeps its paragraph break through Adjust', () => {
  // The opening paragraph is two lines long: it ends beside the cap, and the rest of the
  // copy opens a paragraph of its own. Merged back with a plain space, the next paragraph
  // would run up into the opening lines.
  const first = 'Morning comes early on the Waikato flats, and the string is out on the track by five, steaming in the cold while the farrier works quietly behind the stalls and the strappers walk each runner in slow circles.';
  const content = {
    headline: { text: 'Before the Sun' },
    hero: { image: { url: 'https://cdn.example.com/hero.jpg', assetId: 'hero', alt: '' } },
    body: { text: `${first}\n${prose(900, 5)}` },
  };
  const spec: LayoutSpec = {
    page: { background: { ref: 'bg' }, margin: 'lg' },
    root: { kind: 'col', gap: 'md', children: [
      { weight: 1, sizing: 'content', node: { kind: 'leaf', role: 'headline', contentRef: 'headline', fontPt: 40 } },
      { weight: 1, sizing: 'fr', node: { kind: 'leaf', role: 'image', contentRef: 'hero' } },
      { weight: 1, sizing: 'content', node: { kind: 'leaf', role: 'body', contentRef: 'body', dropCap: true, fontPt: 10 } },
    ] },
  };
  const els = refitText(runSpec(spec, content).elements);
  const lead = els.find((e) => e.id.endsWith('-lead'))!;
  const rest = els.find((e) => e.id.endsWith('-rest'))!;
  assert.equal(plain(lead.text!.content), plain(first.slice(1)), 'the premise: the first paragraph ends beside the cap');
  const edited = editCopy(els, (e) => (e.id === rest.id ? cut(e.text!.content, 0.4) : null));
  const r = relayoutPage(edited, PAGE);
  assert.ok(r, 'a rest cut to 40% leaves room to give back');
  const lead1 = r!.elements.find((e) => e.id === lead.id)!;
  const rest1 = r!.elements.find((e) => e.id === rest.id)!;
  assert.equal(plain(lead1.text!.content), plain(first.slice(1)), 'the opening lines are still just the first paragraph');
  assert.equal(plain(rest1.text!.content), plain(cut(rest.text!.content, 0.4)), 'and the rest is untouched');
  assertQaPass(edited, r!, 'paragraph break');
  assertClientParity(edited, r!, 'paragraph break');
});

// ── 3. Overlaps, placed layers, bleeds, rules, spread columns ───────────────

const DEVICE_PAGES = ['feature-opener', 'photo-essay', 'cover', 'sponsor', 'profile', 'interview-qa', 'quote-wall', 'contents', 'data-spread', 'calendar', 'editors-letter'];

for (const id of DEVICE_PAGES) {
  for (const name of ['longer headline', 'shorter body'] as const) {
    test(`devices — ${id}, ${name}: re-balanced, the design kept, QA clean`, () => {
      const els = editCopy(seedPage(id), EDITS[name]!);
      const o = adjustPageLayout(els, PAGE, { always: true });
      assert.equal(o.reason, '', `${id}/${name} was refused: ${o.reason}`);
      if (!o.result) return;
      const label = `${id}/${name}`;
      assertQaPass(els, o.result, label);
      assertDesignKept(els, o.result, label);
      assertDropCapsConsistent(o.result.elements, label);
      assertClientParity(els, o.result, label);
    });
  }
}

test('overlap — the feature opener’s panel still rides up over the bleed photo by the same amount', () => {
  const els = editCopy(seedPage('feature-opener'), EDITS['longer headline']!);
  const photo = els.find((e) => e.type === 'image')!;
  const panel = els.find((e) => e.type === 'shape')!;
  const ov = photo.y + photo.h - panel.y;
  assert.ok(ov > 100, 'the premise: the panel overlaps the photo');
  const r = adjustPageLayout(els, PAGE, { always: true }).result;
  const p1 = r?.elements.find((e) => e.id === photo.id) ?? photo;
  const s1 = r?.elements.find((e) => e.id === panel.id) ?? panel;
  assert.equal(p1.y + p1.h - s1.y, ov, 'same overlap');
  assert.deepEqual([p1.x, p1.y, p1.w], [0, 0, PAGE.width], 'the photo still bleeds');
  assert.ok(s1.zIndex > p1.zIndex);
});

test('placed layer — the photo essay’s words stay at the photo’s foot and grow upward', () => {
  const els = editCopy(seedPage('photo-essay'), EDITS['longer headline']!);
  const texts = els.filter((e) => e.type === 'text');
  const foot = Math.max(...texts.map((e) => e.y + e.h));
  const r = adjustPageLayout(els, PAGE, { always: true }).result;
  assert.ok(r, 'the shrunk headline gets its room back');
  const after = r!.elements.filter((e) => e.type === 'text');
  assert.equal(Math.max(...after.map((e) => e.y + e.h)), foot, 'the block still stands on the same foot');
  assert.ok(Math.min(...after.map((e) => e.y)) < Math.min(...texts.map((e) => e.y)), 'it grew upward');
  const head0 = texts.find((e) => e.text!.content === LONG_HEADLINE)!;
  const head1 = after.find((e) => e.id === head0.id)!;
  assert.ok(head1.text!.fontSize > head0.text!.fontSize, 'at a larger size than the squeeze left it');
  // The band scrim behind the words followed them.
  const scrim = r!.elements.find((e) => e.type === 'shape')!;
  assert.ok(scrim.y <= head1.y && scrim.y + scrim.h >= foot, 'the wash still backs every line');
});

test('rules keep their thickness; a spread column stays spread', () => {
  const els = seedPage('editors-letter');
  const r = adjustPageLayout(els, PAGE, { always: true }).result;
  assert.ok(r);
  for (const e of els.filter((x) => x.type === 'shape')) {
    const a: MagazineElement = r!.elements.find((x) => x.id === e.id)!;
    assert.equal(Math.min(a.w, a.h), Math.min(e.w, e.h), 'a hairline is still a hairline');
  }
  // The sign-off column (quote, caption, byline) is spread down beside the letter: its last
  // line still ends where the letter does.
  const byline = els.find((e) => e.type === 'text' && e.text!.role === 'byline')!;
  const letterFoot = Math.max(...r!.elements.filter((e) => isDropCapPiece(e.id)).map((e) => e.y + e.h));
  const b1 = r!.elements.find((e) => e.id === byline.id)!;
  assert.ok(Math.abs(b1.y + b1.h - letterFoot) <= 2, `byline foot ${b1.y + b1.h} vs letter foot ${letterFoot}`);
});

test('tilt — a rotated photo keeps its tilt through Adjust, and is straightened if it lands at the trim', () => {
  const spec: LayoutSpec = {
    page: { background: { ref: 'bg' }, margin: 'lg' },
    root: {
      kind: 'col', gap: 'md', children: [
        { weight: 1, sizing: 'content', node: { kind: 'leaf', role: 'headline', contentRef: 'headline', fontPt: 40 } },
        { weight: 3, sizing: 'fr', node: { kind: 'row', gap: 'md', children: [
          { weight: 1, sizing: 'fr', node: { kind: 'leaf', role: 'image', contentRef: 'photo1', rotate: 3 } },
          { weight: 1, sizing: 'fr', node: { kind: 'leaf', role: 'body', contentRef: 'body', fontPt: 10 } },
        ] } },
        { weight: 2, sizing: 'fr', node: { kind: 'leaf', role: 'body', contentRef: 'body2', fontPt: 10 } },
      ],
    },
  };
  const els0 = refitText(runSpec(spec).elements);
  const photo = els0.find((e) => e.type === 'image')!;
  assert.equal(photo.rotation, 3, 'the premise: a tilted photo');
  const els = editCopy(els0, (e) => (e.text!.role === 'body' && e.text!.content.length > 300 ? cut(e.text!.content, 0.35) : null));
  const r = relayoutPage(els, PAGE);
  assert.ok(r, 'a body cut to a third leaves an oversize box to repair');
  const p1 = r!.elements.find((e) => e.id === photo.id)!;
  const atTrim = p1.x < 12 || p1.y < 12 || p1.x + p1.w > PAGE.width - 12 || p1.y + p1.h > PAGE.height - 12;
  assert.equal(p1.rotation, atTrim ? 0 : 3);
  assertQaPass(els, r!, 'tilt');
  assertClientParity(els, r!, 'tilt');
});

// ── 4. Refusals ─────────────────────────────────────────────────────────────

test('a drop cap that has been taken apart is refused, in words, and the page is left as it is', () => {
  const els = editCopy(seedPage('feature-article'), EDITS['shorter body']!).filter((e) => !e.id.endsWith('-cap'));
  assert.deepEqual(adjustPageLayout(els, PAGE), { result: null, reason: RELAYOUT_REFUSALS.dropCap });
});

test('a device page with a hand-placed box is refused, in words', () => {
  const els = editCopy(seedPage('feature-article'), EDITS['shorter body']!);
  els.push({ ...els.find((e) => e.type === 'text')!, id: 'mine', source: 'manual', x: 900, y: 1500, w: 200, h: 40 });
  assert.deepEqual(adjustPageLayout(els, PAGE), { result: null, reason: RELAYOUT_REFUSALS.foreign });
});

test('a page whose shapes cannot be explained is refused rather than guessed', () => {
  const els = editCopy(seedPage('feature-article'), EDITS['shorter body']!);
  // A free block, off the composer's z ladder, backing nothing.
  els.push({ ...els.find((e) => e.type === 'shape')!, id: 'block', x: 1000, y: 20, w: 120, h: 30, zIndex: 3, shape: { fill: '#000000' } });
  assert.deepEqual(adjustPageLayout(els, PAGE), { result: null, reason: RELAYOUT_REFUSALS.unsafe });
});
