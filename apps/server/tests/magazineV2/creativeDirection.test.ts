// ---------------------------------------------------------------------------
// creativeDirection — style families, the concept, palette/fonts and page types as
// the planner returns them, validated.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  STYLE_FAMILIES,
  DISPLAY_FONTS,
  BODY_FONTS,
  normalizeConcept,
  normalizeFonts,
  normalizePalette,
  enforcePaperAndInk,
  normalizePlanPage,
  plannerTypeMenu,
  familyMenu,
  variationFor,
  conceptBrief,
  conceptVoice,
  defaultTypeForKind,
  matchFont,
  INTERIOR_PAGE_TYPE_IDS,
} from '../../src/lib/magazineV2/creativeDirection.js';
import { FONT_METRICS } from '../../src/lib/magazineV2/fontMetrics.data.js';
import { contrastRatio, relativeLuminance } from '../../src/lib/magazineV2/layout.js';
import { getPageType } from '../../src/lib/magazineV2/pageTypes.js';

const primary = (stack: string) => (stack.split(',')[0] ?? '').replace(/['"]/g, '').trim().toLowerCase();

test('every curated font is measured by the layout engine', () => {
  for (const f of [...DISPLAY_FONTS, ...BODY_FONTS]) assert.ok(FONT_METRICS[primary(f)], `${f} has no measured metrics`);
});

test('every family is complete: three palettes, three valid pairings, a safe seed palette', () => {
  const ids = new Set<string>();
  for (const f of STYLE_FAMILIES) {
    assert.ok(!ids.has(f.id), `duplicate family ${f.id}`);
    ids.add(f.id);
    assert.equal(f.palettes.length, 3);
    for (const [d, b] of f.pairings) {
      assert.ok(DISPLAY_FONTS.includes(d), `${f.id}: ${d}`);
      assert.ok(BODY_FONTS.includes(b), `${f.id}: ${b}`);
    }
    assert.deepEqual(enforcePaperAndInk(f.seedPalette, f.id), f.seedPalette, `${f.id} seed palette must already be paper + ink`);
  }
  // Two issues should not share one look: the families differ in their first pairing.
  assert.ok(new Set(STYLE_FAMILIES.map((f) => f.pairings[0].join('|'))).size >= 6);
});

test('a concept from the planner is kept; a thin one is completed from its family', () => {
  const full = normalizeConcept({
    family: 'heritage-racing', name: 'Silk & Sepia', mood: 'A century of colours.', photoStyle: 'Warm film grain.',
    typeVoice: 'Old-style serif.', grid: 'Classical columns.', motifs: ['double rules', 'dates'], voice: 'Storytelling.',
  });
  assert.equal(full.family, 'heritage-racing');
  assert.equal(full.name, 'Silk & Sepia');
  assert.deepEqual(full.motifs, ['double rules', 'dates']);

  const thin = normalizeConcept({ family: 'Bold Sport', name: '' });
  assert.equal(thin.family, 'bold-sport', 'a family label is accepted too');
  assert.equal(thin.name, 'Bold sport');
  assert.ok(thin.photoStyle && thin.voice && thin.motifs!.length > 0);
});

test('an unknown or missing family is steered by the brief', () => {
  assert.equal(normalizeConcept({ family: 'grunge' }, 'Pony club open day for families').family, 'playful-youth');
  assert.equal(normalizeConcept(undefined, 'Our 2025 annual report and results').family, 'annual-report');
  assert.equal(normalizeConcept(null, 'Raceday at Ellerslie: the cup and the season').family, 'bold-sport');
  assert.equal(normalizeConcept(null, '').family, 'modern-minimal');
});

test('fonts: exact stacks, bare family names, and a family-specific fallback', () => {
  assert.equal(matchFont('Cormorant Garamond', DISPLAY_FONTS), 'Cormorant Garamond, Garamond, Georgia, serif');
  assert.equal(matchFont('source sans 3', BODY_FONTS), "'Source Sans 3', Arial, sans-serif");
  const f = normalizeFonts({ display: 'Comic Sans MS', body: 'Papyrus' }, 'bold-sport');
  assert.deepEqual([f.display, f.body], STYLE_FAMILIES.find((x) => x.id === 'bold-sport')!.pairings[0]);
  // Stored issues (no family) keep the old global default.
  assert.equal(normalizeFonts({}).display, DISPLAY_FONTS[0]);
});

test('palette: bad channels fall back to the family seed; fresh plans get light paper and dark ink', () => {
  const p = normalizePalette({ primary: '#123456', secondary: 'blue', accent: '#ff0000', bg: '#111111', text: '#222222' }, 'luxury-editorial');
  assert.equal(p.primary, '#123456');
  assert.equal(p.secondary, STYLE_FAMILIES[0]!.seedPalette.secondary);
  const fixed = enforcePaperAndInk(p, 'luxury-editorial');
  assert.ok(relativeLuminance(fixed.bg) >= 0.6, 'paper is light');
  assert.ok(contrastRatio(fixed.text, fixed.bg) >= 7, 'ink reads on it');
  assert.equal(fixed.primary, '#123456', 'brand colours untouched');
  const ok = { primary: '#1c2a44', secondary: '#5b6475', accent: '#b8955a', bg: '#fdf8ee', text: '#151515' };
  assert.deepEqual(enforcePaperAndInk(ok), ok);
});

test('page type decides the kind; a missing type takes the kind\'s GENERAL type, never the editor\'s letter', () => {
  const a = normalizePlanPage({ pageType: 'interview-qa', kind: 'cover', intent: 'Q&A with the trainer', look: 'portrait left', sectionTitle: 'People' });
  assert.equal(a.kind, 'two-column-article');
  assert.equal(a.pageType, 'interview-qa');
  assert.equal(a.look, 'portrait left');

  const b = normalizePlanPage({ pageType: 'not-a-type', kind: 'two-column-article', intent: 'x', sectionTitle: '' });
  assert.equal(b.pageType, 'feature-article');
  assert.equal(defaultTypeForKind('two-column-article').id, 'feature-article');
  assert.equal(defaultTypeForKind('cover').id, 'cover');

  const c = normalizePlanPage({ intent: '' });
  assert.equal(c.kind, 'two-column-article');
  assert.equal(c.intent, 'A page in the magazine.');
  assert.equal('look' in c, false);
});

test('add-pages only ever plans interior pages', () => {
  assert.equal(normalizePlanPage({ pageType: 'cover', intent: 'x' }, { interiorOnly: true }).pageType, 'feature-opener');
  assert.equal(normalizePlanPage({ pageType: 'contents', intent: 'x' }, { interiorOnly: true }).pageType, 'news-briefs');
  assert.equal(normalizePlanPage({ pageType: 'editors-letter', intent: 'x' }, { interiorOnly: true }).pageType, 'feature-article');
  assert.equal(normalizePlanPage({ pageType: 'back-cover', intent: 'x' }, { interiorOnly: true }).pageType, 'photo-essay');
  for (const id of INTERIOR_PAGE_TYPE_IDS) assert.equal(getPageType(id)!.position, 'any');
  const menu = plannerTypeMenu({ interiorOnly: true });
  assert.ok(!/^- cover /m.test(menu) && !/^- contents /m.test(menu) && !/^- back-cover /m.test(menu));
  assert.match(plannerTypeMenu(), /^- interview-qa \[kind two-column-article; dense\]/m);
});

test('prompts: the family menu names every family; the variation seed picks within range', () => {
  const menu = familyMenu();
  for (const f of STYLE_FAMILIES) assert.ok(menu.includes(`- ${f.id} — `));
  assert.deepEqual(variationFor(() => 0), { palette: 0, pairing: 0 });
  assert.deepEqual(variationFor(() => 0.9999), { palette: 2, pairing: 2 });
  const c = normalizeConcept({ family: 'community-club', name: 'Club Life' });
  assert.match(conceptBrief(c), /CREATIVE CONCEPT — "Club Life" \(Warm community newsletter\)/);
  assert.match(conceptVoice(c), /^VOICE OF THIS ISSUE \("Club Life"\): /);
  assert.equal(conceptBrief(undefined), '');
});
