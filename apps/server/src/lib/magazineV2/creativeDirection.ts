// ---------------------------------------------------------------------------
// Magazine Builder v2 — the CREATIVE DIRECTOR's vocabulary (2026-11-12).
//
// Every issue used to come out in the same clothes: navy/gold, Playfair over Inter,
// and a planner that described each page in isolation. Two fixes live here:
//
//   1. STYLE FAMILIES. A curated set of looks (luxury editorial, bold sport,
//      heritage racing, community newsletter…). The planner picks the family that
//      suits the brief and then writes a CONCRETE concept for this issue — mood,
//      one photo style, type voice, grid, motifs, writing voice — that every later
//      stage reads. One concept per issue is what makes an issue consistent.
//   2. A VARIATION SEED. Claude runs without temperature here, so the same brief
//      tends to converge on the same palette. Each family offers three palette
//      directions and three font pairings, and a random seed tells the planner which
//      to use — so two issues on the same subject do not share a look, while the
//      brief's own colours/brand still win.
//
// Plus the deterministic normalisers for what the planner returns (concept,
// palette, fonts, page types), so a malformed plan degrades to the family's own
// defaults rather than to one global default.
//
// Pure: no I/O, no LLM. generate.ts imports the database at module scope, so the
// rules live here where they can be tested.
// ---------------------------------------------------------------------------

import { PAGE_TEMPLATE_KINDS, type GenFonts, type GenPalette, type PageTemplateKind } from './templates.js';
import { PAGE_TYPES, getPageType, normalizePageType, type PageTypeDef } from './pageTypes.js';
import { contrastRatio, relativeLuminance } from './layout.js';
import type { GenPlanPage, IssueConcept } from './generate.js';

// ── Fonts ─────────────────────────────────────────────────────────────────────
//
// Curated stacks the planner chooses from. Every primary family here is BOTH
// measured in fontMetrics.data.ts (so the layout engine fits copy with real glyph
// advances) AND loaded by the editor + bulletin viewer (styles/theme.css and the
// web font registry, which the PDF renders through). Anything else falls back.

export const DISPLAY_FONTS = [
  'Playfair Display, Georgia, serif',
  'DM Serif Display, Georgia, serif',
  "Georgia, 'Times New Roman', serif",
  'Montserrat, Arial, sans-serif',
  'Oswald, Arial, sans-serif',
  'Cormorant Garamond, Garamond, Georgia, serif',
  'EB Garamond, Garamond, Georgia, serif',
  'Libre Baskerville, Baskerville, Georgia, serif',
  'Merriweather, Georgia, serif',
  'Archivo, Arial, sans-serif',
  'Work Sans, Arial, sans-serif',
  'Poppins, Arial, sans-serif',
];
export const BODY_FONTS = [
  'Inter, Arial, sans-serif',
  "Georgia, 'Times New Roman', serif",
  'Arial, Helvetica, sans-serif',
  "'Source Sans 3', Arial, sans-serif",
  'Lora, Georgia, serif',
  'PT Serif, Georgia, serif',
  'Work Sans, Arial, sans-serif',
  'Merriweather, Georgia, serif',
  'EB Garamond, Garamond, Georgia, serif',
];

/** The first family of a CSS stack, normalised: "'Source Sans 3', Arial" → "source sans 3". */
function primaryFamily(stack: string): string {
  return (stack.split(',')[0] ?? '').replace(/['"]/g, '').trim().toLowerCase();
}
/** Human name of a stack's primary family, for prompts. */
export function fontName(stack: string): string {
  return (stack.split(',')[0] ?? '').replace(/['"]/g, '').trim();
}
/** A model-supplied font → the curated stack it names (exact, or by primary family). */
export function matchFont(v: unknown, allowed: string[]): string | undefined {
  if (typeof v !== 'string' || !v.trim()) return undefined;
  if (allowed.includes(v)) return v;
  const fam = primaryFamily(v);
  return allowed.find((s) => primaryFamily(s) === fam);
}

// ── Style families ────────────────────────────────────────────────────────────

export interface StyleFamily {
  id: string;
  label: string;
  /** When the planner should reach for it. */
  fits: string;
  /** Defaults for a concept the planner left thin. */
  mood: string;
  photoStyle: string;
  typeVoice: string;
  grid: string;
  motifs: string[];
  voice: string;
  /** Three palette directions in words; the variation seed picks one per issue. */
  palettes: [string, string, string];
  /** Three [display, body] pairings, exact entries of DISPLAY_FONTS / BODY_FONTS. */
  pairings: [[string, string], [string, string], [string, string]];
  /** A safe palette (light paper, dark ink) for normalisation fallbacks. */
  seedPalette: GenPalette;
}

const F = {
  playfair: DISPLAY_FONTS[0]!, dmSerif: DISPLAY_FONTS[1]!, georgiaD: DISPLAY_FONTS[2]!, montserrat: DISPLAY_FONTS[3]!,
  oswald: DISPLAY_FONTS[4]!, cormorant: DISPLAY_FONTS[5]!, garamondD: DISPLAY_FONTS[6]!, baskerville: DISPLAY_FONTS[7]!,
  merriweatherD: DISPLAY_FONTS[8]!, archivo: DISPLAY_FONTS[9]!, workSansD: DISPLAY_FONTS[10]!, poppins: DISPLAY_FONTS[11]!,
  inter: BODY_FONTS[0]!, georgia: BODY_FONTS[1]!, arial: BODY_FONTS[2]!, sourceSans: BODY_FONTS[3]!, lora: BODY_FONTS[4]!,
  ptSerif: BODY_FONTS[5]!, workSans: BODY_FONTS[6]!, merriweather: BODY_FONTS[7]!, garamond: BODY_FONTS[8]!,
};

export const STYLE_FAMILIES: StyleFamily[] = [
  {
    id: 'luxury-editorial', label: 'Luxury editorial',
    fits: 'premium brands, prestige bloodstock and sales, high-value events, collectors',
    mood: 'Hushed, assured and expensive: restraint, space and a few perfect details.',
    photoStyle: 'Soft natural light, shallow depth of field, muted warm grade, generous negative space around the subject.',
    typeVoice: 'High-contrast serif display set large, small tracked capitals for kickers, airy leading.',
    grid: 'Asymmetric 12-column grid with wide outer margins and plenty of air.',
    motifs: ['hairline rules', 'small tracked capitals', 'one metallic accent'],
    voice: 'Unhurried, sensory and precise; long elegant sentences, no exclamation marks, no hype.',
    palettes: ['ink navy, ivory paper, champagne gold accent', 'espresso brown, bone paper, bronze accent', 'deep forest green, cream paper, antique brass accent'],
    pairings: [[F.cormorant, F.sourceSans], [F.playfair, F.inter], [F.dmSerif, F.workSans]],
    seedPalette: { primary: '#1c2a44', secondary: '#5b6475', accent: '#b8955a', bg: '#faf7f0', text: '#14161c' },
  },
  {
    id: 'bold-sport', label: 'Bold sport',
    fits: 'race days, action, results, teams, fixtures, competition and energy',
    mood: 'Kinetic, loud and competitive: every page feels like the last furlong.',
    photoStyle: 'Fast-shutter action, tight crops on the moment, high contrast and saturated colour.',
    typeVoice: 'Condensed heavy capitals for headlines, oversized numerals, tight leading.',
    grid: 'Hard-edged blocks and full-bleed images on a strong 6-column grid.',
    motifs: ['oversized numbers', 'thick colour bars', 'diagonal-feeling crops'],
    voice: 'Punchy and present-tense: active verbs, short sentences, the number first.',
    palettes: ['jet black, crisp white paper, racing red accent', 'deep navy, white paper, signal yellow accent', 'racing green, off-white paper, bright orange accent'],
    pairings: [[F.oswald, F.inter], [F.archivo, F.sourceSans], [F.montserrat, F.arial]],
    seedPalette: { primary: '#111318', secondary: '#3a3f4a', accent: '#d7262e', bg: '#ffffff', text: '#0f1115' },
  },
  {
    id: 'heritage-racing', label: 'Heritage / vintage',
    fits: 'history, anniversaries, bloodlines, tradition, archives, famous venues',
    mood: 'Nostalgic and storied: a well-kept scrapbook of a long tradition.',
    photoStyle: 'Warm film grain, sepia-leaning grade, archival textures, classic portrait framing.',
    typeVoice: 'Classic old-style serif, small capitals, centred titling, italic standfirsts.',
    grid: 'Classical symmetrical columns with framed panels.',
    motifs: ['double rules', 'framed captions', 'dates set as display figures'],
    voice: 'Storytelling and measured, rich with dates, names and places; respectful, never twee.',
    palettes: ['oxblood, parchment paper, old gold accent', 'bottle green, cream paper, tan leather accent', 'faded navy, newsprint paper, rust accent'],
    pairings: [[F.baskerville, F.ptSerif], [F.garamondD, F.lora], [F.playfair, F.georgia]],
    seedPalette: { primary: '#5e1f1f', secondary: '#6b5a45', accent: '#b08a3e', bg: '#f6f0e2', text: '#1e1a16' },
  },
  {
    id: 'modern-minimal', label: 'Modern minimal',
    fits: 'business, technology, design-led brands, clean corporate communication',
    mood: 'Calm, confident and precise: nothing on the page without a reason.',
    photoStyle: 'Clean daylight, simple backgrounds, geometric compositions, neutral grade.',
    typeVoice: 'Grotesque sans with strong weight contrast, sentence case, generous whitespace.',
    grid: 'Strict modular grid, aligned edges, lots of white space.',
    motifs: ['thin rules', 'numbered sections', 'one solid colour block'],
    voice: 'Clear, concise and confident; plain words, no jargon, no filler.',
    palettes: ['near-black, white paper, cobalt blue accent', 'graphite, warm white paper, coral accent', 'slate, pale grey paper, emerald accent'],
    pairings: [[F.workSansD, F.inter], [F.montserrat, F.sourceSans], [F.archivo, F.workSans]],
    seedPalette: { primary: '#1d1f24', secondary: '#4a5160', accent: '#2f5bea', bg: '#ffffff', text: '#121418' },
  },
  {
    id: 'community-club', label: 'Warm community newsletter',
    fits: 'clubs, associations, schools, volunteers, members and local news',
    mood: 'Friendly, inclusive and proud: the people are the story.',
    photoStyle: 'Candid people moments in warm natural light, real places, groups and smiles.',
    typeVoice: 'Friendly geometric sans headlines in sentence case, readable body.',
    grid: 'Flexible cards and boxed panels with clear sections.',
    motifs: ['rounded colour panels', 'icon rows', 'name-and-role captions'],
    voice: 'Warm and plain-spoken, "we" and "our"; names, thanks and practical details.',
    palettes: ['teal, cream paper, sunflower accent', 'brick red, warm white paper, sky blue accent', 'leaf green, off-white paper, orange accent'],
    pairings: [[F.poppins, F.sourceSans], [F.merriweatherD, F.sourceSans], [F.montserrat, F.lora]],
    seedPalette: { primary: '#0f5c5c', secondary: '#4f6d6d', accent: '#f2b632', bg: '#fdfaf3', text: '#1a1d1d' },
  },
  {
    id: 'high-fashion', label: 'High fashion',
    fits: 'style, raceday fashion, lifestyle, beauty, luxury design',
    mood: 'Dramatic and glamorous: bold scale, bold attitude.',
    photoStyle: 'Editorial portraits, hard light or high-key, bold colour or monochrome, dramatic crops.',
    typeVoice: 'Huge high-contrast serif against small tracked sans; extreme scale contrast, lots of capitals.',
    grid: 'Broken grid, type and image overlapping, extreme whitespace.',
    motifs: ['oversized letterforms', 'tracked capital labels', 'flat colour blocks'],
    voice: 'Confident, terse and sensual; short declarative lines.',
    palettes: ['black, white paper, hot pink accent', 'camel, cream paper, black accent', 'deep burgundy, blush paper, black accent'],
    pairings: [[F.cormorant, F.workSans], [F.dmSerif, F.inter], [F.playfair, F.sourceSans]],
    seedPalette: { primary: '#121212', secondary: '#555555', accent: '#e0287d', bg: '#ffffff', text: '#0d0d0d' },
  },
  {
    id: 'annual-report', label: 'Data-driven annual report',
    fits: 'reports, results, finances, impact, strategy, statistics',
    mood: 'Authoritative and clear: evidence first, every figure in context.',
    photoStyle: 'Clean documentary of people at work and places, cool desaturated grade.',
    typeVoice: 'Sturdy sans, big tabular figures, clear hierarchy.',
    grid: 'Rigorous 12-column grid with data panels.',
    motifs: ['big numerals', 'bar shapes', 'colour-coded sections'],
    voice: 'Factual and concise; numbers with context, no hype.',
    palettes: ['navy, white paper, teal accent', 'charcoal, white paper, amber accent', 'deep purple, pale grey paper, lime accent'],
    pairings: [[F.archivo, F.inter], [F.montserrat, F.sourceSans], [F.workSansD, F.ptSerif]],
    seedPalette: { primary: '#15284b', secondary: '#4a5a78', accent: '#14a39a', bg: '#ffffff', text: '#111827' },
  },
  {
    id: 'outdoor-rural', label: 'Outdoor / rural lifestyle',
    fits: 'farms, countryside, equestrian leisure, travel, nature, produce',
    mood: 'Earthy, open and honest: big skies and real work.',
    photoStyle: 'Golden-hour landscapes, wide environmental shots, natural textures, warm earthy grade.',
    typeVoice: 'Sturdy serif headlines, humanist body, relaxed scale.',
    grid: 'Generous full-bleed landscapes over wide columns.',
    motifs: ['textured colour fields', 'field-note labels', 'numbered map markers'],
    voice: 'Grounded and sensory, seasonal and practical; the land and the people on it.',
    palettes: ['olive, oat paper, terracotta accent', 'moss green, linen paper, mustard accent', 'slate blue, stone paper, rust accent'],
    pairings: [[F.merriweatherD, F.sourceSans], [F.baskerville, F.workSans], [F.dmSerif, F.lora]],
    seedPalette: { primary: '#4b5320', secondary: '#7a6a4f', accent: '#c0603a', bg: '#f7f3ea', text: '#1f1c17' },
  },
  {
    id: 'newsroom', label: 'News digest',
    fits: 'news roundups, bulletins, weekly updates, announcements',
    mood: 'Urgent and credible: dense, organised, trustworthy.',
    photoStyle: 'Photojournalism: documentary moments in natural colour.',
    typeVoice: 'Serif headlines with strong hierarchy, compact body, clear bylines.',
    grid: 'Multi-column grid with rules between columns.',
    motifs: ['column rules', 'datelines', 'section flags'],
    voice: 'Inverted pyramid: who, what, when first; crisp, neutral, specific.',
    palettes: ['black, newsprint paper, red accent', 'navy, off-white paper, yellow accent', 'ink blue, pale grey paper, bright blue accent'],
    pairings: [[F.playfair, F.sourceSans], [F.merriweatherD, F.georgia], [F.oswald, F.ptSerif]],
    seedPalette: { primary: '#161616', secondary: '#4d4d4d', accent: '#c8102e', bg: '#fbfaf6', text: '#111111' },
  },
  {
    id: 'playful-youth', label: 'Bright and playful',
    fits: 'juniors, pony club, families, open days, education, fun events',
    mood: 'Joyful and energetic: bright, friendly and easy to read.',
    photoStyle: 'Bright saturated daylight, kids and families, fun candid moments.',
    typeVoice: 'Chunky friendly sans, big numbers, sentence case.',
    grid: 'Cards and badges on a loose grid.',
    motifs: ['colour panels', 'icons with labels', 'badge-style numbers'],
    voice: 'Simple, enthusiastic and direct ("you"); short sentences.',
    palettes: ['royal blue, white paper, sunshine yellow accent', 'tangerine, cream paper, teal accent', 'grape purple, white paper, lime accent'],
    pairings: [[F.poppins, F.inter], [F.montserrat, F.sourceSans], [F.archivo, F.workSans]],
    seedPalette: { primary: '#1f4fd1', secondary: '#4a5d8f', accent: '#ffc21a', bg: '#ffffff', text: '#141a2a' },
  },
];

export const STYLE_FAMILY_IDS = STYLE_FAMILIES.map((f) => f.id) as [string, ...string[]];
const FAMILY_BY_ID = new Map(STYLE_FAMILIES.map((f) => [f.id, f]));

export function getStyleFamily(id: unknown): StyleFamily | undefined {
  if (typeof id !== 'string') return undefined;
  const k = id.trim().toLowerCase();
  return FAMILY_BY_ID.get(k) ?? STYLE_FAMILIES.find((f) => f.label.toLowerCase() === k);
}

// Keyword steer for a concept the planner did not supply (or an old issue being
// extended). Order matters: the first family whose words appear wins.
const FAMILY_KEYWORDS: [string, RegExp][] = [
  ['annual-report', /\b(annual report|report|results|financ|impact|strateg|statistic|data|figures)\b/i],
  ['heritage-racing', /\b(history|heritage|anniversar|centenar|vintage|archive|tradition|bloodline|legend)/i],
  ['high-fashion', /\b(fashion|style|couture|beauty|millinery|dress|glamour)/i],
  ['playful-youth', /\b(kids|children|junior|pony club|family|families|school holiday|youth)/i],
  ['community-club', /\b(club|association|members?|volunteer|community|newsletter|society)\b/i],
  ['newsroom', /\b(news|bulletin|update|digest|roundup|weekly)\b/i],
  ['outdoor-rural', /\b(farm|rural|country|countryside|outdoor|trail|travel|produce|nature)/i],
  ['luxury-editorial', /\b(luxury|premium|prestige|exclusive|elite|bespoke|sale|auction)/i],
  ['bold-sport', /\b(race|racing|raceday|cup|derby|sport|team|season|champion|fixtures?)\b/i],
];

export function familyForBrief(brief: string): StyleFamily {
  for (const [id, re] of FAMILY_KEYWORDS) if (re.test(brief)) return FAMILY_BY_ID.get(id)!;
  return FAMILY_BY_ID.get('modern-minimal')!;
}

// ── Concept ───────────────────────────────────────────────────────────────────

function clip(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/**
 * The planner's concept, validated. Unknown family → the brief's keyword steer;
 * every thin field → that family's default, so downstream prompts always get a
 * complete concept.
 */
export function normalizeConcept(raw: unknown, brief = ''): IssueConcept {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const fam = getStyleFamily(o.family) ?? familyForBrief(brief);
  const motifs = Array.isArray(o.motifs)
    ? o.motifs.map((m) => clip(m, 60)).filter(Boolean).slice(0, 4)
    : [];
  return {
    family: fam.id,
    name: clip(o.name, 80) || fam.label,
    mood: clip(o.mood, 300) || fam.mood,
    photoStyle: clip(o.photoStyle, 300) || fam.photoStyle,
    typeVoice: clip(o.typeVoice, 200) || fam.typeVoice,
    grid: clip(o.grid, 200) || fam.grid,
    motifs: motifs.length ? motifs : [...fam.motifs],
    voice: clip(o.voice, 240) || fam.voice,
  };
}

/** The concept as compact prompt lines (planner, copywriter, art director, editor). */
export function conceptBrief(concept: IssueConcept | undefined): string {
  if (!concept) return '';
  const fam = getStyleFamily(concept.family);
  return [
    `CREATIVE CONCEPT — "${concept.name}"${fam ? ` (${fam.label})` : ''}: ${concept.mood}`,
    `Photography: ${concept.photoStyle}`,
    [concept.typeVoice ? `Type: ${concept.typeVoice}` : '', concept.grid ? `Grid: ${concept.grid}` : '']
      .filter(Boolean).join(' · '),
    concept.motifs?.length ? `Motifs: ${concept.motifs.join('; ')}` : '',
    concept.voice ? `Voice: ${concept.voice}` : '',
  ].filter(Boolean).join('\n');
}

/** The copywriter's slice of the concept: how the words should sound. */
export function conceptVoice(concept: IssueConcept | undefined): string {
  if (!concept) return '';
  const voice = concept.voice || getStyleFamily(concept.family)?.voice || '';
  return [
    `VOICE OF THIS ISSUE ("${concept.name}"): ${voice}`.trim(),
    `Mood: ${concept.mood}`,
    concept.typeVoice ? `Headlines suit the type voice: ${concept.typeVoice}` : '',
  ].filter(Boolean).join('\n');
}

/** The family menu for the planner, one compact line each. */
export function familyMenu(): string {
  return STYLE_FAMILIES.map((f) =>
    `- ${f.id} — for ${f.fits}. Palettes: ${f.palettes.map((p, i) => `${i + 1}) ${p}`).join(' · ')}. ` +
    `Fonts: ${f.pairings.map(([d, b], i) => `${i + 1}) ${fontName(d)} / ${fontName(b)}`).join(' · ')}.`,
  ).join('\n');
}

/** Which palette direction and font pairing this issue uses (seeded per call). */
export function variationFor(rand: () => number = Math.random): { palette: number; pairing: number } {
  const n = (k: number) => Math.min(k - 1, Math.max(0, Math.floor(rand() * k)));
  return { palette: n(3), pairing: n(3) };
}

// ── Palette + fonts ───────────────────────────────────────────────────────────

export const DEFAULT_PALETTE: GenPalette = {
  primary: '#1b3a6b',
  secondary: '#2f4b7c',
  accent: '#e0b84c',
  bg: '#ffffff',
  text: '#12161f',
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
function hex(v: unknown, fallback: string): string {
  return typeof v === 'string' && HEX_RE.test(v.trim()) ? v.trim() : fallback;
}

/** Per-channel validation; a bad channel falls back to the FAMILY's seed (or the
 *  global default when no family is known — stored issues keep what they had). */
export function normalizePalette(p: unknown, familyId?: string): GenPalette {
  const o = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
  const seed = getStyleFamily(familyId)?.seedPalette ?? DEFAULT_PALETTE;
  return {
    primary: hex(o.primary, seed.primary),
    secondary: hex(o.secondary, seed.secondary),
    accent: hex(o.accent, seed.accent),
    bg: hex(o.bg, seed.bg),
    text: hex(o.text, seed.text),
  };
}

/**
 * Paper and ink for a FRESH plan: `bg` is the page paper and must be light, `text`
 * must read on it. Downstream relies on both — the art director's scrims are
 * `colorRef:"text"` (a light text colour would wash photos white) and running heads
 * sit on `bg`. Not applied to stored palettes: an existing issue keeps its look.
 */
export function enforcePaperAndInk(p: GenPalette, familyId?: string): GenPalette {
  const seed = getStyleFamily(familyId)?.seedPalette ?? DEFAULT_PALETTE;
  let { bg, text } = p;
  if (relativeLuminance(bg) < 0.6) bg = seed.bg;
  if (contrastRatio(text, bg) < 7) text = contrastRatio(seed.text, bg) >= 7 ? seed.text : '#111111';
  return { ...p, bg, text };
}

/** Fonts from the curated lists (matched by primary family); fallback = the family's
 *  first pairing, so a malformed plan does not land on one global default. */
export function normalizeFonts(f: unknown, familyId?: string): GenFonts {
  const o = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>;
  const pair = getStyleFamily(familyId)?.pairings[0] ?? [DISPLAY_FONTS[0]!, BODY_FONTS[0]!];
  return {
    display: matchFont(o.display, DISPLAY_FONTS) ?? pair[0],
    body: matchFont(o.body, BODY_FONTS) ?? pair[1],
  };
}

// ── Page types for the planner ────────────────────────────────────────────────

export const INTERIOR_KINDS: PageTemplateKind[] = ['feature-full-bleed', 'two-column-article', 'photo-grid', 'pull-quote', 'stat-infographic'];

/** Front/back-matter types and the interior type that does the same job. Used when a
 *  planner puts one where it cannot go (add-pages) or twice (the rhythm pass). */
export const INTERIOR_SWAP: Record<string, string> = {
  cover: 'feature-opener',
  'back-cover': 'photo-essay',
  contents: 'news-briefs',
  'editors-letter': 'feature-article',
};

function isInteriorType(t: PageTypeDef): boolean {
  return t.position === 'any' && INTERIOR_KINDS.includes(t.baseKind);
}

export const PAGE_TYPE_IDS = PAGE_TYPES.map((t) => t.id) as [string, ...string[]];
export const INTERIOR_PAGE_TYPE_IDS = PAGE_TYPES.filter(isInteriorType).map((t) => t.id) as [string, ...string[]];

/**
 * The default type for a kind, preferring a general ('any') type. pageTypes'
 * defaultPageTypeForKind takes the FIRST registered type, which for
 * 'two-column-article' is the editor's letter — so every older plan would be
 * written as a letter. Plans built here always carry a pageType.
 */
export function defaultTypeForKind(kind: PageTemplateKind): PageTypeDef {
  return (
    PAGE_TYPES.find((t) => t.baseKind === kind && t.position === 'any') ??
    PAGE_TYPES.find((t) => t.baseKind === kind) ??
    getPageType('feature-article') ??
    PAGE_TYPES[0]!
  );
}

/** A page's type: its own when valid, else its kind's general default. */
export function typeOfPage(page: { kind: PageTemplateKind; pageType?: string }): PageTypeDef {
  return getPageType(page.pageType) ?? defaultTypeForKind(page.kind);
}

/** The planner's menu: id, base kind, density and purpose. */
export function plannerTypeMenu(opts: { interiorOnly?: boolean } = {}): string {
  return PAGE_TYPES.filter((t) => !opts.interiorOnly || isInteriorType(t))
    .map((t) => `- ${t.id} [kind ${t.baseKind}; ${t.density}]: ${t.purpose}`)
    .join('\n');
}

/**
 * One planner page, validated. The TYPE decides the kind (kind = its baseKind);
 * an unknown type falls back to a valid kind's general type; anything else is a
 * feature article. `interiorOnly` (add-pages) swaps front/back matter for the
 * interior type that does the same job.
 */
export function normalizePlanPage(
  x: { pageType?: unknown; kind?: unknown; intent?: unknown; look?: unknown; sectionTitle?: unknown },
  opts: { interiorOnly?: boolean } = {},
): GenPlanPage {
  let type = getPageType(normalizePageType(x.pageType));
  if (!type) {
    const kind = typeof x.kind === 'string' && (PAGE_TEMPLATE_KINDS as readonly string[]).includes(x.kind)
      ? (x.kind as PageTemplateKind)
      : 'two-column-article';
    type = defaultTypeForKind(kind);
  }
  if (opts.interiorOnly && !isInteriorType(type)) {
    type = getPageType(INTERIOR_SWAP[type.id]) ?? defaultTypeForKind('two-column-article');
  }
  const look = clip(x.look, 400);
  return {
    kind: type.baseKind,
    pageType: type.id,
    intent: clip(x.intent, 400) || 'A page in the magazine.',
    sectionTitle: clip(x.sectionTitle, 120),
    ...(look ? { look } : {}),
  };
}
