// ---------------------------------------------------------------------------
// Magazine Builder v2 — curated page templates for AI generation.
//
// Templates exist ONLY for from-scratch generation: the AI picks a templateId
// per page and fills its named text slots; the geometry is fixed here (fractional
// boxes → canonical px), so the LLM never emits coordinates and a generated page
// is always valid. Compiled to raw absolute-positioned elements, then run through
// the same validate→sanitize→refit pipeline as every other write.
// ---------------------------------------------------------------------------

import { PAGE_W, PAGE_H } from './config.js';
import type { MagazineElement, TextRole } from './model.js';

export interface GenPalette {
  primary: string;
  secondary: string;
  accent: string;
  bg: string;
  text: string;
}
export type GenStyle = 'classic' | 'editorial' | 'modern' | 'bold' | 'minimal';

const FONTS: Record<GenStyle, { display: string; body: string }> = {
  classic: { display: "Georgia, 'Times New Roman', serif", body: 'Georgia, serif' },
  editorial: { display: "Georgia, 'Times New Roman', serif", body: "'Helvetica Neue', Arial, sans-serif" },
  modern: { display: "'Helvetica Neue', Arial, sans-serif", body: "'Helvetica Neue', Arial, sans-serif" },
  bold: { display: "'Arial Black', 'Helvetica Neue', sans-serif", body: 'Georgia, serif' },
  minimal: { display: "'Helvetica Neue', Arial, sans-serif", body: "'Helvetica Neue', Arial, sans-serif" },
};

type Frac = { x: number; y: number; w: number; h: number }; // 0..1 of page
type ColorRole = 'text' | 'white' | 'primary' | 'accent';
interface TextSlot {
  id: string;
  kind: 'text';
  role: TextRole;
  box: Frac;
  size: number; // px at canonical width
  align: 'left' | 'center' | 'right';
  color: ColorRole;
  font: 'display' | 'body';
}
interface ImageSlot { id: string; kind: 'image'; box: Frac }
interface QrSlot { id: string; kind: 'qr'; box: Frac }
type Slot = TextSlot | ImageSlot | QrSlot;

export interface PageTemplate {
  id: string;
  description: string; // shown to the LLM so it can choose well
  bg: 'bg' | 'primary';
  slots: Slot[];
}

export const TEMPLATES: PageTemplate[] = [
  {
    id: 'cover',
    description: 'Front cover — a bold masthead over a solid colour. Use once, first.',
    bg: 'primary',
    slots: [
      { id: 'kicker', kind: 'text', role: 'other', box: { x: 0.08, y: 0.1, w: 0.7, h: 0.05 }, size: 22, align: 'left', color: 'white', font: 'body' },
      { id: 'title', kind: 'text', role: 'headline', box: { x: 0.08, y: 0.52, w: 0.84, h: 0.24 }, size: 90, align: 'left', color: 'white', font: 'display' },
      { id: 'subtitle', kind: 'text', role: 'subhead', box: { x: 0.08, y: 0.78, w: 0.84, h: 0.08 }, size: 34, align: 'left', color: 'white', font: 'body' },
    ],
  },
  {
    id: 'feature-image',
    description: 'A feature article with a large photo area up top and body copy below.',
    bg: 'bg',
    slots: [
      { id: 'headline', kind: 'text', role: 'headline', box: { x: 0.08, y: 0.07, w: 0.84, h: 0.12 }, size: 62, align: 'left', color: 'text', font: 'display' },
      { id: 'photo', kind: 'image', box: { x: 0.08, y: 0.22, w: 0.84, h: 0.4 } },
      { id: 'body', kind: 'text', role: 'body', box: { x: 0.08, y: 0.65, w: 0.84, h: 0.28 }, size: 24, align: 'left', color: 'text', font: 'body' },
    ],
  },
  {
    id: 'text-feature',
    description: 'A text-led article: headline, byline, and a full column of body copy.',
    bg: 'bg',
    slots: [
      { id: 'headline', kind: 'text', role: 'headline', box: { x: 0.08, y: 0.09, w: 0.84, h: 0.14 }, size: 64, align: 'left', color: 'text', font: 'display' },
      { id: 'byline', kind: 'text', role: 'byline', box: { x: 0.08, y: 0.25, w: 0.5, h: 0.04 }, size: 18, align: 'left', color: 'accent', font: 'body' },
      { id: 'body', kind: 'text', role: 'body', box: { x: 0.08, y: 0.32, w: 0.84, h: 0.6 }, size: 24, align: 'left', color: 'text', font: 'body' },
    ],
  },
  {
    id: 'pull-quote',
    description: 'A full-page pull quote — a large centred quotation with an attribution.',
    bg: 'bg',
    slots: [
      { id: 'quote', kind: 'text', role: 'pullquote', box: { x: 0.12, y: 0.34, w: 0.76, h: 0.3 }, size: 54, align: 'center', color: 'primary', font: 'display' },
      { id: 'attribution', kind: 'text', role: 'caption', box: { x: 0.12, y: 0.66, w: 0.76, h: 0.05 }, size: 22, align: 'center', color: 'text', font: 'body' },
    ],
  },
  {
    id: 'listicle',
    description: 'A list / roundup: a headline and a body area for several short items.',
    bg: 'bg',
    slots: [
      { id: 'headline', kind: 'text', role: 'headline', box: { x: 0.08, y: 0.08, w: 0.84, h: 0.1 }, size: 56, align: 'left', color: 'text', font: 'display' },
      { id: 'body', kind: 'text', role: 'body', box: { x: 0.08, y: 0.2, w: 0.84, h: 0.72 }, size: 24, align: 'left', color: 'text', font: 'body' },
    ],
  },
  {
    id: 'back-cover',
    description: 'Back cover — a short closing message over the solid colour, with a QR slot. Use once, last.',
    bg: 'primary',
    slots: [
      { id: 'closing', kind: 'text', role: 'other', box: { x: 0.1, y: 0.36, w: 0.8, h: 0.2 }, size: 32, align: 'center', color: 'white', font: 'display' },
      { id: 'qr', kind: 'qr', box: { x: 0.42, y: 0.62, w: 0.16, h: 0.12 } },
    ],
  },
];

export const TEMPLATE_IDS = TEMPLATES.map((t) => t.id) as [string, ...string[]];
export const templateById = (id: string): PageTemplate | undefined => TEMPLATES.find((t) => t.id === id);

/** A compact catalogue string for the generation prompt (ids + slot names). */
export function templateCatalogue(): string {
  return TEMPLATES.map((t) => {
    const textSlots = t.slots.filter((s) => s.kind === 'text').map((s) => s.id);
    return `- ${t.id}: ${t.description} Text slots: [${textSlots.join(', ')}]`;
  }).join('\n');
}

const HEX = /^#[0-9a-fA-F]{6}$/;
function safeHex(v: string, fallback: string): string {
  return HEX.test(v) ? v : fallback;
}
export function normalizePalette(p: Partial<GenPalette> | undefined): GenPalette {
  return {
    primary: safeHex(p?.primary ?? '', '#0a2342'),
    secondary: safeHex(p?.secondary ?? '', '#94a3b8'),
    accent: safeHex(p?.accent ?? '', '#b8860b'),
    bg: safeHex(p?.bg ?? '', '#f7f5ef'),
    text: safeHex(p?.text ?? '', '#141414'),
  };
}

function colorFor(role: ColorRole, palette: GenPalette): string {
  if (role === 'white') return '#ffffff';
  if (role === 'primary') return palette.primary;
  if (role === 'accent') return palette.accent;
  return palette.text;
}

/**
 * Compile a template + the AI's slot texts into raw elements. Deterministic:
 * fractional boxes → canonical px, palette/fonts applied, text sized to its box
 * (autoFit shrink from the template size). Image slots become a tinted placeholder
 * block (real image sourcing is a later enhancement). Output still goes through
 * validate→sanitize→refit by the caller.
 */
export function composePage(
  template: PageTemplate,
  texts: Record<string, string>,
  theme: { palette: GenPalette; style: GenStyle },
): { background: { type: 'color'; value: string }; elements: Partial<MagazineElement>[] } {
  const fonts = FONTS[theme.style] ?? FONTS.editorial;
  const bg = template.bg === 'primary' ? theme.palette.primary : theme.palette.bg;
  const elements: Partial<MagazineElement>[] = [];
  let z = 1;

  for (const slot of template.slots) {
    const x = Math.round(slot.box.x * PAGE_W);
    const y = Math.round(slot.box.y * PAGE_H);
    const w = Math.round(slot.box.w * PAGE_W);
    const h = Math.round(slot.box.h * PAGE_H);
    const base = { x, y, w, h, rotation: 0, zIndex: z++, locked: false, source: 'ai-agent' as const };

    if (slot.kind === 'text') {
      const content = (texts[slot.id] ?? '').trim();
      if (!content) continue; // skip empty slots
      elements.push({
        ...base,
        type: 'text',
        text: {
          content,
          role: slot.role,
          fontFamily: slot.font === 'display' ? fonts.display : fonts.body,
          fontSize: slot.size,
          maxFontSize: slot.size,
          fontWeight: slot.role === 'headline' || slot.role === 'pullquote' ? 700 : 400,
          color: colorFor(slot.color, theme.palette),
          align: slot.align,
          lineHeight: slot.role === 'body' ? 1.4 : 1.15,
          autoFit: 'shrink',
        },
      });
    } else if (slot.kind === 'image') {
      // Placeholder block (a tinted rectangle) — the user swaps in real artwork.
      elements.push({ ...base, type: 'shape', shape: { fill: theme.palette.secondary } });
    } else if (slot.kind === 'qr') {
      elements.push({ ...base, type: 'qr', qr: { url: '', fg: theme.palette.text, bg: '#ffffff' } });
    }
  }

  return { background: { type: 'color', value: bg }, elements };
}
