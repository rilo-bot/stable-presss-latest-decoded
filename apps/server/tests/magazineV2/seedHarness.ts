// ---------------------------------------------------------------------------
// Test harness: run a LayoutSpec through the generator's deterministic tail with
// realistic copy — offline (no model, no database, no network).
//
// It mimics composeSpecToPage: a weight-only pre-solve gives every text leaf a box, the
// "copywriter" writes to that box's measured character budget (charBudget, clamped by
// the same per-role table draftPage uses), every photo is assumed found, then prune →
// balance → compose (with auto-backing) → normalizeElements → the QA layer.
// ---------------------------------------------------------------------------

import { solveLayout, type SolvedLayout } from '../../src/lib/magazineV2/solveLayout.js';
import { balanceLayout } from '../../src/lib/magazineV2/balanceLayout.js';
import { pruneLayoutSpec } from '../../src/lib/magazineV2/pruneSpec.js';
import { makeMeasureLeaf, draftingMeasure } from '../../src/lib/magazineV2/measureLeaf.js';
import { composeFromSolved, type ResolvedContent } from '../../src/lib/magazineV2/composeFromSolved.js';
import { normalizeElements } from '../../src/lib/magazineV2/writePipeline.js';
import { validatePageLayout, type LayoutReport } from '../../src/lib/magazineV2/layoutValidate.js';
import { fitReport, charBudget, seriousFlaws, type Fit } from '../../src/lib/magazineV2/fitReport.js';
import { ROLE_SCALE, ptToPx } from '../../src/lib/magazineV2/roleScale.js';
import { PAGE_W, PAGE_H } from '../../src/lib/magazineV2/config.js';
import type { LayoutSpec } from '../../src/lib/magazineV2/layoutSpec.js';
import type { MagazineElement } from '../../src/lib/magazineV2/model.js';

export const PAGE = { width: PAGE_W, height: PAGE_H };
export const FONTS = { display: 'Playfair Display, Georgia, serif', body: 'Inter, Arial, sans-serif' };
export const PALETTE = { primary: '#1c2a44', secondary: '#5b6475', accent: '#b8955a', bg: '#faf7f0', text: '#14161c' };

const WORDS = (
  'the season opened under grey skies at the track and the young trainers who have spent winter building their teams ' +
  'arrived with horses that looked sharper than anyone expected owners stood along the rail breeders compared notes ' +
  'about bloodlines and the farrier worked quietly behind the stalls while the strappers walked each runner in slow ' +
  'circles every stable here has a story about patience and early mornings and the long road from a yearling sale ' +
  'to a first win on a country course this is what keeps the sport alive in small towns across the region'
).split(' ');

/** Deterministic prose of about `chars` characters, in sentences and paragraphs. */
export function prose(chars: number, seed = 1): string {
  const out: string[] = [];
  let len = 0;
  let i = seed * 7;
  let inSentence = 0;
  while (len < chars) {
    let w = WORDS[i % WORDS.length]!;
    i += 3 + (i % 5);
    if (inSentence === 0) w = w[0]!.toUpperCase() + w.slice(1);
    inSentence++;
    if (inSentence > 9 + (i % 7)) {
      w += '.';
      inSentence = 0;
    }
    out.push(w);
    len += w.length + 1;
  }
  let s = out.join(' ').replace(/\s*$/, '');
  if (!/[.]$/.test(s)) s += '.';
  // Paragraph breaks every ~450 characters, as the copywriter writes them.
  if (chars > 600) s = s.replace(/(.{420,}?\.) /g, '$1\n');
  return s;
}

const TABLE: Record<string, number> = { headline: 80, subhead: 140, byline: 60, body: 1400, caption: 140, pullquote: 220, other: 220 };
const LEAF_TO_TEXT: Record<string, string> = { headline: 'headline', figure: 'headline', pullquote: 'pullquote', subhead: 'subhead', kicker: 'subhead', byline: 'byline', body: 'body', entry: 'body', label: 'caption', caption: 'caption' };

/** Copy for one slot, the way the copywriter would write it for this box. */
function copyFor(ref: string, role: string, budget: number, seed: number): string {
  if (/^stat\d/.test(ref)) return ['4.8%', '1,240', '$12M', '1998', '27', '150+'][seed % 6]!;
  if (/^label\d/.test(ref)) return ['Group 1 wins this season', 'Yearlings sold at Karaka', 'Prize money on offer', 'Founded on the river flats', 'Trainers licensed', 'Race days a year'][seed % 6]!;
  if (/^entry\d/.test(ref)) return ['Cup Week: tradition, theatre and top-flight racing', 'Rising Stables: the trainers rewriting the form guide', 'Karaka Calling: inside the yearling ring', 'The Next Furlong: welfare, technology and the future', 'Country Cups: small towns, big days', 'Bloodlines: three families that shaped the sport', 'Morning Work: a day on the gallops', 'The Strapper: unsung hands'][seed % 8]!;
  if (/^question\d/.test(ref)) return 'What first drew you to training horses on the coast?';
  if (/^brief\d+Title$/.test(ref)) return ['Track upgrade approved', 'New apprentice intake', 'Sale record broken', 'Welfare review published'][seed % 4]!;
  if (ref === 'sidebarTitle') return 'Key facts';
  if (ref === 'cta') return 'Book your table today';
  if (ref === 'qrLabel') return 'Scan to subscribe';
  if (ref === 'kicker') return 'Owner stories';
  if (/^attribution|^byline/.test(ref)) return '— A Cambridge breeder';
  switch (role) {
    case 'headline': return ref === 'headline' ? 'Racing, Recast' : 'Stars in the Making';
    case 'kicker': return 'Owner stories';
    case 'label': return 'At a glance';
    case 'pullquote': return 'You learn more from one wet morning on the gallops than from a whole season of watching.';
    case 'caption': return prose(Math.min(110, budget), seed);
    case 'subhead': return prose(Math.min(120, Math.max(40, budget)), seed);
    case 'byline': return 'Words by Aroha Smith';
    default: return prose(Math.max(60, Math.round(budget * 0.85)), seed);
  }
}

/** The content a page would get: copy written to each box's budget, every photo found. */
export function contentFor(spec: LayoutSpec, fonts = FONTS): ResolvedContent {
  // The drafting pre-solve, exactly as buildPseudoTemplate runs it.
  const pre = solveLayout(spec, PAGE, { measureLeaf: draftingMeasure(fonts) });
  const content: ResolvedContent = {};
  let seed = 0;
  for (const l of pre.leaves) {
    const ref = l.node.contentRef;
    if (!ref || content[ref]) continue;
    seed++;
    const role = l.node.role;
    if (role === 'image') { content[ref] = { image: { url: `https://cdn.example.com/${ref}.jpg`, assetId: ref, alt: ref } }; continue; }
    if (role === 'qr') { content[ref] = { qrUrl: 'https://example.com/join' }; continue; }
    const scale = ROLE_SCALE[role];
    if (!scale) continue;
    const fontSize = l.node.fontPt !== undefined ? ptToPx(l.node.fontPt) : scale.maxFontSize;
    const fitted = charBudget({
      boxW: l.box.w, boxH: l.box.h, fontSize, lineHeight: l.node.lineHeight ?? scale.lineHeight,
      fontFamily: (l.node.fontRef ?? scale.fontRef) === 'display' ? fonts.display : fonts.body, fontWeight: l.node.weightHint ?? scale.fontWeight,
    });
    const textRole = LEAF_TO_TEXT[role] ?? 'body';
    const table = TABLE[textRole] ?? 220;
    const floor = textRole === 'body' ? 300 : 20;
    const budget = fitted ? Math.max(floor, Math.min(table, fitted)) : table;
    content[ref] = { text: copyFor(ref, role, budget, seed) };
  }
  return content;
}

export interface Run {
  solved: SolvedLayout;
  elements: MagazineElement[];
  report: LayoutReport;
  fit: Fit;
  flaws: number;
  actions: string[];
  background: string;
}

/** Prune → balance → compose (auto-backing) → normalise → QA, exactly as the generator does. */
export function runSpec(spec: LayoutSpec, content: ResolvedContent = contentFor(spec), theme = { palette: PALETTE, fonts: FONTS }): Run {
  const pruned = pruneLayoutSpec(spec, content);
  if (!pruned) throw new Error('nothing survived pruning');
  const balanced = balanceLayout(pruned, { page: PAGE, measure: makeMeasureLeaf(content, theme.fonts), content });
  const composed = composeFromSolved(balanced.solved, balanced.content, theme, { autoBacking: true });
  const elements = normalizeElements(composed.elements, PAGE);
  const fit = fitReport(balanced.solved, balanced.content, theme.fonts);
  return {
    solved: balanced.solved,
    elements,
    report: validatePageLayout(elements, PAGE),
    fit,
    flaws: seriousFlaws(fit),
    actions: balanced.actions,
    background: composed.background.value,
  };
}
