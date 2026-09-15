/**
 * Curated font registry for the magazine editor.
 *
 * `ElementTextData.fontFamily` stores a RAW CSS font-family stack — the same
 * value the server's templates, DSL composer and PDF-import path all write, and
 * the same value both renderers hand to CSS. This registry is therefore the
 * editor's list of OFFERED stacks, not a layer of indirection over them: an
 * element authored anywhere in the system is matched back to its entry by
 * PRIMARY FAMILY (see `findFontByStack`), so the picker shows the right face
 * whether the stack was written here, by a template, or extracted from a PDF.
 *
 * (An earlier draft of this file stored a stable FontId and resolved it at render
 * time via `resolveFontStack`. Nothing ever wrote a FontId, so the indirection was
 * fiction; matching by primary family gets the same "retune a stack later" freedom
 * without a migration of every saved document.)
 *
 * The inspector groups these Classic / Modern / Script and previews each option in
 * its own face. Fonts already loaded by the app — Playfair Display, Source Sans 3
 * and IM Fell English via App.tsx, plus the generator's faces via styles/theme.css —
 * and the system faces carry `alreadyLoaded: true` and are NOT re-requested.
 */

export type FontCategory = 'modern' | 'classic' | 'script';

export interface FontDef {
  id: string;
  label: string;
  category: FontCategory;
  /** CSS font-family value. */
  stack: string;
  /** Google Fonts `family=` spec, e.g. "Lora:ital,wght@0,400;0,700;1,400". */
  googleSpec?: string;
  alreadyLoaded?: boolean;
}

export const FONT_REGISTRY: FontDef[] = [
  // ── Classic / serif ───────────────────────────────────────────────
  {
    id: 'playfair',
    label: 'Playfair Display',
    category: 'classic',
    stack: "'Playfair Display', Georgia, serif",
    // The app's base stylesheet loads Playfair 400–700 upright only, but the
    // bulletin house style uses weight 800 (display headlines / stat figures) and
    // italic (pull quotes). Request those faces here so the editor AND the public
    // viewer render them for real instead of faux-bold/italic.
    googleSpec: 'Playfair+Display:ital,wght@0,700;0,800;0,900;1,400;1,500;1,600;1,700',
  },
  {
    id: 'im-fell',
    label: 'IM Fell English',
    category: 'classic',
    stack: "'IM Fell English', 'Palatino Linotype', serif",
    alreadyLoaded: true,
  },
  {
    id: 'lora',
    label: 'Lora',
    category: 'classic',
    stack: "'Lora', Georgia, serif",
    googleSpec: 'Lora:ital,wght@0,400;0,500;0,600;0,700;1,400',
  },
  {
    id: 'merriweather',
    label: 'Merriweather',
    category: 'classic',
    stack: "'Merriweather', Georgia, serif",
    googleSpec: 'Merriweather:ital,wght@0,400;0,700;0,900;1,400',
  },
  {
    id: 'eb-garamond',
    label: 'EB Garamond',
    category: 'classic',
    stack: "'EB Garamond', Garamond, serif",
    googleSpec: 'EB+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400',
  },
  {
    id: 'cormorant',
    label: 'Cormorant Garamond',
    category: 'classic',
    stack: "'Cormorant Garamond', Garamond, serif",
    googleSpec: 'Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400',
  },
  {
    id: 'libre-baskerville',
    label: 'Libre Baskerville',
    category: 'classic',
    stack: "'Libre Baskerville', Baskerville, serif",
    googleSpec: 'Libre+Baskerville:ital,wght@0,400;0,700;1,400',
  },
  {
    id: 'pt-serif',
    label: 'PT Serif',
    category: 'classic',
    stack: "'PT Serif', Georgia, serif",
    googleSpec: 'PT+Serif:ital,wght@0,400;0,700;1,400',
  },
  {
    id: 'dm-serif',
    label: 'DM Serif Display',
    category: 'classic',
    stack: 'DM Serif Display, Georgia, serif',
    // Already in styles/theme.css — it is one of the generator's DISPLAY_FONTS,
    // so it loads app-wide for the free-form renderer.
    alreadyLoaded: true,
  },
  {
    id: 'georgia',
    label: 'Georgia',
    category: 'classic',
    stack: "Georgia, 'Times New Roman', serif",
    alreadyLoaded: true, // system face — nothing to fetch
  },

  // ── Modern / sans ─────────────────────────────────────────────────
  {
    id: 'source-sans',
    label: 'Source Sans 3',
    category: 'modern',
    stack: "'Source Sans 3', system-ui, sans-serif",
    alreadyLoaded: true,
  },
  {
    id: 'inter',
    label: 'Inter',
    category: 'modern',
    stack: "'Inter', system-ui, sans-serif",
    googleSpec: 'Inter:wght@400;500;600;700;800',
  },
  {
    id: 'montserrat',
    label: 'Montserrat',
    category: 'modern',
    stack: "'Montserrat', system-ui, sans-serif",
    googleSpec: 'Montserrat:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400',
  },
  {
    id: 'poppins',
    label: 'Poppins',
    category: 'modern',
    stack: "'Poppins', system-ui, sans-serif",
    googleSpec: 'Poppins:ital,wght@0,400;0,500;0,600;0,700;1,400',
  },
  {
    id: 'work-sans',
    label: 'Work Sans',
    category: 'modern',
    stack: "'Work Sans', system-ui, sans-serif",
    googleSpec: 'Work+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400',
  },
  {
    id: 'oswald',
    label: 'Oswald',
    category: 'modern',
    stack: "'Oswald', 'Arial Narrow', sans-serif",
    googleSpec: 'Oswald:wght@400;500;600;700',
  },
  {
    id: 'archivo',
    label: 'Archivo',
    category: 'modern',
    stack: "'Archivo', system-ui, sans-serif",
    googleSpec: 'Archivo:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400',
  },
  {
    id: 'arial',
    label: 'Arial',
    category: 'modern',
    stack: 'Arial, Helvetica, sans-serif',
    alreadyLoaded: true, // system face — nothing to fetch
  },

  // ── Script / display ──────────────────────────────────────────────
  {
    id: 'dancing-script',
    label: 'Dancing Script',
    category: 'script',
    stack: "'Dancing Script', cursive",
    googleSpec: 'Dancing+Script:wght@400;500;600;700',
  },
  {
    id: 'great-vibes',
    label: 'Great Vibes',
    category: 'script',
    stack: "'Great Vibes', cursive",
    googleSpec: 'Great+Vibes',
  },
  {
    id: 'pacifico',
    label: 'Pacifico',
    category: 'script',
    stack: "'Pacifico', cursive",
    googleSpec: 'Pacifico',
  },
  {
    id: 'parisienne',
    label: 'Parisienne',
    category: 'script',
    stack: "'Parisienne', cursive",
    googleSpec: 'Parisienne',
  },
];

const BY_ID = new Map(FONT_REGISTRY.map((f) => [f.id, f]));

export function getFontDef(id: string): FontDef | undefined {
  return BY_ID.get(id);
}

/**
 * The first real family in a CSS stack, normalised for comparison:
 * `"'Playfair Display', Georgia, serif"` → `"playfair display"`.
 *
 * This mirrors how the SERVER resolves a stack to font metrics
 * (lib/magazineV2/fontMetrics.ts `splitStack`), so the face the editor claims to
 * be showing is the same one the layout engine measured against.
 */
export function primaryFamily(stack: string): string {
  return (stack.split(',')[0] ?? '').trim().replace(/^['"]+|['"]+$/g, '').toLowerCase();
}

const BY_PRIMARY = new Map(FONT_REGISTRY.map((f) => [primaryFamily(f.stack), f]));

/**
 * Match a stored CSS stack back to its registry entry by PRIMARY family.
 *
 * Exact-string matching is not usable here: the same face reaches an element
 * spelled several ways ("Georgia, serif" from a hand-added text box,
 * "Georgia, 'Times New Roman', serif" from a template, a quoted variant from a
 * PDF extraction). Comparing only the first family means all of them resolve to
 * one option instead of leaving the picker blank — which read as "the font
 * control does nothing".
 *
 * Returns undefined for a genuinely unknown family, which the picker shows as-is
 * rather than silently retyping the element.
 */
export function findFontByStack(stack: string | undefined): FontDef | undefined {
  return stack ? BY_PRIMARY.get(primaryFamily(stack)) : undefined;
}

export const FONTS_BY_CATEGORY: Record<FontCategory, FontDef[]> = {
  modern: FONT_REGISTRY.filter((f) => f.category === 'modern'),
  classic: FONT_REGISTRY.filter((f) => f.category === 'classic'),
  script: FONT_REGISTRY.filter((f) => f.category === 'script'),
};

/** Combined Google Fonts stylesheet href for every font that needs loading. */
export function buildGoogleFontsHref(): string {
  const families = FONT_REGISTRY.filter((f) => f.googleSpec)
    .map((f) => `family=${f.googleSpec}`)
    .join('&');
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}
